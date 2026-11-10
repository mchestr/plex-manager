/**
 * @jest-environment node
 */

/**
 * Reconcile (TS 8.4, E14, E21, E31, E32, owner-r3-1, owner-r4-2,
 * safety-r4-3): each step and each reason, the `ruleIds` form, a held item
 * that another rule joins, the season raise, the managed copy that moves,
 * the approval check, zero-row writes, and the released audit rows.
 */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}))
const mockLog = jest.fn()
const mockRecord = jest.fn()
jest.mock("@/lib/security/audit-log", () => ({
  ...jest.requireActual("@/lib/security/audit-log"),
  logAuditEvent: (...args: unknown[]) => mockLog(...args),
  recordAuditEvent: (...args: unknown[]) => mockRecord(...args),
}))

import { mockReset } from "jest-mock-extended"

import { buildCleanupItem, buildCleanupSettings } from "@/__tests__/helpers/cleanup-factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import {
  buildCondition,
  buildDefinition,
  buildEvalContext,
  buildMovieItem,
  buildOptions,
  buildSeasonItem,
  buildShowItem,
  buildSnapshotFacts,
  buildSourceStatuses,
  globalsOf,
  NOW,
  NOW_S,
  stubEvals,
  stubGlobal,
  type VerdictTable,
} from "@/lib/cleanup/__tests__/helpers/builders"
import type { Block } from "@/lib/cleanup/blocks"
import { compileDefinition } from "@/lib/cleanup/engine/compile"
import type { GlobalProtectionEval } from "@/lib/cleanup/engine/types"
import { type LiveRule, reconcile, type ReconcileContext } from "@/lib/cleanup/run/reconcile"
import type { SnapshotItem, SourceState, SourceStatus } from "@/lib/cleanup/schema/snapshot"
import type { LoadedSnapshot, SnapshotLevel } from "@/lib/cleanup/snapshot/cache"
import type { CleanupItem } from "@/lib/generated/prisma/client"
import { AuditEventType } from "@/lib/security/audit-log"
import type { RuleDefinition } from "@/lib/validations/cleanup-rule"
import { type Level, type Mode, type Service, SERVICES } from "@/lib/validations/cleanup-vocabulary"

const MOVIE = buildMovieItem()
const OTHER_MOVIE = buildMovieItem({ key: "movie:tmdb:1002", titleKey: "tmdb:1002", sectionId: "3", ratingKey: "5002", copies: [{ ratingKey: "5002", sectionId: "3" }] })
const SHOW = buildShowItem()
const SEASON = buildSeasonItem(SHOW, 1)
const DELETE: RuleDefinition["then"] = { graceDays: 30, action: "movie.delete", importListExclusion: true }
const UNMONITOR: RuleDefinition["then"] = { graceDays: 30, action: "movie.unmonitorDeleteFiles", importListExclusion: false }
const SEASONS = buildDefinition({ level: "season", libraries: ["2"], then: { graceDays: 30, action: "season.unmonitorDeleteFiles", importListExclusion: false } })

function rule(id: string, overrides: Partial<RuleDefinition> = {}, extra: { mode?: Mode; blocks?: Block[]; createdAt?: string } = {}): LiveRule {
  const definition = buildDefinition({ libraries: ["1", "3"], ...overrides })
  return { id, mode: extra.mode ?? "automatic", revision: 1, createdAt: new Date(extra.createdAt ?? "2026-01-01T00:00:00Z"), definition,
    compiled: compileDefinition(definition), blocks: extra.blocks ?? [] }
}

const levelOf = (level: Level, items: SnapshotItem[]): SnapshotLevel =>
  ({ level, items: items.filter((i) => i.level === level), byKey: new Map(items.filter((i) => i.level === level).map((i) => [i.key, i])), byTitleKey: new Map() })

interface ContextInput {
  rules: LiveRule[]
  items?: SnapshotItem[]
  table?: VerdictTable
  globals?: GlobalProtectionEval[]
  sources?: SourceStatus[]
  missing?: Level[]
  snapshot?: boolean
}

function contextOf(input: ContextInput): ReconcileContext {
  const items = input.items ?? [MOVIE, OTHER_MOVIE, SHOW, SEASON]
  const sources = input.sources ?? buildSourceStatuses()
  const levels = { movie: levelOf("movie", items), show: levelOf("show", items), season: levelOf("season", items) }
  for (const level of input.missing ?? []) (levels as Record<Level, SnapshotLevel | null>)[level] = null
  const snapshot: LoadedSnapshot = {
    header: { id: "snap-2", status: "complete", trigger: "scheduled", actorId: null, startedAt: new Date(NOW), finishedAt: new Date(NOW), sources,
      facts: buildSnapshotFacts() },
    levels,
  }
  const states = Object.fromEntries(SERVICES.map((service) => [service, sources.find((s) => s.service === service)?.state ?? "failed"]))
  const evaluation = buildEvalContext({ evals: stubEvals(input.table ?? {}), globals: globalsOf(input.globals ?? []),
    sources: states as Record<Service, SourceState> })
  return {
    now: new Date(NOW), today: "2026-11-08", zone: "UTC", runId: "run-9", actorId: "system",
    settings: { ...buildCleanupSettings({ enabled: true }), options: buildOptions(), runtime: { collections: {}, notices: [] } },
    snapshot: input.snapshot === false ? null : snapshot, evaluation: input.snapshot === false ? null : evaluation,
    rules: new Map(input.rules.map((r) => [r.id, r])),
  }
}

const row = (overrides: Partial<CleanupItem> = {}) => buildCleanupItem({
  id: "item-1", itemKey: MOVIE.key, titleKey: MOVIE.titleKey, sectionId: "1", ratingKey: "5001", ruleIds: ["rule-a"], action: "movie.delete",
  importListExclusion: true, enteredAt: new Date("2026-10-01T00:00:00Z"), leaveOn: "2026-11-30", updatedAt: new Date("2026-11-08T03:00:00Z"), ...overrides,
})

const updates = () => prismaMock.cleanupItem.updateMany.mock.calls.map(([args]) => ({ where: args.where ?? {}, data: args.data }))
const outcomes = () => prismaMock.cleanupOutcome.create.mock.calls.map(([args]) => args.data)

beforeEach(() => {
  mockReset(prismaMock)
  mockLog.mockReset()
  mockRecord.mockReset()
  prismaMock.$transaction.mockImplementation(((fn: (client: unknown) => unknown) => fn(prismaMock)) as never)
  prismaMock.cleanupItem.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.cleanupItem.deleteMany.mockResolvedValue({ count: 1 })
  prismaMock.cleanupOutcome.create.mockResolvedValue({ id: "outcome" } as never)
})

describe("reconcile: the rows it reads", () => {
  it("reads every row that is not being deleted, or only the rows that hold one of ruleIds", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([])
    const ctx = contextOf({ rules: [rule("rule-a")] })
    await expect(reconcile({ ctx })).resolves.toEqual({ checked: 0, rescued: 0, released: 0, updated: 0, skipped: 0, rescuedByRule: {} })
    await reconcile({ ctx, ruleIds: ["rule-a"] })

    expect(prismaMock.cleanupItem.findMany.mock.calls.map(([args]) => args?.where)).toEqual([
      { state: { in: ["held", "leaving", "approved"] } },
      { state: { in: ["held", "leaving", "approved"] }, ruleIds: { hasSome: ["rule-a"] } },
    ])
  })
})

describe("reconcile: step 6, a match", () => {
  it("updates the row optimistically with the merge, the snapshot facts, the Why, checkedAt, lastRunId and no hold code", async () => {
    const stored = row({ holdCode: "sourceFailed:tautulli", sizeBytes: 1n })
    prismaMock.cleanupItem.findMany.mockResolvedValue([stored])

    const result = await reconcile({ ctx: contextOf({ rules: [rule("rule-a", { then: DELETE })] }) })

    expect(result).toEqual(expect.objectContaining({ checked: 1, updated: 1, rescued: 0 }))
    const [update] = updates()
    expect(update.where).toEqual({ id: "item-1", updatedAt: stored.updatedAt })
    expect(update.data).toEqual(expect.objectContaining({
      ruleIds: ["rule-a"], action: "movie.delete", importListExclusion: true, needsApproval: false, leaveOn: "2026-11-30", holdCode: null,
      title: MOVIE.title, year: 2019, sectionId: "1", ratingKey: "5001", sizeBytes: BigInt(MOVIE.sizeBytes ?? 0), episodeCount: null, seasonCount: null,
      checkedAt: new Date(NOW), lastRunId: "run-9",
    }))
    expect(update.data.why).toEqual(expect.objectContaining({ v: 1, snapshotId: "snap-2", ruleId: "rule-a" }))
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("writes sectionId and ratingKey together when the managed copy moved to another section (owner-r4-2)", async () => {
    const moved = { ...MOVIE, sectionId: "3", ratingKey: "7001", copies: [{ ratingKey: "7001", sectionId: "3" }] }
    prismaMock.cleanupItem.findMany.mockResolvedValue([row()])
    await reconcile({ ctx: contextOf({ rules: [rule("rule-a")], items: [moved] }) })
    expect(updates()[0].data).toEqual(expect.objectContaining({ sectionId: "3", ratingKey: "7001" }))
  })

  it("keeps an unknown verdict in Leaving soon with its cause as the hold code (step 3.4)", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([row()])
    const table = { [MOVIE.key]: { c1: { verdict: "unknown", cause: { kind: "sourceFailed", service: "tautulli" } } } } as VerdictTable
    await reconcile({ ctx: contextOf({ rules: [rule("rule-a")], table }) })
    expect(updates()[0].data).toEqual(expect.objectContaining({ holdCode: "sourceFailed:tautulli", ruleIds: ["rule-a"] }))
  })

  it("skips a write that matches zero rows, and never retries it (step 7)", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([row()])
    prismaMock.cleanupItem.updateMany.mockResolvedValue({ count: 0 })
    await expect(reconcile({ ctx: contextOf({ rules: [rule("rule-a")] }) })).resolves.toEqual(expect.objectContaining({ skipped: 1, updated: 0 }))
    expect(prismaMock.cleanupItem.updateMany).toHaveBeenCalledTimes(1)
  })
})

describe("reconcile: steps 1, 2 and 5, the exits", () => {
  it("releases a Leaving soon item whose last live rule is gone (ruleOff), with one released row per rule after the loop", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([row({ id: "a", ruleIds: ["rule-off"] }), row({ id: "b", itemKey: "movie:tmdb:9", ruleIds: ["rule-off"] })])

    // rule-a covers only library 3, so it does not join the movie
    const result = await reconcile({ ctx: contextOf({ rules: [rule("rule-a", { libraries: ["3"] })] }) })

    expect(result).toEqual(expect.objectContaining({ released: 2, rescued: 0 }))
    expect(outcomes().map((o) => [o.kind, o.reason])).toEqual([["released", "ruleOff"], ["released", "ruleOff"]])
    expect(mockRecord).not.toHaveBeenCalled()
    expect(mockLog).toHaveBeenCalledWith(AuditEventType.CLEANUP_ITEMS_RELEASED, "system",
      { ruleId: "rule-off", reason: "ruleOff", count: 2, itemKeys: [MOVIE.key, "movie:tmdb:9"], more: 0 })
  })

  it("releases a held item with no audit row of its own (members never saw it)", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([row({ state: "held", ruleIds: ["rule-off"], leaveOn: null, enteredAt: null, heldAt: new Date(NOW) })])
    await reconcile({ ctx: contextOf({ rules: [] }) })
    expect(outcomes().map((o) => [o.kind, o.reason])).toEqual([["released", "ruleOff"]])
    expect(mockLog).not.toHaveBeenCalled()
    expect(mockRecord).not.toHaveBeenCalled()
  })

  it("releases the items of a library a save removed from a live rule, and keeps the items of its other libraries (owner-r3-1)", async () => {
    const otherRow = row({ id: "other", itemKey: OTHER_MOVIE.key, titleKey: OTHER_MOVIE.titleKey, sectionId: "3", ratingKey: "5002" })
    prismaMock.cleanupItem.findMany.mockResolvedValue([row(), otherRow])

    await reconcile({ ctx: contextOf({ rules: [rule("rule-a", { libraries: ["3"] })] }) })

    expect(outcomes().map((o) => [o.itemKey, o.kind, o.reason])).toEqual([[MOVIE.key, "released", "libraryRemoved"]])
    expect(updates().map((u) => (u.where as { id: string }).id)).toEqual(["other"])
    expect(mockLog).toHaveBeenCalledWith(AuditEventType.CLEANUP_ITEMS_RELEASED, "system",
      expect.objectContaining({ ruleId: "rule-a", reason: "libraryRemoved", itemKeys: [MOVIE.key] }))
  })

  it("checks the scope on the row when the snapshot lacks the item, even for a blocked rule", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([row({ sectionId: "1" })])
    const blocked = rule("rule-a", { libraries: ["3"] }, { blocks: [{ code: "dataStale", hours: 40 }] })
    await reconcile({ ctx: contextOf({ rules: [blocked], items: [] }) })
    expect(outcomes().map((o) => o.reason)).toEqual(["libraryRemoved"])
  })

  it("releases an item that left Plex (notInLibrary), with its own audit row", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([row()])
    await expect(reconcile({ ctx: contextOf({ rules: [rule("rule-a")], items: [OTHER_MOVIE] }) })).resolves.toEqual(expect.objectContaining({ released: 1 }))
    expect(outcomes().map((o) => [o.kind, o.reason])).toEqual([["released", "notInLibrary"]])
    expect(mockRecord).toHaveBeenCalledWith(AuditEventType.CLEANUP_ITEM_RESCUED, "system", expect.objectContaining({ reason: "notInLibrary", runId: "run-9" }), prismaMock)
  })

  it.each([
    ["the Plex source of the snapshot failed", { sources: buildSourceStatuses({ plex: { state: "failed" } }) }],
    ["the level's part did not load", { missing: ["movie"] as Level[] }],
    ["no complete snapshot exists", { snapshot: false }],
  ])("changes nothing for a missing item when %s", async (_label, input) => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([row()])
    await expect(reconcile({ ctx: contextOf({ rules: [rule("rule-a")], items: [OTHER_MOVIE], ...input }) }))
      .resolves.toEqual(expect.objectContaining({ updated: 0, released: 0, skipped: 0 }))
    expect(prismaMock.cleanupItem.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.cleanupItem.deleteMany).not.toHaveBeenCalled()
  })

  it("keeps a missing item held by a blocked rule, but releases the rules without blocks (E14)", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([row({ ruleIds: ["rule-a", "rule-b"] })])
    const ctx = contextOf({ rules: [rule("rule-a", {}, { blocks: [{ code: "sourceFailed", service: "tautulli" }] }), rule("rule-b")], items: [OTHER_MOVIE] })
    await reconcile({ ctx })
    expect(prismaMock.cleanupItem.deleteMany).not.toHaveBeenCalled()
    expect(updates()[0].data).toEqual({ ruleIds: ["rule-a"], action: "movie.delete", importListExclusion: true, needsApproval: false, leaveOn: "2026-11-30" })
  })

  it.each([
    ["g1", "kept", undefined],
    ["g3", "excluded", undefined],
    ["g2", "markedKeepForever", undefined],
    ["g9", "protected", { protectionId: "g9" }],
  ])("rescues an item that %s protects with %s, and audits the rescue", async (id, reason, detail) => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([row()])
    const ctx = contextOf({ rules: [rule("rule-a")], globals: [stubGlobal(id as "g1", { [MOVIE.key]: "protects" })] })

    await expect(reconcile({ ctx })).resolves.toEqual(expect.objectContaining({ rescued: 1, rescuedByRule: { "rule-a": 1 } }))

    expect(outcomes()[0]).toEqual(expect.objectContaining({ kind: "rescued", reason, detail: detail ?? expect.anything() }))
    expect(mockRecord).toHaveBeenCalledWith(AuditEventType.CLEANUP_ITEM_RESCUED, "system", expect.objectContaining({ reason, itemKey: MOVIE.key }), prismaMock)
  })

  it.each([
    ["a watch clause with a newer counted play", "watch.lastPlayed", "played"],
    ["a library.added clause", "library.added", "newContent"],
    ["a show.lastEpisodeAdded clause", "show.lastEpisodeAdded", "newContent"],
    ["any other clause", "file.size", "conditionFailed"],
  ] as const)("rescues an item for which %s fails, with %s", async (_label, field, reason) => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([row()])
    const definition = { conditions: [buildCondition(field)] }
    const played = { ...MOVIE, plays: { lastCountedAt: NOW_S - 86_400, countedAt: [NOW_S - 86_400], viewers: [] } } // after the entry on 2026-10-01
    await reconcile({ ctx: contextOf({ rules: [rule("rule-a", definition)], items: [played], table: { [MOVIE.key]: { c1: "fail" } } }) })
    expect(outcomes()[0]).toEqual(expect.objectContaining({ kind: "rescued", reason }))
    if (reason === "conditionFailed") expect(outcomes()[0].detail).toEqual({ conditionId: "c1" })
  })

  it("rescues an item that Radarr no longer matches (notManaged with the match cause)", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([row()])
    const unmatched = { ...MOVIE, match: { state: "unmatched" as const, cause: "noArrRecord" as const } }
    await reconcile({ ctx: contextOf({ rules: [rule("rule-a")], items: [unmatched] }) })
    expect(outcomes()[0]).toEqual(expect.objectContaining({ kind: "rescued", reason: "notManaged", detail: { code: "noArrRecord" } }))
  })

  it("exits with the reason of the first dropped rule, and counts a zero-row exit as skipped", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([row({ ruleIds: ["rule-off", "rule-a"] })])
    prismaMock.cleanupItem.deleteMany.mockResolvedValueOnce({ count: 0 })
    const ctx = contextOf({ rules: [rule("rule-a")], table: { [MOVIE.key]: { c1: "fail" } } })
    await expect(reconcile({ ctx })).resolves.toEqual(expect.objectContaining({ skipped: 1, released: 0 }))
    expect(mockLog).not.toHaveBeenCalled()
  })
})

describe("reconcile: E14, blocked rules change nothing", () => {
  it("makes no write for an item whose every holding rule is blocked, even when it fails a clause", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([row()])
    const blocked = rule("rule-a", {}, { blocks: [{ code: "sourceFailed", service: "tautulli" }] })
    await reconcile({ ctx: contextOf({ rules: [blocked], table: { [MOVIE.key]: { c1: "fail" } } }) })
    expect(prismaMock.cleanupItem.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.cleanupItem.deleteMany).not.toHaveBeenCalled()
  })

  it("never lets a blocked rule join, and never evaluates a rule whose definition does not parse", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([row({ ruleIds: ["rule-bad"] })])
    const bad: LiveRule = { ...rule("rule-bad"), definition: null, compiled: null, blocks: [{ code: "invalid" }] }
    const blocked = rule("rule-b", {}, { blocks: [{ code: "noData" }] })
    await reconcile({ ctx: contextOf({ rules: [bad, blocked] }) })
    expect(prismaMock.cleanupItem.updateMany).not.toHaveBeenCalled()
  })
})

describe("reconcile: step 4, other rules join", () => {
  it("adds a matching live rule and moves leaveOn to its grace from the entry day, never earlier", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([row()])
    const later = rule("rule-b", { then: { ...DELETE, graceDays: 90 } }, { createdAt: "2026-02-01T00:00:00Z" })
    const shorter = rule("rule-c", { then: { ...DELETE, graceDays: 1 } }, { createdAt: "2026-03-01T00:00:00Z" })
    await reconcile({ ctx: contextOf({ rules: [rule("rule-a"), later, shorter] }) })
    // entered 2026-10-01, + 90 days
    expect(updates()[0].data).toEqual(expect.objectContaining({ ruleIds: ["rule-a", "rule-b", "rule-c"], leaveOn: "2026-12-30" }))

    mockReset(prismaMock)
    prismaMock.cleanupItem.findMany.mockResolvedValue([row()])
    prismaMock.cleanupItem.updateMany.mockResolvedValue({ count: 1 })
    await reconcile({ ctx: contextOf({ rules: [rule("rule-a"), shorter] }) })
    expect(updates()[0].data).toEqual(expect.objectContaining({ ruleIds: ["rule-a", "rule-c"], leaveOn: "2026-11-30" }))
  })

  it("never adds a rule whose class is match for an item outside its libraries (E32)", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([row()])
    await reconcile({ ctx: contextOf({ rules: [rule("rule-a"), rule("rule-b", { libraries: ["3"] }), rule("rule-c", { level: "show", libraries: ["2"] })] }) })
    expect(updates()[0].data).toEqual(expect.objectContaining({ ruleIds: ["rule-a"] }))
  })

  it("never adds a rule for which the item is not a match", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([row()])
    const other = rule("rule-b", { conditions: [buildCondition("file.size", { id: "c7" })] })
    await reconcile({ ctx: contextOf({ rules: [rule("rule-a"), other], table: { [MOVIE.key]: { c7: "fail" } } }) })
    expect(updates()[0].data).toEqual(expect.objectContaining({ ruleIds: ["rule-a"] }))
  })

  it("keeps a held item held with only the rules that held it: another matching rule does not join it (correctness review C-07)", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([row({ state: "held", leaveOn: null, enteredAt: null, heldAt: new Date(NOW) })])
    await reconcile({ ctx: contextOf({ rules: [rule("rule-a"), rule("rule-b", {}, { createdAt: "2026-05-01T00:00:00Z" })] }) })
    const [update] = updates()
    expect(update.data).toEqual(expect.objectContaining({ ruleIds: ["rule-a"], leaveOn: null }))
    expect(update.data).not.toHaveProperty("state")
  })
})

describe("reconcile: the season raise (E21, safety-r4-3)", () => {
  const seasonRow = (overrides: Partial<CleanupItem> = {}) => row({ id: "season-1", itemKey: SEASON.key, level: "season", titleKey: SHOW.titleKey,
    sectionId: "2", ruleIds: ["rule-s"], action: "season.unmonitorDeleteFiles", importListExclusion: false, enteredAt: new Date("2026-11-01T00:00:00Z"),
    leaveOn: "2026-12-01", ...overrides })
  const seasonRule = (id: string, graceDays: number, createdAt = "2026-01-01T00:00:00Z") => ({
    ...rule(id), definition: { ...SEASONS, then: { ...SEASONS.then, graceDays } }, compiled: compileDefinition({ ...SEASONS, then: { ...SEASONS.then, graceDays } }),
    createdAt: new Date(createdAt),
  })

  it("raises the show of a season whose leaveOn moves, in the same transaction", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([seasonRow()])
    await reconcile({ ctx: contextOf({ rules: [seasonRule("rule-s", 30), seasonRule("rule-t", 60, "2026-02-01T00:00:00Z")] }) })

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(updates()).toEqual([
      expect.objectContaining({ where: { id: "season-1", updatedAt: seasonRow().updatedAt }, data: expect.objectContaining({ leaveOn: "2026-12-31", episodeCount: 1 }) }),
      { where: { itemKey: SHOW.key, state: { in: ["leaving", "approved"] }, leaveOn: { lt: "2026-12-31" } }, data: { leaveOn: "2026-12-31" } },
    ])
  })

  it("leaves a show row in deleting unchanged: the raise matches only leaving and approved rows", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([seasonRow()])
    prismaMock.cleanupItem.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    const result = await reconcile({ ctx: contextOf({ rules: [seasonRule("rule-s", 30), seasonRule("rule-t", 60, "2026-02-01T00:00:00Z")] }) })
    expect(result.updated).toBe(1)
    expect(updates()[1].where).toEqual(expect.objectContaining({ state: { in: ["leaving", "approved"] } }))
  })

  it("raises nothing when the season's leaveOn does not move, or its write matched zero rows", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([seasonRow()])
    await reconcile({ ctx: contextOf({ rules: [seasonRule("rule-s", 30)] }) })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()

    prismaMock.cleanupItem.updateMany.mockReset()
    prismaMock.cleanupItem.updateMany.mockResolvedValue({ count: 0 })
    const result = await reconcile({ ctx: contextOf({ rules: [seasonRule("rule-s", 30), seasonRule("rule-t", 60, "2026-02-01T00:00:00Z")] }) })
    expect(result.skipped).toBe(1)
    expect(prismaMock.cleanupItem.updateMany).toHaveBeenCalledTimes(1)
  })

  it("copies the season count of a show row from the snapshot", async () => {
    const showRule = { ...rule("rule-w"), definition: buildDefinition({ level: "show", libraries: ["2"], then: { ...DELETE, action: "show.delete" } }) }
    showRule.compiled = compileDefinition(showRule.definition)
    prismaMock.cleanupItem.findMany.mockResolvedValue([row({ itemKey: SHOW.key, level: "show", titleKey: SHOW.titleKey, sectionId: "2", ruleIds: ["rule-w"],
      action: "show.delete" })])
    await reconcile({ ctx: contextOf({ rules: [showRule] }) })
    expect(updates()[0].data).toEqual(expect.objectContaining({ seasonCount: 3, episodeCount: null }))
  })
})

describe("reconcile: the approval check (E31)", () => {
  const approved = () => row({ state: "approved", approvedAt: new Date(NOW), approvedBy: "admin-1", action: "movie.unmonitorDeleteFiles",
    importListExclusion: false, needsApproval: true })

  it("sends an approved item back to leaving when a save changes unmonitor to movie.delete with the exclusion on", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([approved()])
    await reconcile({ ctx: contextOf({ rules: [rule("rule-a", { then: DELETE }, { mode: "reviewFirst" })] }) })
    expect(updates()[0].data).toEqual(expect.objectContaining({ action: "movie.delete", importListExclusion: true, state: "leaving", approvedAt: null,
      approvedBy: null }))
  })

  it("keeps the approval when a new holding rule in Review first joins with an action as careful", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([approved()])
    const ctx = contextOf({ rules: [rule("rule-a", { then: UNMONITOR }), rule("rule-b", { then: UNMONITOR }, { mode: "reviewFirst", createdAt: "2026-04-01T00:00:00Z" })] })
    await reconcile({ ctx })
    const [update] = updates()
    expect(update.data).toEqual(expect.objectContaining({ ruleIds: ["rule-a", "rule-b"], needsApproval: true, action: "movie.unmonitorDeleteFiles" }))
    expect(update.data).not.toHaveProperty("state")
    expect(update.data).not.toHaveProperty("approvedAt")
  })
})
