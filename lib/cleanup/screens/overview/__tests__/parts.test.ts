/**
 * @jest-environment node
 */

/**
 * The pure parts of the Rules tab data: the page stops of the snapshot (UX
 * 4.1.4), the Kometa notice window (X9), the next leave date with the hold
 * date, the batch lines, the rule card footer words of each rescue reason,
 * and an evaluation of a level with no library data.
 */

import { buildCleanupItem } from "@/__tests__/helpers/cleanup-factories"
import { buildOptions, buildSnapshotFacts, daysAgo, NOW } from "@/lib/cleanup/__tests__/helpers/builders"
import type { Batch } from "@/lib/cleanup/run/batches"
import { overviewBatches } from "@/lib/cleanup/screens/overview/batches"
import { evaluateDefinition, posterKeys } from "@/lib/cleanup/screens/overview/evaluate"
import { levelOf, nextLeave } from "@/lib/cleanup/screens/overview/library"
import { kometaNotice, pageBlocks } from "@/lib/cleanup/screens/overview/page-blocks"
import { rescueReason, ruleFooter, titleWords } from "@/lib/cleanup/screens/overview/rule-footer"
import { realContext } from "@/lib/cleanup/preview/__tests__/helpers/preview-data"
import { MOVIE_DEFINITION, SOURCES } from "@/lib/cleanup/screens/overview/__tests__/fixtures"

const HOUR = 3_600_000
const snapshotAt = (finishedAt: number, overrides: { sources?: typeof SOURCES; newestAt?: number | null } = {}) => {
  const facts = buildSnapshotFacts()
  return { finishedAt: new Date(finishedAt), sources: overrides.sources ?? SOURCES,
    facts: { ...facts, history: { ...facts.history, newestAt: overrides.newestAt === undefined ? facts.history.newestAt : overrides.newestAt } } }
}

describe("pageBlocks", () => {
  it("gives no stop without a snapshot, and none for fresh data with every source ok", () => {
    expect(pageBlocks(null, NOW)).toEqual([])
    expect(pageBlocks(snapshotAt(NOW), NOW)).toEqual([])
  })

  it("names stale data, each failed source once, a silent Tautulli and a shrunk source", () => {
    const failed = SOURCES.flatMap((s) => {
      if (s.service === "plex") return [{ ...s, state: "failed" as const, errorCode: "NO_OWNER", part: "shares" as const }, { ...s, state: "failed" as const,
        errorCode: "NO_OWNER", part: "shares" as const }]
      return s.service === "overseerr" ? [{ ...s, rows: 0 }] : [s]
    })

    expect(pageBlocks(snapshotAt(NOW - 41 * HOUR, { sources: failed, newestAt: daysAgo(20) }), NOW)).toEqual([
      { code: "dataStale", hours: 41 },
      { code: "sourceFailed", service: "plex", readAt: new Date(NOW).toISOString(), errorCode: "NO_OWNER" },
      { code: "tautulliStale" },
      { code: "sourceShrank", service: "overseerr", counter: "overseerrRequests", rows: 0, previousRows: 300 },
    ])
  })

  it("reads a Tautulli with no play at all as silent, and a failed or missing one as not", () => {
    expect(pageBlocks(snapshotAt(NOW, { newestAt: null }), NOW)).toEqual([{ code: "tautulliStale" }])
    const noTautulli = SOURCES.filter((s) => s.service !== "tautulli")
    expect(pageBlocks(snapshotAt(NOW, { sources: noTautulli, newestAt: null }), NOW)).toEqual([])
  })
})

describe("kometaNotice", () => {
  const notice = (days: number, title: string) => ({ kind: "collectionRemoved" as const, key: "1:movie", title, sectionId: "1",
    detectedAt: new Date(NOW - days * 24 * HOUR).toISOString(), recreatedAt: null })

  it("is the newest removal in the last 30 days", () => {
    expect(kometaNotice({ notices: [notice(40, "Old"), notice(5, "Older"), notice(1, "Newest")] }, NOW))
      .toEqual({ collection: "Newest", removedAt: new Date(NOW - 24 * HOUR).toISOString(), recreatedAt: null })
    expect(kometaNotice({ notices: [notice(31, "Old")] }, NOW)).toBeUndefined()
  })
})

describe("the next leave date and the level words", () => {
  const row = (key: string, leaveOn: string | null, state = "leaving") => buildCleanupItem({ itemKey: key, leaveOn, state })

  it("is the earliest day a leaving row can go, after the hold, without the skipped rows", () => {
    const rows = [row("a", "2026-11-01"), row("b", "2026-11-20"), row("c", "2026-11-05", "approved"), row("d", null), row("e", "2026-11-03")]

    expect(nextLeave(rows, "2026-11-08", null, new Set(["a"]))).toEqual({ day: "2026-11-08", count: 1 })
    expect(nextLeave(rows, "2026-11-08", "2026-11-12")).toEqual({ day: "2026-11-12", count: 2 })
    expect(nextLeave([row("x", null)], "2026-11-08", null)).toBeNull()
  })

  it("names one level, or none for mixed levels and unknown values", () => {
    expect(levelOf(["movie", "movie"])).toBe("movie")
    expect(levelOf(["movie", "show"])).toBeNull()
    expect(levelOf([])).toBeNull()
    expect(levelOf(["film"])).toBeNull()
  })
})

describe("overviewBatches", () => {
  const batch = (overrides: Partial<Batch>): Batch => ({ id: "entry-r1", kind: "entry", ruleId: "r1", items: [], keysHash: "h", count: 0, bytes: 0n,
    action: null, actionCounts: {}, exclusionCount: 0, importListExclusion: false, dueSince: null, dueAt: null, plan: null, oversize: [], ...overrides })

  it("skips a batch whose rule is gone, and reads a held row with no date as held today", () => {
    const held = buildCleanupItem({ state: "held", heldAt: null, level: "season", ruleIds: ["r1"] })
    const lines = overviewBatches({ deletion: [batch({ id: "deletion-gone", kind: "deletion", ruleId: "gone" })], entry: [batch({ items: [held], count: 1 })] },
      new Map([["r1", { name: "Seasons", level: "season" as const }]]), "2026-11-08", "UTC")

    expect(lines).toEqual([{ id: "entry-r1", kind: "entry", ruleId: "r1", ruleName: "Seasons", level: "season", count: 1, bytes: "0", dueAt: "2026-11-08",
      dueSince: "2026-11-08" }])
  })

  it("takes the rule's level for an empty batch, and today for a deletion batch without dates", () => {
    const lines = overviewBatches({ deletion: [batch({ id: "deletion-r1", kind: "deletion" })], entry: [] },
      new Map([["r1", { name: "Shows", level: "show" as const }]]), "2026-11-08", "UTC")

    expect(lines[0]).toMatchObject({ level: "show", dueAt: "2026-11-08", dueSince: "2026-11-08" })
  })
})

describe("the rule card footer", () => {
  const words = { definition: { ...MOVIE_DEFINITION, protections: [{ id: "p1", field: "request.exists" as const, op: "is" as const,
    value: { exists: true } }] }, protections: buildOptions().protections, names: { memberName: () => null } }
  const rescue = (reason: string, detail = {}) => rescueReason({ reason, detail }, words)

  it("words each rescue reason", () => {
    expect(rescue("protected", { protectionId: "g4" })).toBe("Played by anyone in the last 30 days.")
    expect(rescue("protected", { protectionId: "p1" })).toMatch(/\.$/)
    expect(rescue("conditionFailed", { conditionId: "c1" })).toBe("It no longer matches: Last played.")
    expect(rescue("conditionFailed", { conditionId: "c9" })).toBe("It no longer matches: a condition.")
    expect(rescue("failed", { code: "TIMEOUT" })).toBe("The delete failed.")
    expect(rescue("kept", { stillUnmonitored: "radarr" })).toBe("A member kept it. Still unmonitored in Radarr.")
    expect(rescueReason({ reason: "conditionFailed", detail: { conditionId: "c1" } }, { ...words, definition: null })).toBe("It no longer matches: a condition.")
  })

  it("names a season with its number", () => {
    expect(titleWords("Invented Show", 4)).toBe("Invented Show, Season 4")
    expect(titleWords("Invented Movie", null)).toBe("Invented Movie")
  })

  it("is null for a live rule with nothing to say, and no ready line without checks", () => {
    const runs = { count: 3, firstAt: null, min: 1, max: 1, steady: true }
    const base = { blocks: [], runs, checks: null, readAt: null, overlap: null, rescue: undefined, words }
    expect(ruleFooter({ ...base, mode: "dryRun" })).toBeNull()
    expect(ruleFooter({ ...base, mode: "automatic" })).toBeNull()
  })
})

describe("evaluateDefinition", () => {
  it("is null for a level with no library data, with no posters", () => {
    const evaluation = evaluateDefinition(MOVIE_DEFINITION, { movie: null, show: null, season: null }, realContext())
    expect(evaluation).toBeNull()
    expect(posterKeys(evaluation, 4)).toEqual([])
  })
})
