/**
 * @jest-environment node
 */

/**
 * `getCleanupLeavingSoon` (UX 4.7, 12.5, TS 10.4, 10.5): the admin check
 * first, the params, a mixed deletion batch (E35) and an entry batch (X3),
 * batches that no list filter hides (architecture-r6-1), the groups with the
 * due group "Shown above", each status of `itemStatus()`, paging across
 * groups, the exits line, the totals and deleted rule names.
 */

import { mockReset } from "jest-mock-extended"

import { buildCleanupItem, buildCleanupRule, buildCleanupSettings, buildCleanupSnapshot } from "@/__tests__/helpers/cleanup-factories"
import { buildUser } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildRuleStats, buildWhySnapshot } from "@/lib/cleanup/__tests__/helpers/builders"
import { batchHash } from "@/lib/cleanup/run/batches"
import { getCleanupLeavingSoon } from "@/lib/data/cleanup-leaving"
import { assertAdmin } from "@/lib/admin"
import type { CleanupItem, CleanupSettings } from "@/lib/generated/prisma/client"
import { isRedisConfigured } from "@/lib/queue/connection"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/queue/connection", () => ({ isRedisConfigured: jest.fn() }))

const NOW = new Date("2026-11-08T12:00:00.000Z")
const CHECKED = new Date("2026-11-08T03:07:00.000Z")
const GIB = 1024n ** 3n
const exitsGroupBy = prismaMock.cleanupOutcome.groupBy as jest.Mock

function item(itemKey: string, overrides: Partial<CleanupItem> = {}): CleanupItem {
  const [level, source, id, season] = itemKey.split(":")
  return buildCleanupItem({
    id: `id-${itemKey}`, itemKey, level, titleKey: `${source}:${id}`, title: `Title ${id}`, seasonNumber: season ? Number(season) : null,
    sectionId: level === "movie" ? "1" : "2", ratingKey: `7${id}${season ?? ""}`, checkedAt: CHECKED, ...overrides,
  })
}

// Due batch shows of the Review first rule: a mixed batch (E35)
const A = item("show:tvdb:1", { state: "leaving", needsApproval: true, leaveOn: "2026-11-08", ruleIds: ["r-review"], action: "show.delete",
  importListExclusion: true, sizeBytes: 410n * GIB, seasonCount: 5 })
const B = item("show:tvdb:2", { state: "leaving", needsApproval: true, leaveOn: "2026-11-06", ruleIds: ["r-review"],
  action: "show.unmonitorDeleteFiles", sizeBytes: 211n * GIB, checkedAt: new Date("2026-11-08T03:05:00.000Z") })
// Automatic seasons and movies, and the show of the seasons
const C = item("season:tvdb:3:4", { leaveOn: "2026-11-19", ruleIds: ["r-auto"], action: "season.unmonitorDeleteFiles", sizeBytes: 38n * GIB })
const D = item("season:tvdb:3:2", { leaveOn: "2026-11-19", ruleIds: ["r-auto"], action: "season.unmonitorDeleteFiles", sizeBytes: 14n * GIB,
  holdCode: "sourceFailed:sonarr" })
const E = item("show:tvdb:3", { leaveOn: "2026-12-02", ruleIds: ["r-gone"], action: "show.delete", sizeBytes: 300n * GIB,
  postponedAt: new Date("2026-11-07T10:00:00.000Z"), postponedBy: "admin-2" })
const G = item("movie:tmdb:8", { state: "approved", needsApproval: true, leaveOn: "2026-11-08", ruleIds: ["r-review"], sizeBytes: 20n * GIB,
  approvedAt: CHECKED, approvedBy: "admin-1" })
const H = item("movie:tmdb:9", { leaveOn: "2026-11-07", ruleIds: ["r-auto"], sizeBytes: 15n * GIB, failCode: "HTTP" })
const I = item("movie:tmdb:10", { leaveOn: "2026-11-08", ruleIds: ["r-auto"], sizeBytes: 12n * GIB, deferredAt: new Date("2026-11-08T11:00:00.000Z") })
const J = item("movie:tmdb:11", { state: "deleting", leaveOn: "2026-11-08", ruleIds: ["r-auto"], sizeBytes: 25n * GIB })
const K = item("movie:tmdb:12", { leaveOn: "2026-11-21", ruleIds: ["r-auto"], sizeBytes: 600n * GIB })
const M = item("movie:tmdb:13", { leaveOn: "2026-11-21", ruleIds: ["r-auto"], sizeBytes: 10n * GIB })
// Held by the entry check
const F = item("movie:tmdb:7", { state: "held", leaveOn: null, enteredAt: null, ruleIds: ["r-held"], heldAt: new Date("2026-11-08T03:08:00.000Z") })
const ALL = [A, B, C, D, E, F, G, H, I, J, K, M]

const RULES = [
  buildCleanupRule({ id: "r-dry", name: "A dry rule", mode: "dryRun" }),
  buildCleanupRule({ id: "r-review", name: "Big shows nobody plays", mode: "reviewFirst" }),
  buildCleanupRule({ id: "r-held", name: "Movies nobody watches", mode: "reviewFirst",
    stats: buildRuleStats({ lastEval: { ...buildRuleStats().lastEval!, checked: 5 } }) }),
  buildCleanupRule({ id: "r-auto", name: "Old seasons nobody plays", mode: "automatic" }),
]

const SNAPSHOT = buildCleanupSnapshot({
  sources: [{ service: "sonarr", state: "failed", readAt: "2026-11-08T03:07:00.000Z", errorCode: "TIMEOUT" }],
  facts: {
    ...(buildCleanupSnapshot().facts as object),
    libraries: [
      { sectionId: "1", title: "Movies", type: "movie", agent: null, locations: [], arr: "radarr", noIds: false, items: 1, seasons: 0, bytes: 1 },
      { sectionId: "2", title: "TV Shows", type: "show", agent: null, locations: [], arr: "sonarr", noIds: false, items: 1, seasons: 1, bytes: 1 },
    ],
    disk: { freeBytes: 0, totalBytes: Number(20_000n * GIB) },
  },
})

function seed({ items = ALL, settings = {} as Partial<CleanupSettings>, snapshot = SNAPSHOT as typeof SNAPSHOT | null } = {}) {
  prismaMock.cleanupSettings.findUnique.mockResolvedValue(buildCleanupSettings({ enabled: true, ...settings }))
  prismaMock.config.findUnique.mockResolvedValue({ timezone: "UTC" } as never)
  prismaMock.cleanupRule.findMany.mockResolvedValue(RULES)
  prismaMock.cleanupSnapshot.findFirst.mockResolvedValue(snapshot)
  const whys = items.map((row) => ({ ...row, why: row === A ? buildWhySnapshot() : row === B ? buildWhySnapshot({ facts: { ...buildWhySnapshot().facts,
    lastCountedAt: null } }) : row.why }))
  // The list read omits the Why; the page read of the batch rows selects it
  prismaMock.cleanupItem.findMany.mockImplementation(((args: { select?: object }) => Promise.resolve(args.select ? whys : items)) as never)
  prismaMock.cleanupOutcome.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { sizeBytes: null } } as never)
  exitsGroupBy.mockResolvedValue([
    { reason: "kept", _count: { _all: 4 } }, { reason: "played", _count: { _all: 3 } }, { reason: "excluded", _count: { _all: 2 } },
    { reason: "deleted", _count: { _all: 9 } },
  ])
  prismaMock.cleanupRun.findFirst.mockResolvedValue({ trigger: "admin" } as never)
  prismaMock.user.findMany.mockResolvedValue([buildUser({ id: "admin-2", name: "Sam Admin" }), buildUser({ id: "admin-1", name: "Me" })])
}

const load = (params: Record<string, string> = {}) => getCleanupLeavingSoon(params, NOW)

beforeEach(() => {
  mockReset(prismaMock)
  exitsGroupBy.mockReset()
  jest.mocked(assertAdmin).mockReset().mockResolvedValue({ user: { id: "admin-1" }, expires: "" } as never)
  jest.mocked(isRedisConfigured).mockReturnValue(true)
  seed()
})

describe("getCleanupLeavingSoon", () => {
  it("checks the admin first and reads nothing for another caller", async () => {
    jest.mocked(assertAdmin).mockRejectedValue(new Error("forbidden"))

    await expect(load()).rejects.toThrow("forbidden")
    expect(prismaMock.cleanupItem.findMany).not.toHaveBeenCalled()
    expect(prismaMock.cleanupRule.findMany).not.toHaveBeenCalled()
  })

  it("reads stored rows only, without the stored Why of the list", async () => {
    await load()

    expect(prismaMock.cleanupItem.findMany.mock.calls[0][0]).toEqual({
      where: { state: { in: ["held", "leaving", "approved", "deleting"] } }, omit: { why: true },
    })
    expect(prismaMock.cleanupItem.findMany.mock.calls[1][0]).toEqual({
      where: { itemKey: { in: [A.itemKey, B.itemKey] } }, select: { itemKey: true, why: true },
    })
  })

  it("returns a mixed deletion batch with its hash, counts, plan and rows (E35)", async () => {
    const data = await load()

    const batch = data.batches[0]
    expect(batch).toMatchObject({
      kind: "deletion", id: "deletion-r-review", ruleId: "r-review", ruleName: "Big shows nobody plays", level: "show",
      action: "show.delete", importListExclusion: true, actionCounts: { "show.delete": 1, "show.unmonitorDeleteFiles": 1 }, exclusionCount: 1,
      count: 2, bytes: String(621n * GIB), keysHash: batchHash([A, B]), reviewedAt: NOW.toISOString(), dueAt: "2026-11-08",
      dueSince: "2026-11-06", checkedAt: "2026-11-08T03:05:00.000Z", plan: { today: { count: 1, bytes: String(410n * GIB) }, lastDay: "2026-11-09" },
      oversize: [], rowsPage: 1, rowsPageCount: 1,
    })
    expect(batch.kind === "deletion" && batch.rows.map((row) => [row.itemKey, row.action, row.importListExclusion, row.lastPlayedAt])).toEqual([
      [A.itemKey, "show.delete", true, new Date((NOW.getTime() / 1000 - 400 * 86_400) * 1000).toISOString()],
      [B.itemKey, "show.unmonitorDeleteFiles", false, "never"],
    ])
  })

  it("returns the entry batch with the run that held it and the entry check count (X3)", async () => {
    const data = await load()

    expect(data.batches[1]).toEqual({
      kind: "entry", id: "entry-r-held", ruleId: "r-held", ruleName: "Movies nobody watches", level: "movie", count: 1, bytes: String(20n * GIB),
      keysHash: expect.stringMatching(/^[a-f0-9]{64}$/), reviewedAt: NOW.toISOString(),
      heldBy: { trigger: "admin", at: "2026-11-08T03:08:00.000Z" }, limit: 0,
    })
    expect(prismaMock.cleanupRun.findFirst.mock.calls[0][0]).toMatchObject({ where: { kind: "run", held: { gt: 0 } } })
  })

  it("still returns the batch of another rule with a rule filter (architecture-r6-1)", async () => {
    const data = await load({ rule: "r-auto", status: "deletesOn", q: "title", library: "1" })

    expect(data.batches.map((batch) => batch.id)).toEqual(["deletion-r-review", "entry-r-held"])
    expect(data.rows.map((row) => row.itemKey)).toEqual([K.itemKey])
  })

  it("groups by leave date with the due group first and its batch titles shown above", async () => {
    const data = await load()

    expect(data.groups).toEqual([
      { date: "due", count: 6, bytes: String(693n * GIB), inBatch: true, level: null },
      { date: "2026-11-19", count: 2, bytes: String(52n * GIB), inBatch: false, level: "season" },
      { date: "2026-11-21", count: 2, bytes: String(610n * GIB), inBatch: false, level: "movie" },
      { date: "2026-12-02", count: 1, bytes: String(300n * GIB), inBatch: false, level: "show" },
    ])
    expect(data.rows.map((row) => row.itemKey)).toEqual([J, G, H, I, C, D, K, M, E].map((row) => row.itemKey))
    expect(data.totals).toEqual({ count: 11, bytes: String(1655n * GIB), volumePercent: 8.3 })
    expect(data.total).toBe(9)
  })

  it("gives every row the status of itemStatus with its values", async () => {
    const data = await load()

    const statuses = Object.fromEntries(data.rows.map((row) => [row.itemKey, [row.status, row.statusValues]]))
    expect(statuses).toEqual({
      [J.itemKey]: ["deleting", {}],
      [G.itemKey]: ["deletesOn", { day: "2026-11-08" }],
      [H.itemKey]: ["failed", { note: "Radarr returned HTTP error" }],
      [I.itemKey]: ["deferred", {}],
      [C.itemKey]: ["deletesOn", { day: "2026-11-19" }],
      [D.itemKey]: ["onHold", { note: "Sonarr did not answer at 3:07 AM" }],
      [K.itemKey]: ["deletesOn", { day: "2026-11-21" }],
      [M.itemKey]: ["waitsForBudget", { day: "2026-11-22" }],
      [E.itemKey]: ["postponed", { day: "2026-12-02", note: "Sam Admin" }],
    })
  })

  it("fills the row columns: library, rules, deleted rule names, the show line, codes and links", async () => {
    const data = await load()
    const row = (key: string) => data.rows.find((r) => r.itemKey === key)!

    expect(row(C.itemKey)).toMatchObject({ library: "TV Shows", rules: [{ id: "r-auto", name: "Old seasons nobody plays" }], showAlsoLeaving: true,
      state: "leaving", leaveAt: "2026-11-19", group: "2026-11-19", plannedDay: "2026-11-19", seasonNumber: 4, posterKey: "734",
      plexUrl: expect.stringContaining("example-machine-id") })
    expect(row(E.itemKey)).toMatchObject({ rules: [{ id: "r-gone", name: "A deleted rule" }], showAlsoLeaving: false, postponedBy: "Sam Admin" })
    expect(row(D.itemKey)).toMatchObject({ holdCode: "sourceFailed:sonarr", plannedDay: null })
    expect(row(H.itemKey)).toMatchObject({ failCode: "HTTP", library: "Movies" })
    expect(row(I.itemKey).deferredAt).toBe("2026-11-08T11:00:00.000Z")
  })

  it("names the postponer 'you' for the viewer", async () => {
    seed({ items: [{ ...E, postponedBy: "admin-1" }] })

    const data = await load()

    expect(data.rows[0]).toMatchObject({ postponedBy: "you", statusValues: { day: "2026-12-02", note: "you" } })
  })

  it("returns the 7-day exits by bucket, without deletions", async () => {
    const data = await load()

    expect(data.exits7d).toEqual({ kept: 4, played: 3, other: 2 })
    expect(exitsGroupBy.mock.calls[0][0].where).toEqual({ kind: { in: ["rescued", "released"] },
      actedAt: { gte: new Date("2026-11-01T12:00:00.000Z") } })
  })

  it("returns the filters: live rules, the libraries and every status", async () => {
    const data = await load()

    expect(data.filters.rules).toEqual([{ id: "r-review", name: "Big shows nobody plays" }, { id: "r-held", name: "Movies nobody watches" },
      { id: "r-auto", name: "Old seasons nobody plays" }])
    expect(data.filters.libraries).toEqual([{ sectionId: "1", title: "Movies" }, { sectionId: "2", title: "TV Shows" }])
    expect(data.filters.statuses).toContain("waitsForBudget")
  })

  it("pages 50 items across groups, and lists only the groups of the page", async () => {
    const many = Array.from({ length: 60 }, (_, i) => item(`movie:tmdb:${100 + i}`, { leaveOn: i < 30 ? "2026-11-20" : "2026-11-25", ruleIds: ["r-auto"],
      sizeBytes: BigInt(100 - i) * GIB }))
    seed({ items: [A, ...many] })

    const first = await load()
    const second = await load({ page: "2" })

    expect(first.rows).toHaveLength(50)
    expect(first.groups.map((g) => g.date)).toEqual(["due", "2026-11-20", "2026-11-25"])
    expect(second.rows.map((row) => row.itemKey)).toEqual(many.slice(50).map((row) => row.itemKey))
    expect(second.groups.map((g) => [g.date, g.count])).toEqual([["2026-11-25", 30]])
    expect([second.page, second.size, second.total]).toEqual([2, 50, 60])
  })

  it("pages the rows of a deletion batch, 50 a page, largest first", async () => {
    const big = Array.from({ length: 60 }, (_, i) => item(`show:tvdb:${200 + i}`, { needsApproval: true, leaveOn: "2026-11-08",
      ruleIds: ["r-review"], action: "show.delete", sizeBytes: BigInt(200 - i) * GIB }))
    seed({ items: big })

    const data = await load({ batch: "deletion-r-review", batchPage: "2" })
    const other = await load({ batch: "deletion-other", batchPage: "2" })

    const batch = data.batches[0]
    expect(batch.kind === "deletion" && [batch.rowsPage, batch.rowsPageCount, batch.rows.length, batch.rows[0].itemKey])
      .toEqual([2, 2, 10, big[50].itemKey])
    expect(other.batches[0].kind === "deletion" && other.batches[0].rowsPage).toBe(1)
    expect(data.rows).toEqual([])
    expect(data.groups.map((group) => [group.date, group.count, group.inBatch])).toEqual([["due", 60, true]])
  })

  it("names the oversize titles of a batch (E17)", async () => {
    seed({ items: [item("season:tvdb:9:2", { needsApproval: true, leaveOn: "2026-11-08", ruleIds: ["r-review"], sizeBytes: 900n * GIB,
      action: "season.unmonitorDeleteFiles" })] })

    const data = await load()

    expect(data.batches[0]).toMatchObject({ level: "season", oversize: [{ title: "Title 9, Season 2", day: "2026-11-08" }] })
  })

  it("reads every status as paused, and names who paused, while cleanup is paused", async () => {
    seed({ settings: { pausedAt: NOW, pausedBy: "admin-2", enabledAt: CHECKED } })

    const data = await load()

    expect(new Set(data.rows.map((row) => row.status))).toEqual(new Set(["paused"]))
    expect(data.feature).toEqual({ enabled: true, enabledAt: CHECKED.toISOString(), pausedAt: NOW.toISOString(),
      pausedBy: { id: "admin-2", name: "Sam Admin", isYou: false }, redis: true })
  })

  it("gives the daily budget of Settings for the approve dialog and the batch footer", async () => {
    seed({ settings: { options: { version: 1, budget: { items: 12, bytes: Number(300n * GIB) } } } })

    const data = await load()

    expect(data.budget).toEqual({ items: 12, bytes: String(300n * GIB) })
  })

  it("reads a pausing admin whose user row is gone as Unknown member, as the other tabs do", async () => {
    seed({ settings: { pausedAt: NOW, pausedBy: "admin-gone" } })

    const data = await load()

    expect(data.feature.pausedBy).toEqual({ id: "admin-gone", name: "Unknown member", isYou: false })
  })

  it("names no pausing admin once cleanup runs again", async () => {
    seed({ settings: { pausedAt: null, pausedBy: "admin-2" } })

    const data = await load()

    expect(data.feature.pausedBy).toBeNull()
    expect(data.rows.find((row) => row.itemKey === E.itemKey)?.status).toBe("postponed")
  })

  it("reads the clock when no time is given", async () => {
    await expect(getCleanupLeavingSoon({})).resolves.toMatchObject({ page: 1, size: 50 })
  })

  it("works with no library data and no item", async () => {
    jest.mocked(isRedisConfigured).mockReturnValue(false)
    seed({ items: [], snapshot: null, settings: { enabled: false } })

    const data = await load({ page: "0", size: "7", status: "nope", rule: "bad id!" })

    expect(data).toMatchObject({ batches: [], groups: [], rows: [], total: 0, page: 1, size: 50,
      totals: { count: 0, bytes: "0", volumePercent: null }, filters: { libraries: [] },
      feature: { enabled: false, enabledAt: null, pausedAt: null, pausedBy: null, redis: false } })
    expect(prismaMock.cleanupItem.findMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.user.findMany).not.toHaveBeenCalled()
  })

  it("reads a library that the data does not name as unknown, and a title with no size as null", async () => {
    seed({ items: [item("movie:tmdb:5", { sectionId: "9", sizeBytes: 0n })] })

    const data = await load()

    expect(data.rows[0]).toMatchObject({ library: "Unknown library", sizeBytes: null })
  })
})
