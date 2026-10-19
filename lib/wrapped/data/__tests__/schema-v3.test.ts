/**
 * The strict v3 schema and the Zod-read `PlexWrapped.status`.
 */

import { readWrappedStatus } from "@/lib/wrapped/data/parse-stored"
import { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"

import { minimalV3 } from "./v3-row"

const mockWarn = jest.fn()

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ warn: (...args: unknown[]) => mockWarn(...args), info: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}))

describe("RewindDataV3", () => {
  it("accepts a minimal v3 row", () => {
    expect(RewindDataV3.safeParse(minimalV3()).success).toBe(true)
  })

  it("rejects an extra top-level key", () => {
    const result = RewindDataV3.safeParse({ ...minimalV3(), leaderboards: [] })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({ code: "unrecognized_keys", keys: ["leaderboards"] })
  })

  it("rejects an extra key in a nested object", () => {
    const row = minimalV3()

    expect(RewindDataV3.safeParse({ ...row, window: { ...row.window, server: "x" } }).success).toBe(false)
  })

  it.each([
    ["an unknown page type", { pages: [{ type: "leaderboard", data: {} }] }],
    ["an unknown edition", { edition: "deluxe" }],
    ["a generatedAt that is not an ISO date-time", { generatedAt: "yesterday" }],
    ["a window date that is not an ISO date", { window: { from: "1 Jan", through: "2026-11-30", zone: "UTC", finalCut: false } }],
    ["another version", { version: 2 }],
  ])("rejects %s", (_label, change) => {
    expect(RewindDataV3.safeParse({ ...minimalV3(), ...change }).success).toBe(false)
  })

  it("accepts a full issue with copy and an archetype", () => {
    const row = {
      ...minimalV3(),
      edition: "full",
      archetype: {
        id: "midnight-marathoner",
        runnerUp: "loyalist",
        evidence: ["hours.afterDarkShare"],
        shortlist: [
          { id: "midnight-marathoner", score: 84 },
          { id: "loyalist", score: 60 },
        ],
        llmMayChoose: false,
        rarity: { count: 6, of: 31 },
      },
      copy: {
        decks: {
          number: "A deck.",
          bookends: null,
          topShows: null,
          topFilms: null,
          taste: null,
          people: null,
          clock: null,
          calendar: null,
          records: null,
          requests: null,
          standing: null,
          nextYear: null,
        },
        archetype: { id: "midnight-marathoner", tagline: "t", dedication: "d", posterLineId: "mm.1" },
        signOff: null,
      },
      copySource: "mixed",
    }

    expect(RewindDataV3.safeParse(row).success).toBe(true)
  })

  it("rejects a fact id outside the catalogue", () => {
    const facts = { "time.totalHourz": { value: 1, display: "1", unit: "hours" } }

    expect(RewindDataV3.safeParse({ ...minimalV3(), facts }).success).toBe(false)
  })

  it("rejects a poster line that is not one of the archetype catalogue's ids", () => {
    const copy = {
      decks: Object.fromEntries(
        ["number", "bookends", "topShows", "topFilms", "taste", "people", "clock", "calendar", "records", "requests", "standing", "nextYear"].map(
          (slot) => [slot, null]
        )
      ),
      archetype: { id: "midnight-marathoner", tagline: "t", dedication: "d", posterLineId: "mm.6" },
      signOff: null,
    }

    expect(RewindDataV3.safeParse({ ...minimalV3(), copy }).success).toBe(false)
    expect(RewindDataV3.safeParse({ ...minimalV3(), copy: { ...copy, archetype: { ...copy.archetype, posterLineId: "mm.5" } } }).success).toBe(true)
  })

  it("rejects a fact with an unknown unit", () => {
    const facts = { "time.totalMinutes": { value: 12, display: "12 minutes", unit: "minutes" } }

    expect(RewindDataV3.safeParse({ ...minimalV3(), facts }).success).toBe(false)
  })
})

describe("readWrappedStatus", () => {
  beforeEach(() => mockWarn.mockClear())

  it.each(["pending", "generating", "completed", "failed"])("reads %s", (status) => {
    expect(readWrappedStatus(status, "row-1")).toBe(status)
    expect(mockWarn).not.toHaveBeenCalled()
  })

  it("reads an unknown status as failed, with a warning that logs only the row id", () => {
    expect(readWrappedStatus("queued", "row-1")).toBe("failed")

    expect(mockWarn).toHaveBeenCalledTimes(1)
    expect(mockWarn).toHaveBeenCalledWith("Unknown Rewind status read as failed", { wrappedId: "row-1" })
  })

  it("matches the JSDoc example", () => {
    expect(readWrappedStatus("completed", "row-1")).toBe("completed")
    expect(readWrappedStatus("queued", "row-1")).toBe("failed")
  })
})
