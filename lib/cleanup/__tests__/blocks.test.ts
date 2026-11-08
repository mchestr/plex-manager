/** Safety stops and run outcomes (TS 8.2, UX 8.7, X6): every label and cause, the counted words, NO_OWNER and the raw fallback. */

const mockWarn = jest.fn()
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: (...args: unknown[]) => mockWarn(...args), error: jest.fn() }),
}))

import { buildBlock } from "@/lib/cleanup/__tests__/helpers/builders"
import {
  type Block,
  BLOCK_CODES,
  blockCause,
  blockLabel,
  blockSchema,
  COUNTED_WORDS,
  NO_OWNER_ERROR_CODE,
  NO_OWNER_WORDS,
  parseBlocks,
  RUN_OUTCOMES,
} from "@/lib/cleanup/blocks"
import type { Service } from "@/lib/validations/cleanup-vocabulary"

const NAMES: Record<Service, string> = { plex: "Plex", tautulli: "Tautulli", overseerr: "Overseerr", radarr: "Radarr", sonarr: "Sonarr" }
const words = { service: (s: Service) => NAMES[s], rule: (id: string) => (id === "r1" ? "Movies nobody watches" : "A deleted rule"), time: () => "3:07 AM" }
const READ_AT = "2026-11-08T11:07:00.000Z"

const CASES: [Block, string, string][] = [
  [{ code: "sourceFailed", service: "sonarr", readAt: READ_AT }, "Safety stop: Sonarr did not answer", "Sonarr did not answer at 3:07 AM."],
  [{ code: "sourceFailed", service: "tautulli" }, "Safety stop: Tautulli did not answer", "Tautulli did not answer."],
  [{ code: "tautulliStale" }, "Safety stop: Tautulli recorded no play in 14 days", "Tautulli recorded no play in 14 days."],
  [{ code: "historyShort", ruleId: "r1", days: 365 }, "Safety stop: Tautulli history is shorter than the window of Movies nobody watches", "Tautulli history is shorter than the 365-day window."],
  [{ code: "historyShort" }, "Safety stop: Tautulli history is shorter than the window of the rule", "Tautulli history is shorter than the window of the rule."],
  [{ code: "dataStale", hours: 41 }, "Safety stop: library data is 41 hours old", "Library data is 41 hours old."],
  [{ code: "dataStale" }, "Safety stop: library data is too old", "Library data is too old."],
  [{ code: "noData" }, "Safety stop: no library data yet", "No library data yet."],
  [
    { code: "sourceShrank", service: "overseerr", counter: "overseerrRequests", rows: 0, previousRows: 312 },
    "Safety stop: Overseerr returned 0 requests, 312 before",
    "Overseerr returned 0 requests, 312 before. If you expect this, press Refresh data now: a read that you start and that agrees clears this stop.",
  ],
  [{ code: "readFailed" }, "Safety stop: tonight's library read failed, so nothing was deleted", "Tonight's library read failed."],
  [{ code: "off" }, "Paused: nothing changed", "Media cleanup is off."],
  [{ code: "paused" }, "Paused: nothing changed", "Cleanup is paused."],
  [{ code: "redis" }, "Not started: Redis is not set up", "Redis is not set up."],
  [{ code: "busy" }, "Not started: another run was in progress", "Another run was in progress."],
  [{ code: "auditFailed" }, "Stopped: the app did not write an audit row", "The app did not write an audit row."],
  [{ code: "stopped" }, "Stopped: the server shut down", "The server shut down."],
  [{ code: "arrRefused", service: "radarr" }, "Stopped: Radarr refused the API key", "Radarr refused the API key."],
]

beforeEach(() => mockWarn.mockClear())

describe("block codes", () => {
  it("hold the codes and outcomes of TS 8.2", () => {
    expect(BLOCK_CODES).toEqual(["off", "paused", "redis", "noData", "dataStale", "sourceFailed", "tautulliStale",
      "historyShort", "sourceShrank", "readFailed", "busy", "auditFailed", "stopped", "arrRefused"])
    expect(RUN_OUTCOMES).toEqual(["finished", "dryRun", "blocked", "held", "paused", "busy", "stopped", "auditFailed", "arrRefused", "noData"])
  })

  it("has words for every code", () => {
    const covered = new Set(CASES.map(([block]) => block.code))
    expect(BLOCK_CODES.filter((code) => !covered.has(code))).toEqual([])
  })
})

describe("blockLabel and blockCause", () => {
  it.each(CASES)("%j reads %j, cause %j", (block, label, cause) => {
    expect(blockSchema.parse(block)).toEqual(block)
    expect(blockLabel(block, words)).toBe(label)
    expect(blockCause(block, words)).toBe(cause)
  })

  it.each([
    ["overseerrRequests", "overseerr", "Overseerr returned 0 requests, 312 before"],
    ["tautulliRows", "tautulli", "Tautulli returned 0 plays in the history, 312 before"],
    ["usersWithPlay", "tautulli", "Tautulli returned 0 members with a play, 41 before"],
  ] as const)("names the counted thing of %s", (counter, service, text) => {
    const block: Block = { code: "sourceShrank", service, counter, rows: 0, previousRows: counter === "usersWithPlay" ? 41 : 312 }
    expect(COUNTED_WORDS[counter]).toBeTruthy()
    expect(blockLabel(block, words)).toBe(`Safety stop: ${text}`)
    expect(blockCause(block, words)).toMatch(new RegExp(`^${text}\\. If you expect this`))
  })

  it("reads a shrink with no counter or no service plainly", () => {
    expect(blockLabel({ code: "sourceShrank", rows: 3, previousRows: 40 }, words)).toBe("Safety stop: A service returned 3, 40 before")
    expect(blockLabel({ code: "sourceShrank" }, words)).toBe("Safety stop: A service returned 0, 0 before")
  })

  it("gives the NO_OWNER words to a Plex failure with that code (safety-r2-11)", () => {
    const block = buildBlock({ service: "plex", errorCode: NO_OWNER_ERROR_CODE })
    expect(blockLabel(block, words)).toBe("Safety stop: Plex has no owner account for this server")
    expect(blockCause(block, words)).toBe("Plex has no owner account for this server. Reconnect Plex in Settings.")
    expect(NO_OWNER_WORDS).toEqual({ outcome: blockLabel(block, words), cause: blockCause(block, words) })
    expect(blockLabel(buildBlock({ service: "plex", errorCode: "TIMEOUT" }), words)).toBe("Safety stop: Plex did not answer")
  })

  it("shows an unknown stored code raw", () => {
    expect(blockLabel({ code: "invalid" }, words)).toBe("invalid")
    expect(blockCause({ code: "fromANewerBuild" }, words)).toBe("fromANewerBuild")
  })
})

describe("parseBlocks", () => {
  it("keeps good blocks and drops bad ones, logging paths only", () => {
    const good = buildBlock()
    expect(parseBlocks([good, { code: "x".repeat(41) }, { code: "busy", service: "jellyfin" }])).toEqual([good])
    expect(mockWarn).toHaveBeenCalledWith("cleanup.parse_dropped", { document: "blocks", dropped: 2, paths: ["code", "service"] })
    expect(parseBlocks(undefined)).toEqual([])
  })
})
