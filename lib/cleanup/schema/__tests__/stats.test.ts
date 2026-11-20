/** Rule stats and run entries (TS 3.4): the builders parse, bad parts drop alone with no throw, and the log holds paths only. */

const mockWarn = jest.fn()
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: (...args: unknown[]) => mockWarn(...args), error: jest.fn() }),
}))

import { buildBlock, buildRuleStats } from "@/lib/cleanup/__tests__/helpers/builders"
import { DRY_RUNS_KEPT, parseRuleStats, parseRunEntries, ruleStatsSchema, runRuleEntrySchema } from "@/lib/cleanup/schema/stats"

beforeEach(() => mockWarn.mockClear())

const entry = { ruleId: "rule-1", mode: "reviewFirst", matches: 24, joined: 3, held: 0, rescued: 1, deleted: 2, failed: 0, blocks: [buildBlock()] }

describe("ruleStatsSchema", () => {
  it("parses the builder output, with snapshotId and definitionHash on each dry run", () => {
    const stats = buildRuleStats()
    expect(ruleStatsSchema.parse(stats)).toEqual(stats)
    expect(parseRuleStats(stats)).toEqual(stats)
    expect(stats.dryRuns.every((run) => run.snapshotId && run.definitionHash)).toBe(true)
  })

  it("defaults the stored {} of a new rule", () => {
    expect(parseRuleStats({})).toEqual({ v: 1, dryRuns: [] })
    expect(parseRuleStats(undefined)).toEqual({ v: 1, dryRuns: [] })
    expect(mockWarn).not.toHaveBeenCalled()
  })

  it("holds at most 5 poster keys and 30 dry runs", () => {
    const stats = buildRuleStats()
    expect(ruleStatsSchema.safeParse({ ...stats, lastEval: { ...stats.lastEval, largest: ["1", "2", "3", "4", "5", "6"] } }).success).toBe(false)
    expect(ruleStatsSchema.safeParse({ ...stats, dryRuns: Array.from({ length: 31 }, () => stats.dryRuns[0]) }).success).toBe(false)
  })
})

describe("parseRuleStats", () => {
  it("drops a bad lastEval alone and keeps the dry runs", () => {
    const stats = buildRuleStats()
    const parsed = parseRuleStats({ ...stats, lastEval: { ...stats.lastEval, matches: "many" } })
    expect(parsed).toEqual({ v: 1, dryRuns: stats.dryRuns })
    expect(mockWarn).toHaveBeenCalledWith("cleanup.parse_dropped", { document: "ruleStats", dropped: 1, paths: ["lastEval.matches"] })
  })

  it("drops a bad dry run alone, and returns them oldest first, at most 30", () => {
    const stats = buildRuleStats()
    const [older, newer] = stats.dryRuns
    expect(parseRuleStats({ dryRuns: [newer, { ...older, definitionHash: undefined }, older] }).dryRuns).toEqual([older, newer])
    expect(mockWarn).toHaveBeenCalledWith("cleanup.parse_dropped", { document: "ruleStats.dryRuns", dropped: 1, paths: ["definitionHash"] })
    const many = Array.from({ length: 40 }, (_, i) => ({ ...older, runId: `run-${i}`, at: new Date(Date.UTC(2026, 0, 1 + i)).toISOString() }))
    const kept = parseRuleStats({ dryRuns: many.slice().reverse() }).dryRuns
    expect(kept).toHaveLength(DRY_RUNS_KEPT)
    expect(kept.map((run) => run.runId)).toEqual(many.slice(10).map((run) => run.runId))
  })

  it.each([["stats"], [[1]], [7]])("never throws on %j and logs the root", (raw) => {
    expect(parseRuleStats(raw)).toEqual({ v: 1, dryRuns: [] })
    expect(mockWarn).toHaveBeenCalledWith("cleanup.parse_dropped", { document: "ruleStats", dropped: 1, paths: ["(root)"] })
  })
})

describe("run entries", () => {
  it("parse a good entry and drop a bad one", () => {
    expect(runRuleEntrySchema.parse(entry)).toEqual(entry)
    expect(parseRunEntries([entry, { ...entry, mode: "manual" }])).toEqual([entry])
    expect(mockWarn).toHaveBeenCalledWith("cleanup.parse_dropped", { document: "runEntries", dropped: 1, paths: ["mode"] })
    expect(parseRunEntries(null)).toEqual([])
  })
})
