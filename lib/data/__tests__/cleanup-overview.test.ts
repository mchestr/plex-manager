/**
 * @jest-environment node
 */

/**
 * `getCleanupOverview` (TS 10.4, 12.7 items 1 to 6, UX 4.1): the admin check
 * before any read, the first-use shape, the rule cards evaluated live on the
 * cached snapshot (not the stored `lastEval`), the facts of each mode, the
 * footer order of UX 4.1.3, the sort with waiting batches first, the batch
 * lines, the stat tiles, the recipe gallery with two-level counts and
 * missing services, the page stops, and the 1 s budget for 50 rules and 10
 * recipes (TS 17.1), guarded with a 3 s ceiling.
 */

import { mockReset } from "jest-mock-extended"

import { buildCleanupItem, buildCleanupOutcome } from "@/__tests__/helpers/cleanup-factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { assertAdmin } from "@/lib/admin"
import { buildLiveFacts, buildRuntime, buildSeasonItem, NOW } from "@/lib/cleanup/__tests__/helpers/builders"
import { loadLiveFacts } from "@/lib/cleanup/live-facts"
import { rowOf } from "@/lib/cleanup/member/__tests__/fixtures"
import { RECIPE_IDS } from "@/lib/cleanup/constants"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import { ADMIN, AT, dryRuns, ITEMS, mockStoredDefaults, movie, MOVIE_DEFINITION, show, SHOW_DEFINITION, snapshotOf, SOURCES,
  storedRule } from "@/lib/cleanup/screens/overview/__tests__/fixtures"
import { loadNewestSnapshot } from "@/lib/cleanup/snapshot/cache"
import type { RuleCardData } from "@/lib/cleanup/types/rule-parts"
import { getActiveService } from "@/lib/data/active-service"
import { getCleanupOverview } from "@/lib/data/cleanup-overview"
import type { CleanupOutcome } from "@/lib/generated/prisma/client"
import { isRedisConfigured } from "@/lib/queue/connection"
import { GiB } from "@/lib/validations/cleanup-vocabulary"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/cleanup/snapshot/cache", () => ({ loadNewestSnapshot: jest.fn() }))
jest.mock("@/lib/cleanup/live-facts", () => ({ loadLiveFacts: jest.fn() }))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))
jest.mock("@/lib/queue/connection", () => ({ isRedisConfigured: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({ createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }) }))

const snapshotMock = jest.mocked(loadNewestSnapshot)
const GIB = BigInt(GiB)

/** The outcome reads: the rescues, the deleted outcomes of the Automatic rules, and the last 30 days. */
function mockOutcomes(outcomes: { freed?: CleanupOutcome[]; deleted?: CleanupOutcome[]; rescues?: CleanupOutcome[] }) {
  prismaMock.cleanupOutcome.findMany.mockImplementation(((args: { where: { kind: string; ruleIds?: unknown } }) =>
    Promise.resolve(args.where.kind === "rescued" ? (outcomes.rescues ?? []) : args.where.ruleIds ? (outcomes.deleted ?? []) : (outcomes.freed ?? []))) as never)
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(assertAdmin).mockResolvedValue(ADMIN as never)
  jest.mocked(getActiveService).mockResolvedValue({} as never)
  jest.mocked(isRedisConfigured).mockReturnValue(true)
  jest.mocked(loadLiveFacts).mockResolvedValue(buildLiveFacts({ members: [{ userId: "u-1", plexUserId: "100", name: "Avery Example", accessEndedAt: null }] }))
  snapshotMock.mockResolvedValue(snapshotOf(ITEMS))
  mockStoredDefaults({ enabled: true, enabledAt: new Date(NOW - 30 * 86_400_000) })
})

describe("the admin check", () => {
  it("refuses before any read", async () => {
    jest.mocked(assertAdmin).mockRejectedValue(new Error("PM_FORBIDDEN"))

    await expect(getCleanupOverview(AT)).rejects.toThrow("PM_FORBIDDEN")
    expect(snapshotMock).not.toHaveBeenCalled()
    expect(prismaMock.cleanupRule.findMany).not.toHaveBeenCalled()
    expect(prismaMock.cleanupSettings.findUnique).not.toHaveBeenCalled()
  })
})

describe("first use", () => {
  it("has no library data, no rule, and recipes without counts that name the missing services", async () => {
    snapshotMock.mockResolvedValue(null)
    mockStoredDefaults({ readClaimAt: new Date(Date.now() - 60_000) })
    jest.mocked(getActiveService).mockImplementation(((kind: string) => Promise.resolve(kind === "sonarr" ? null : {})) as never)
    jest.mocked(isRedisConfigured).mockReturnValue(false)

    const data = await getCleanupOverview()

    expect(data.feature).toEqual({ enabled: false, enabledAt: null, pausedAt: null, pausedBy: null, redis: false })
    expect(data.snapshot).toEqual({ id: null, takenAt: null, finishedAt: null, reading: true })
    expect(data).toMatchObject({ sources: [], blocks: [], batches: [], rules: [] })
    expect(data.kometa).toBeUndefined()
    expect(data.library).toEqual({ movies: { count: 0, bytes: "0" }, shows: { count: 0, bytes: "0", seasons: 0 }, freeBytes: null, totalBytes: null,
      growthBytesPerMonth: null })
    expect(data.stats).toEqual({ leaving: { count: 0, bytes: "0", nextLeaveAt: null }, waiting: null, freed30d: { count: 0, bytes: "0", level: null } })
    expect(data.recipes.map((r) => r.id)).toEqual([...RECIPE_IDS])
    expect(data.recipes.every((r) => r.today === null && r.posters.length === 0)).toBe(true)
    expect(data.recipes.find((r) => r.id === "big-shows-nobody-plays")?.needs).toEqual(["sonarr"])
    expect(data.recipes.find((r) => r.id === "never-watched-movies")?.needs).toEqual([])
  })
})

describe("recipe cards", () => {
  it("evaluate each recipe with its defaults, and both levels of a two-level recipe", async () => {
    const data = await getCleanupOverview(AT)
    const never = data.recipes.find((r) => r.id === "never-watched-movies")
    const twoLevel = data.recipes.find((r) => r.id === "requested-never-watched")

    expect(never).toMatchObject({ name: "Never watched movies", level: "movie", today: { count: 1, bytes: String(50 * GiB) }, posters: ["5101"],
      keyValues: ["180 days", "30 days"], note: expect.any(String) })
    expect(never?.sentence.some((part) => part.strong && part.text === "Movies")).toBe(true)
    expect(twoLevel?.level).toBe("movieOrShow")
    expect(twoLevel?.today).toEqual({ count: expect.any(Number), bytes: expect.any(String), altCount: expect.any(Number) })
  })
})

describe("rule cards", () => {
  const reviewRow = rowOf(ITEMS[0], "2026-11-01", { ruleIds: ["rule-review"], needsApproval: true, state: "leaving" })
  const showRow = rowOf(ITEMS[4], "2026-11-20", { ruleIds: ["rule-auto"], action: "show.delete", state: "leaving" })
  const heldRow = buildCleanupItem({ id: "held-1", itemKey: "show:tvdb:9", level: "show", titleKey: "tvdb:9", state: "held", ruleIds: ["rule-auto"],
    heldAt: new Date(NOW - 86_400_000), leaveOn: null, enteredAt: null, sizeBytes: 5n * GIB })

  beforeEach(() => {
    prismaMock.cleanupRule.findMany.mockResolvedValue([
      storedRule("rule-dry", "Dry movies", { stats: { dryRuns: dryRuns(MOVIE_DEFINITION, [2, 2]) } }),
      storedRule("rule-review", "Review movies", { mode: "reviewFirst", turnedOnAt: new Date(NOW - 20 * 86_400_000) }),
      storedRule("rule-auto", "Auto shows", { mode: "automatic", definition: SHOW_DEFINITION, turnedOnAt: new Date("2026-10-01T12:00:00Z") }),
      storedRule("rule-broken", "Broken", { definition: { level: "season", conditions: "nope" } }),
    ])
    prismaMock.cleanupItem.findMany.mockResolvedValue([reviewRow, showRow, heldRow])
    mockOutcomes({
      deleted: [buildCleanupOutcome({ ruleIds: ["rule-auto"], freedBytes: 7n * GIB, actedAt: new Date("2026-10-15T12:00:00Z") }),
        buildCleanupOutcome({ ruleIds: ["rule-auto"], freedBytes: 9n * GIB, actedAt: new Date("2026-09-15T12:00:00Z") })],
      rescues: [buildCleanupOutcome({ kind: "rescued", reason: "played", title: "Invented Show 3", level: "season", seasonNumber: 2,
        ruleIds: ["rule-auto"], actedAt: new Date(NOW - 86_400_000) })],
      freed: [buildCleanupOutcome({ level: "show", freedBytes: 7n * GIB })],
    })
  })

  const card = (cards: RuleCardData[], id: string) => cards.find((c) => c.id === id)

  it("sorts rules with a waiting batch first, then by name", async () => {
    const { rules } = await getCleanupOverview(AT)

    expect(rules.map((r) => [r.name, r.waitingBatch])).toEqual([["Auto shows", "entry"], ["Review movies", "deletion"], ["Broken", null],
      ["Dry movies", null]])
  })

  it("counts matches live on the cached snapshot, not the stored last evaluation", async () => {
    prismaMock.cleanupRule.findMany.mockResolvedValue([storedRule("rule-dry", "Dry movies", { stats: { lastEval: { runId: "r", at: AT.toISOString(),
      snapshotId: "s", checked: 9, matches: 99, bytes: 1, nearMisses: 0, protected: 0, missing: 0, cannotDelete: 0, largest: [], overlaps: [], blocks: [] } } })])

    const { rules } = await getCleanupOverview(AT)

    expect(rules[0].facts.matches).toEqual({ count: 2, bytes: String(80 * GiB), growthWeeks: 0, newSinceLastRun: null })
    expect(rules[0].posters).toEqual(["5101", "5102"])
  })

  it("gives each mode its facts", async () => {
    const { rules } = await getCleanupOverview(AT)

    expect(card(rules, "rule-dry")?.facts).toMatchObject({ dryRuns: { count: 2, sinceDay: "2026-11-06", min: 2, max: 2, steady: true },
      leaving: null, waiting: null, deleted: null })
    expect(card(rules, "rule-review")?.facts).toMatchObject({
      matches: { count: 2, newSinceLastRun: 1 },
      leaving: { count: 1, bytes: String(50 * GiB), turnedOnAt: new Date(NOW - 20 * 86_400_000).toISOString(), nextLeaveOn: null, nextCount: 0 },
      waiting: { count: 1, bytes: String(50 * GiB), dueOn: "2026-11-01", dueToday: false },
      deleted: null,
    })
    expect(card(rules, "rule-auto")?.facts).toMatchObject({
      matches: { count: 1, newSinceLastRun: null },
      leaving: { count: 1, nextLeaveOn: "2026-11-20", nextCount: 1 },
      waiting: null,
      deleted: { count: 1, bytes: String(7 * GiB), since: "2026-10-01" },
    })
  })

  it("picks the first footer that applies: a stop, ready, an overlap, then a rescue", async () => {
    const { rules } = await getCleanupOverview(AT)

    expect(card(rules, "rule-broken")?.footer).toEqual({ kind: "block", block: { code: "invalid", ruleId: "rule-broken" } })
    expect(card(rules, "rule-broken")).toMatchObject({ level: "season", sentence: [{ text: "The saved rule could not be read." }] })
    expect(card(rules, "rule-dry")?.footer).toEqual({ kind: "ready", dryRuns: 2, readAt: AT.toISOString() })
    expect(card(rules, "rule-review")?.footer).toEqual({ kind: "overlap", rule: { id: "rule-dry", name: "Dry movies" }, count: 2, overlap: "same" })
    expect(card(rules, "rule-auto")?.footer).toEqual({ kind: "rescue", title: "Invented Show 3, Season 2", at: new Date(NOW - 86_400_000).toISOString(),
      reason: "A member played it." })
  })

  it("shows a safety stop of the rule before everything else", async () => {
    snapshotMock.mockResolvedValue(snapshotOf(ITEMS, { sources: SOURCES.map((s) => (s.service === "tautulli" ? { ...s, state: "failed",
      errorCode: "TIMEOUT" } : s)) }))

    const { rules, blocks } = await getCleanupOverview(AT)

    for (const id of ["rule-dry", "rule-review", "rule-auto"]) {
      expect(card(rules, id)?.footer).toEqual({ kind: "block", block: expect.objectContaining({ code: "sourceFailed", service: "tautulli", ruleId: id }) })
    }
    expect(blocks).toEqual([expect.objectContaining({ code: "sourceFailed", service: "tautulli", errorCode: "TIMEOUT" })])
  })

  it("gives no ready line without steady dry runs, and no footer when nothing applies", async () => {
    prismaMock.cleanupRule.findMany.mockResolvedValue([
      storedRule("rule-dry", "Dry movies", { stats: { dryRuns: dryRuns(MOVIE_DEFINITION, [2, 40]) } }),
      storedRule("rule-review", "Review movies", { mode: "reviewFirst" }),
      storedRule("rule-shows", "Dry shows", { definition: SHOW_DEFINITION }),
    ])

    const { rules } = await getCleanupOverview(AT)

    expect(card(rules, "rule-dry")?.facts.dryRuns).toMatchObject({ count: 2, steady: false, min: 2, max: 40 })
    expect(card(rules, "rule-dry")?.footer).toEqual({ kind: "overlap", rule: { id: "rule-review", name: "Review movies" }, count: 2, overlap: "same" })
    expect(card(rules, "rule-shows")?.footer).toBeNull()
  })

  it("lists each batch, the stat tiles and the paused admin", async () => {
    mockStoredDefaults({ enabled: true, pausedAt: new Date(NOW - 3_600_000), pausedBy: "admin-1", runtime: buildRuntime({ notices: [{ kind: "collectionRemoved",
      key: "2:show", title: "Shows leaving soon", sectionId: "2", detectedAt: new Date(NOW - 3_600_000).toISOString(), recreatedAt: null }] }) })
    prismaMock.cleanupRule.findMany.mockResolvedValue([
      storedRule("rule-review", "Review movies", { mode: "reviewFirst" }),
      storedRule("rule-auto", "Auto shows", { mode: "automatic", definition: SHOW_DEFINITION }),
    ])
    prismaMock.cleanupItem.findMany.mockResolvedValue([reviewRow, showRow, heldRow])
    prismaMock.user.findMany.mockResolvedValue([{ id: "admin-1", name: "Avery Admin", email: null }] as never)
    mockOutcomes({ freed: [buildCleanupOutcome({ level: "show", freedBytes: 7n * GIB })] })

    const data = await getCleanupOverview(AT)

    expect(data.feature.pausedBy).toEqual({ id: "admin-1", name: "Avery Admin", isYou: true })
    expect(data.kometa).toEqual({ collection: "Shows leaving soon", removedAt: new Date(NOW - 3_600_000).toISOString(), recreatedAt: null })
    expect(data.batches).toEqual([
      { id: "deletion-rule-review", kind: "deletion", ruleId: "rule-review", ruleName: "Review movies", level: "movie", count: 1, bytes: String(50 * GiB),
        dueAt: "2026-11-01", dueSince: "2026-11-01" },
      { id: "entry-rule-auto", kind: "entry", ruleId: "rule-auto", ruleName: "Auto shows", level: "show", count: 1, bytes: String(5 * GiB),
        dueAt: "2026-11-07", dueSince: "2026-11-07" },
    ])
    expect(data.stats).toEqual({
      leaving: { count: 2, bytes: String(150 * GiB), nextLeaveAt: "2026-11-20" },
      waiting: { count: 1, bytes: String(50 * GiB), dueAt: "2026-11-01", dueToday: false, level: "movie" },
      freed30d: { count: 1, bytes: String(7 * GiB), level: "show" },
    })
    expect(data.library).toEqual({ movies: { count: 780, bytes: String(9 * 1024 * GiB) }, shows: { count: 636, bytes: String(40 * 1024 * GiB), seasons: 2000 },
      freeBytes: String(25 * 1024 * GiB), totalBytes: String(84 * 1024 * GiB), growthBytesPerMonth: String(1400 * GiB) })
    expect(data.snapshot).toEqual({ id: "snapshot-1", takenAt: AT.toISOString(), finishedAt: AT.toISOString(), reading: false })
  })
})

describe("stored data that this build does not expect", () => {
  it("keeps a card for an unknown mode and a missing definition, and stops a rule whose level part did not load", async () => {
    const base = snapshotOf(ITEMS)
    snapshotMock.mockResolvedValue({ header: { ...base.header, finishedAt: null }, levels: { ...base.levels, show: null } })
    prismaMock.cleanupRule.findMany.mockResolvedValue([
      storedRule("rule-odd", "Odd", { mode: "later", definition: null }),
      storedRule("rule-shows", "Shows", { definition: SHOW_DEFINITION }),
      storedRule("rule-same", "Same size", { stats: {} }),
    ])
    const twins = [movie(7, 10, { plays: { lastCountedAt: null, countedAt: [], viewers: [] } }), movie(6, 10, { plays: { lastCountedAt: null, countedAt: [],
      viewers: [] } })]
    snapshotMock.mockResolvedValue({ header: { ...base.header, finishedAt: null }, levels: { ...snapshotOf(twins).levels, show: null } })

    const { rules } = await getCleanupOverview(AT)
    const card = (id: string) => rules.find((r) => r.id === id)

    expect(card("rule-odd")).toMatchObject({ mode: "dryRun", level: "movie", footer: { kind: "block", block: { code: "invalid" } } })
    expect(card("rule-shows")?.footer).toEqual({ kind: "block", block: { code: "noData", ruleId: "rule-shows" } })
    expect(card("rule-same")?.posters).toEqual(["5106", "5107"])
  })
})

describe("the budget (TS 17.1)", () => {
  it("renders 50 rules and 10 recipes on a large warm snapshot within the 3 s ceiling", async () => {
    const shows = Array.from({ length: 300 }, (_, i) => show(1000 + i, 40 + (i % 7)))
    const items: SnapshotItem[] = [
      ...Array.from({ length: 1000 }, (_, i) => movie(1000 + i, 5 + (i % 40), i % 3 === 0 ? { plays: { lastCountedAt: null, countedAt: [], viewers: [] } } : {})),
      ...shows,
      ...shows.flatMap((s) => [1, 2, 3, 4, 5, 6, 7].map((n) => buildSeasonItem(s, n))),
    ]
    const level = (i: number) => (["movie", "show", "season"] as const)[i % 3]
    const definitionAt = (i: number) => (level(i) === "movie" ? MOVIE_DEFINITION : { ...SHOW_DEFINITION, level: level(i),
      then: { ...SHOW_DEFINITION.then, action: level(i) === "season" ? ("season.unmonitorDeleteFiles" as const) : ("show.delete" as const) } })
    snapshotMock.mockResolvedValue(snapshotOf(items))
    prismaMock.cleanupRule.findMany.mockResolvedValue(Array.from({ length: 50 }, (_, i) =>
      storedRule(`rule-${i}`, `Rule ${String(i).padStart(2, "0")}`, { mode: i % 2 === 0 ? "dryRun" : "reviewFirst", definition: definitionAt(i),
        stats: { dryRuns: dryRuns(MOVIE_DEFINITION, [3, 3]) } })))

    const started = performance.now()
    const data = await getCleanupOverview(AT)
    const elapsed = performance.now() - started

    expect(data.rules).toHaveLength(50)
    expect(data.recipes).toHaveLength(10)
    expect(elapsed).toBeLessThan(3000)
  })
})
