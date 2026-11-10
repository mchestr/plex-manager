/**
 * @jest-environment node
 */

/**
 * New matches and the entry check (TS 8.5, E13, E14, E21), and `joinItems()`
 * for the turn-on page and an entry-batch approval (TS 10.3, safety-r7-2):
 * the thresholds, a waiting batch, two rules on one item, held rows, the key
 * cap, a Keep made during the run, the show floor and the season raise.
 */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}))
const mockLog = jest.fn()
jest.mock("@/lib/security/audit-log", () => ({
  ...jest.requireActual("@/lib/security/audit-log"),
  logAuditEvent: (...args: unknown[]) => mockLog(...args),
  recordAuditEvent: jest.fn(),
}))

import { mockReset } from "jest-mock-extended"

import { buildCleanupItem, buildCleanupProtection, buildCleanupSettings } from "@/__tests__/helpers/cleanup-factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import {
  buildDefinition,
  buildEvalContext,
  buildMovieItem,
  buildOptions,
  buildSeasonItem,
  buildShowItem,
  buildSnapshotFacts,
  buildSourceStatuses,
  NOW,
  stubEvals,
  type VerdictTable,
} from "@/lib/cleanup/__tests__/helpers/builders"
import type { Block } from "@/lib/cleanup/blocks"
import { compileDefinition } from "@/lib/cleanup/engine/compile"
import { evaluateItem } from "@/lib/cleanup/engine/evaluate"
import { addNewMatches, joinItems } from "@/lib/cleanup/run/entries"
import type { LiveRule, ReconcileContext } from "@/lib/cleanup/run/reconcile"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import type { SnapshotLevel } from "@/lib/cleanup/snapshot/cache"
import type { CleanupItem, CleanupProtection, Prisma } from "@/lib/generated/prisma/client"
import { AuditEventType } from "@/lib/security/audit-log"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"
import type { RuleDefinition } from "@/lib/validations/cleanup-rule"
import type { Level, Mode } from "@/lib/validations/cleanup-vocabulary"

const movie = (n: number, overrides: Partial<SnapshotItem> = {}) =>
  buildMovieItem({ key: `movie:tmdb:${n}`, titleKey: `tmdb:${n}`, ratingKey: String(5000 + n), copies: [{ ratingKey: String(5000 + n), sectionId: "1" }], ...overrides })
const SHOW = buildShowItem()
const SEASON = buildSeasonItem(SHOW, 1)
const SHOW_THEN: RuleDefinition["then"] = { graceDays: 30, action: "show.delete", importListExclusion: false }
const SEASON_THEN: RuleDefinition["then"] = { graceDays: 30, action: "season.unmonitorDeleteFiles", importListExclusion: false }

function rule(id: string, overrides: Partial<RuleDefinition> = {}, extra: { mode?: Mode; blocks?: Block[]; createdAt?: string } = {}): LiveRule {
  const definition = buildDefinition(overrides)
  return { id, mode: extra.mode ?? "automatic", revision: 1, createdAt: new Date(extra.createdAt ?? "2026-01-01T00:00:00Z"), definition,
    compiled: compileDefinition(definition), blocks: extra.blocks ?? [] }
}
const showRule = (id: string, graceDays = 30) => rule(id, { level: "show", libraries: ["2"], then: { ...SHOW_THEN, graceDays } })
const seasonRule = (id: string, graceDays = 30) => rule(id, { level: "season", libraries: ["2"], then: { ...SEASON_THEN, graceDays } })

const levelOf = (level: Level, items: SnapshotItem[]): SnapshotLevel => {
  const own = items.filter((i) => i.level === level)
  return { level, items: own, byKey: new Map(own.map((i) => [i.key, i])), byTitleKey: new Map() }
}

function contextOf(rules: LiveRule[], items: SnapshotItem[], options: Partial<CleanupOptions> = {}, extra: { table?: VerdictTable; holdUntil?: string } = {}): ReconcileContext {
  const sources = buildSourceStatuses()
  return {
    now: new Date(NOW), today: "2026-11-08", zone: "UTC", runId: "run-9", actorId: "system",
    // The percent limit at 100 %, so a test of a few items checks the count limit only
    settings: { ...buildCleanupSettings({ enabled: true, holdUntil: extra.holdUntil ?? null }),
      options: { ...buildOptions({ entryCheck: { count: 50, percent: 100 } }), ...options },
      runtime: { collections: {}, notices: [] } },
    snapshot: { header: { id: "snap-2", status: "complete", trigger: "scheduled", actorId: null, startedAt: new Date(NOW), finishedAt: new Date(NOW),
      sources, facts: buildSnapshotFacts() }, levels: { movie: levelOf("movie", items), show: levelOf("show", items), season: levelOf("season", items) } },
    evaluation: buildEvalContext({ evals: stubEvals(extra.table ?? {}) }),
    rules: new Map(rules.map((r) => [r.id, r])),
  }
}

interface Db {
  existing?: Partial<CleanupItem>[]
  seasons?: Partial<CleanupItem>[]
  protections?: Partial<CleanupProtection>[]
}

/** Answers each read by its shape: the existing keys, the show floor's season rows, the joined rows. */
function database({ existing = [], seasons = [], protections = [] }: Db) {
  const rows = existing.map((r) => buildCleanupItem(r))
  prismaMock.cleanupItem.findMany.mockImplementation(((args: Prisma.CleanupItemFindManyArgs) => {
    const where = args.where as { level?: string; itemKey?: { in: string[] } } | undefined
    if (where?.level === "season") return Promise.resolve(seasons.map((r) => buildCleanupItem(r)))
    if (where?.itemKey) return Promise.resolve(rows.filter((r) => where.itemKey?.in.includes(r.itemKey)))
    return Promise.resolve(rows)
  }) as never)
  prismaMock.cleanupProtection.findMany.mockResolvedValue(protections.map((p) => buildCleanupProtection(p)))
  return rows
}

const created = () => prismaMock.cleanupItem.createMany.mock.calls.flatMap(([args]) => args?.data as Prisma.CleanupItemCreateManyInput[])
const audits = (type: AuditEventType) => mockLog.mock.calls.filter(([t]) => t === type).map(([, , details]) => details)

beforeEach(() => {
  mockReset(prismaMock)
  mockLog.mockReset()
  prismaMock.$transaction.mockImplementation(((fn: (client: unknown) => unknown) => fn(prismaMock)) as never)
  prismaMock.cleanupItem.createMany.mockImplementation(((args: { data: unknown[] }) => Promise.resolve({ count: args.data.length })) as never)
  prismaMock.cleanupItem.updateMany.mockResolvedValue({ count: 1 })

  prismaMock.cleanupOutcome.findMany.mockResolvedValue([])
})

describe("addNewMatches: the entry check", () => {
  const MOVIES = Array.from({ length: 10 }, (_, i) => movie(i + 1))

  it("adds the candidates of a rule below both limits as leaving rows, and audits the joined keys", async () => {
    database({})
    const ctx = contextOf([rule("rule-a")], [...MOVIES, movie(99, { sectionId: "9" })])

    const result = await addNewMatches(ctx)

    expect(result).toEqual(expect.objectContaining({ joined: 10, held: 0, protectedNow: 0 }))
    expect(result.rules).toEqual([expect.objectContaining({ ruleId: "rule-a", checked: 10, candidates: 10, held: false, waitingBatch: false })])
    const [first] = created()
    expect(first).toEqual(expect.objectContaining({
      itemKey: "movie:tmdb:1", state: "leaving", ruleIds: ["rule-a"], action: "movie.delete", importListExclusion: true, needsApproval: false,
      enteredAt: new Date(NOW), heldAt: null, leaveOn: "2026-12-08", firstLeaveOn: "2026-12-08", lastRunId: "run-9", checkedAt: new Date(NOW),
      arr: { service: "radarr", id: 11, titleSlug: "the-invented-movie-1001", path: "/media/movies/The Invented Movie (2019)" },
    }))
    expect(first.why).toEqual(expect.objectContaining({ ruleId: "rule-a", snapshotId: "snap-2" }))
    expect(prismaMock.cleanupItem.createMany.mock.calls[0][0]?.skipDuplicates).toBe(true)
    expect(audits(AuditEventType.CLEANUP_ITEMS_ENTERED)).toEqual([expect.objectContaining({ runId: "run-9", ruleId: "rule-a", count: 10, more: 0 })])
    expect(audits(AuditEventType.CLEANUP_ITEMS_HELD)).toEqual([])
  })

  it.each([
    ["the count", { count: 9, percent: 100 }],
    ["the percent", { count: 50, percent: 9 }],
  ])("holds every candidate of a rule above %s, as held rows with no leave date", async (_label, entryCheck) => {
    database({})
    const result = await addNewMatches(contextOf([rule("rule-a")], MOVIES, { entryCheck }))

    expect(result).toEqual(expect.objectContaining({ joined: 0, held: 10 }))
    expect(created().every((r) => r.state === "held" && r.leaveOn === null && r.enteredAt === null && r.heldAt instanceof Date)).toBe(true)
    expect(audits(AuditEventType.CLEANUP_ITEMS_HELD)).toEqual([expect.objectContaining({ ruleId: "rule-a", count: 10 })])
  })

  it("adds nothing for a rule with a waiting entry batch, and records waitingBatch", async () => {
    database({ existing: [{ itemKey: "movie:tmdb:500", state: "held", ruleIds: ["rule-a"] }] })
    const result = await addNewMatches(contextOf([rule("rule-a")], MOVIES))
    expect(result.rules).toEqual([expect.objectContaining({ waitingBatch: true, held: false, candidates: 10 })])
    expect(created()).toEqual([])
  })

  it("adds nothing for a blocked rule (E14), and nothing without a snapshot", async () => {
    database({})
    const blocked = rule("rule-a", {}, { blocks: [{ code: "tautulliStale" }] })
    await expect(addNewMatches(contextOf([blocked], MOVIES))).resolves.toEqual({ rules: [], joined: 0, held: 0, protectedNow: 0 })
    await expect(addNewMatches({ ...contextOf([rule("rule-a")], MOVIES), snapshot: null, evaluation: null }))
      .resolves.toEqual({ rules: [], joined: 0, held: 0, protectedNow: 0 })
    expect(prismaMock.cleanupItem.createMany).not.toHaveBeenCalled()
  })

  it("skips items that already have a row, items that are no match, and a match with no arr record", async () => {
    database({ existing: [{ itemKey: "movie:tmdb:1", state: "leaving", ruleIds: ["rule-a"] }] })
    const noArr = movie(7, { arr: null })
    const result = await addNewMatches(contextOf([rule("rule-a")], [movie(1), movie(2), movie(3), noArr], {}, { table: { "movie:tmdb:3": { c1: "fail" } } }))
    expect(created().map((r) => r.itemKey)).toEqual(["movie:tmdb:2"])
    // movie 7 is a match with no arr record: a candidate that gets no row
    expect(result.rules[0]).toEqual(expect.objectContaining({ candidates: 2, checked: 4, held: false }))
  })
})

describe("addNewMatches: titles that left after the snapshot (correctness review C-03)", () => {
  it("never adds back a title deleted or rescued after the snapshot was taken, and adds one that left before it", async () => {
    database({})
    const ctx = contextOf([rule("rule-a")], [movie(1), movie(2), movie(3)])
    const takenAt = ctx.snapshot?.header.facts.takenAt
    prismaMock.cleanupOutcome.findMany.mockResolvedValue([{ itemKey: "movie:tmdb:1" }, { itemKey: "movie:tmdb:2" }] as never)
    await addNewMatches(ctx)
    expect(created().map((r) => r.itemKey)).toEqual(["movie:tmdb:3"])
    expect(prismaMock.cleanupOutcome.findMany).toHaveBeenCalledWith({ where: { kind: { in: ["deleted", "rescued"] }, actedAt: { gt: new Date(takenAt ?? "") } },
      select: { itemKey: true }, distinct: ["itemKey"] })
  })
})

describe("addNewMatches: two rules on one item", () => {
  it("creates one row held by both, at the longest grace of the rules that joined, with the merged action", async () => {
    database({})
    const careful = rule("rule-b", { then: { graceDays: 60, action: "movie.unmonitorDeleteFiles", importListExclusion: false } },
      { mode: "reviewFirst", createdAt: "2026-02-01T00:00:00Z" })
    await addNewMatches(contextOf([rule("rule-a"), careful], [movie(1)]))
    expect(created()).toEqual([expect.objectContaining({ ruleIds: ["rule-a", "rule-b"], leaveOn: "2027-01-07", action: "movie.unmonitorDeleteFiles",
      importListExclusion: false, needsApproval: true, state: "leaving" })])
  })

  it("lets an item join through a rule that did not hold it, and names the holding rule too; another rule's batch waits", async () => {
    database({ existing: [{ itemKey: "movie:tmdb:900", state: "held", ruleIds: ["rule-w"] }] })
    const items = Array.from({ length: 5 }, (_, i) => movie(i + 1))
    const holder = rule("rule-h", { libraries: ["1", "4"] }, { createdAt: "2026-02-01T00:00:00Z" })
    const onlyHeld = movie(40, { sectionId: "4", copies: [{ ratingKey: "5040", sectionId: "4" }] })
    const waiter = rule("rule-w", { libraries: ["1", "6"] }, { createdAt: "2026-03-01T00:00:00Z" })
    const onlyWaiting = movie(60, { sectionId: "6", copies: [{ ratingKey: "5060", sectionId: "6" }] })
    const ctx = contextOf([rule("rule-a"), holder, waiter], [...items, onlyHeld, onlyWaiting], { entryCheck: { count: 5, percent: 100 } })

    const result = await addNewMatches(ctx)

    // rule-h has 6 candidates (above 5): it holds them. rule-a has 5: they join, and name rule-h and rule-w too.
    expect(result.rules.map((r) => [r.ruleId, r.held, r.waitingBatch])).toEqual([["rule-a", false, false], ["rule-h", true, false], ["rule-w", false, true]])
    const rows = created()
    expect(rows.filter((r) => r.state === "leaving").map((r) => r.ruleIds)).toEqual(Array(5).fill(["rule-a", "rule-h", "rule-w"]))
    expect(rows.find((r) => r.itemKey === "movie:tmdb:40")).toEqual(expect.objectContaining({ state: "held", ruleIds: ["rule-h"] }))
    expect(rows.find((r) => r.itemKey === "movie:tmdb:60")).toBeUndefined()
    expect(audits(AuditEventType.CLEANUP_ITEMS_ENTERED)).toEqual([expect.objectContaining({ ruleId: "rule-a", count: 5 })])
    expect(audits(AuditEventType.CLEANUP_ITEMS_HELD)).toEqual([expect.objectContaining({ ruleId: "rule-h", count: 1, itemKeys: ["movie:tmdb:40"] })])
  })

  it("starts no item before holdUntil", async () => {
    database({})
    await addNewMatches(contextOf([rule("rule-a", { then: { graceDays: 1, action: "movie.delete", importListExclusion: false } })], [movie(1)], {},
      { holdUntil: "2026-11-15" }))
    expect(created()[0]).toEqual(expect.objectContaining({ leaveOn: "2026-11-15", firstLeaveOn: "2026-11-15" }))
  })
})

describe("addNewMatches: the protection read again, and the key cap", () => {
  it("never adds back a title that a Keep or an exclusion made after the live facts read protects, also through the cascade", async () => {
    database({ protections: [{ itemKey: "movie:tmdb:2" }, { kind: "adminExclude", memberId: null, itemKey: SHOW.key }] })
    const ctx = contextOf([rule("rule-a"), seasonRule("rule-s")], [movie(1), movie(2), SHOW, SEASON])

    const result = await addNewMatches(ctx)

    expect(result.protectedNow).toBe(2)
    expect(created().map((r) => r.itemKey)).toEqual(["movie:tmdb:1"])
    expect(prismaMock.cleanupProtection.findMany).toHaveBeenCalledWith({
      where: { status: "active", activeKey: { not: null }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date(NOW) } }] }, select: { itemKey: true },
    })
  })

  it("names at most 500 keys in an audit row, then more", async () => {
    database({})
    const many = Array.from({ length: 502 }, (_, i) => movie(i + 1))
    await addNewMatches(contextOf([rule("rule-a")], many, { entryCheck: { count: 1000, percent: 100 } }))
    const [entered] = audits(AuditEventType.CLEANUP_ITEMS_ENTERED)
    expect(entered).toEqual(expect.objectContaining({ count: 502, more: 2 }))
    expect((entered as { itemKeys: string[] }).itemKeys).toHaveLength(500)
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(6)
  })
})

describe("addNewMatches: shows and seasons (E21)", () => {
  it("raises the show row of a new season to the season's leave date", async () => {
    database({ existing: [{ itemKey: SHOW.key, level: "show", titleKey: SHOW.titleKey, state: "leaving", leaveOn: "2026-11-20" }] })
    await addNewMatches(contextOf([seasonRule("rule-s", 45)], [SHOW, SEASON]))
    expect(created()).toEqual([expect.objectContaining({ itemKey: SEASON.key, leaveOn: "2026-12-23", episodeCount: 1 })])
    expect(prismaMock.cleanupItem.updateMany).toHaveBeenCalledWith({
      where: { itemKey: SHOW.key, state: { in: ["leaving", "approved"] }, leaveOn: { lt: "2026-12-23" } }, data: { leaveOn: "2026-12-23" },
    })
  })

  it("starts a new show at the latest leave date of its seasons in Leaving soon", async () => {
    database({ seasons: [{ itemKey: "season:tvdb:2002:2", level: "season", titleKey: SHOW.titleKey, state: "leaving", leaveOn: "2027-02-01" }] })
    await addNewMatches(contextOf([showRule("rule-w")], [SHOW, SEASON]))
    expect(created()).toEqual([expect.objectContaining({ itemKey: SHOW.key, leaveOn: "2027-02-01", firstLeaveOn: "2027-02-01", seasonCount: 3 })])
  })
})

describe("joinItems: turn-on (no entry check)", () => {
  const match = (r: LiveRule, item: SnapshotItem, ctx: ReconcileContext) => {
    if (!r.compiled || !ctx.evaluation) throw new Error("no rule")
    return evaluateItem(r.compiled, item, ctx.evaluation)
  }

  it("creates leaving rows for new keys, joins existing rows through reconcile rules, keeps held rows held, and skips the rest", async () => {
    const turned = rule("rule-t", { then: { graceDays: 60, action: "movie.delete", importListExclusion: false } }, { createdAt: "2026-06-01T00:00:00Z" })
    const items = [movie(1), movie(2), movie(3), movie(4), movie(5), movie(6)]
    const ctx = contextOf([rule("rule-a")], items, { entryCheck: { count: 1, percent: 1 } })
    const rows = database({
      existing: [
        { id: "two", itemKey: "movie:tmdb:2", ruleIds: ["rule-a"], state: "leaving", enteredAt: new Date("2026-11-01T00:00:00Z"), leaveOn: "2026-12-01" },
        { id: "three", itemKey: "movie:tmdb:3", ruleIds: ["rule-a"], state: "held", leaveOn: null, enteredAt: null },
        { id: "four", itemKey: "movie:tmdb:4", ruleIds: ["rule-a"], state: "deleting" },
        { id: "five", itemKey: "movie:tmdb:5", ruleIds: ["rule-t"], state: "leaving" },
      ],
      protections: [{ itemKey: "movie:tmdb:6" }],
    })

    const result = await joinItems(ctx, { rule: turned, matches: items.map((item) => match(turned, item, ctx)) })

    expect(result).toEqual({ joined: ["movie:tmdb:2", "movie:tmdb:1"], skipped: 0 })
    expect(created()).toEqual([expect.objectContaining({ itemKey: "movie:tmdb:1", state: "leaving", ruleIds: ["rule-t", "rule-a"], leaveOn: "2027-01-07" })])
    const writes = prismaMock.cleanupItem.updateMany.mock.calls.map(([args]) => args)
    expect(writes.map((w) => w.where)).toEqual([{ id: "two", updatedAt: rows[0].updatedAt }, { id: "three", updatedAt: rows[1].updatedAt }])
    expect(writes[0].data).toEqual(expect.objectContaining({ ruleIds: ["rule-a", "rule-t"], leaveOn: "2026-12-31", holdCode: null }))
    expect(writes[1].data).toEqual(expect.objectContaining({ ruleIds: ["rule-a", "rule-t"], leaveOn: null }))
  })

  it("counts a joined row that an action changed meanwhile as skipped, and joins nothing for no matches", async () => {
    const turned = rule("rule-t")
    const ctx = contextOf([], [movie(1)])
    database({ existing: [{ id: "one", itemKey: "movie:tmdb:1", ruleIds: [], state: "leaving" }] })
    prismaMock.cleanupItem.updateMany.mockResolvedValue({ count: 0 })
    await expect(joinItems(ctx, { rule: turned, matches: [match(turned, movie(1), ctx)] })).resolves.toEqual({ joined: [], skipped: 1 })
    await expect(joinItems(ctx, { rule: turned })).resolves.toEqual({ joined: [], skipped: 0 })
  })
})

describe("joinItems: an entry-batch approval", () => {
  const held = (overrides: Partial<CleanupItem>) => buildCleanupItem({ state: "held", heldAt: new Date(NOW), enteredAt: null, leaveOn: null, firstLeaveOn: null,
    ruleIds: ["rule-s"], ...overrides })

  it("moves held rows to leaving at the longest grace of their live rules, and raises a season's show (E21)", async () => {
    database({})
    const row = held({ id: "season", itemKey: SEASON.key, level: "season", titleKey: SHOW.titleKey, ruleIds: ["rule-s", "rule-x", "rule-gone"] })
    const ctx = contextOf([seasonRule("rule-s"), seasonRule("rule-x", 50)], [SHOW, SEASON])

    await expect(joinItems(ctx, { rule: ctx.rules.get("rule-s") as LiveRule, held: [row] })).resolves.toEqual({ joined: [SEASON.key], skipped: 0 })

    const writes = prismaMock.cleanupItem.updateMany.mock.calls.map(([args]) => args)
    expect(writes[0]).toEqual({
      where: { id: "season", state: "held", ruleIds: { has: "rule-s" }, updatedAt: row.updatedAt },
      data: { state: "leaving", heldAt: null, enteredAt: new Date(NOW), leaveOn: "2026-12-28", firstLeaveOn: "2026-12-28",
        action: "season.unmonitorDeleteFiles", importListExclusion: false, needsApproval: false },
    })
    expect(writes[1]).toEqual({ where: { itemKey: SHOW.key, state: { in: ["leaving", "approved"] }, leaveOn: { lt: "2026-12-28" } },
      data: { leaveOn: "2026-12-28" } })
  })

  it("starts a show at its show floor: a season postponed while the show was held has a later date (safety-r7-2)", async () => {
    database({ seasons: [{ itemKey: "season:tvdb:2002:2", level: "season", titleKey: SHOW.titleKey, state: "leaving", leaveOn: "2027-03-01" }] })
    const row = held({ id: "show", itemKey: SHOW.key, level: "show", titleKey: SHOW.titleKey, ruleIds: ["rule-w"] })
    const ctx = contextOf([showRule("rule-w")], [SHOW, SEASON])

    await expect(joinItems(ctx, { rule: ctx.rules.get("rule-w") as LiveRule, held: [row] })).resolves.toEqual({ joined: [SHOW.key], skipped: 0 })

    expect(prismaMock.cleanupItem.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ level: "season", titleKey: SHOW.titleKey }) }))
    const [write] = prismaMock.cleanupItem.updateMany.mock.calls.map(([args]) => args)
    expect(write.data).toEqual(expect.objectContaining({ leaveOn: "2027-03-01", firstLeaveOn: "2027-03-01", action: "show.delete" }))
    expect(prismaMock.cleanupItem.updateMany).toHaveBeenCalledTimes(1)
  })

  it("skips a held row that changed meanwhile, and one that no live rule gives a grace period", async () => {
    database({})
    const bad: LiveRule = { ...rule("rule-bad"), definition: null, compiled: null, blocks: [{ code: "invalid" }] }
    const ctx = contextOf([rule("rule-a")], [movie(1)])
    prismaMock.cleanupItem.updateMany.mockResolvedValue({ count: 0 })
    const rows = [held({ id: "a", itemKey: "movie:tmdb:1", ruleIds: ["rule-a"] }), held({ id: "b", itemKey: "movie:tmdb:2", ruleIds: ["rule-bad"] })]

    await expect(joinItems(ctx, { rule: ctx.rules.get("rule-a") as LiveRule, held: [rows[0]] })).resolves.toEqual({ joined: [], skipped: 1 })
    await expect(joinItems(ctx, { rule: bad, held: [rows[1]] })).resolves.toEqual({ joined: [], skipped: 1 })
    expect(prismaMock.cleanupItem.updateMany).toHaveBeenCalledTimes(1)
  })
})
