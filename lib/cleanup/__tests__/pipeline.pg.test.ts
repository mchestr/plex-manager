/**
 * @jest-environment node
 */

/**
 * The nightly chain on PostgreSQL (TS 16.3): the read job, then the run it
 * chains, with two live rules and one Dry run rule. The entry check holds a
 * batch, the act step deletes one title, rescues one that was played and
 * defers one that plays now. The outcomes, the `CLEANUP_*` audit rows with
 * their run id, retention and the released claims are real. Then the review
 * cases: a rule protection saved before an approval, a rule protection saved
 * during an act job after its reconcile and before its candidate read, a
 * second approval during an act job, a play inside a refreshed snapshot, a
 * pause between two items, and one show item with one season item.
 *
 * Only the upstream connections are mocked. The read job's `readLibrary()`
 * is mocked too: it stores the invented library through the real snapshot
 * store, so the run reads it as it reads a real read (TS 16.3 "read (mocked
 * sources)"). Gated by `describePg` and run only by `npm run
 * test:integration`. The suite empties the cleanup tables before each case:
 * the integration suites run one at a time on their own test database.
 */

import { PrismaPg } from "@prisma/adapter-pg"
import type { Job } from "bullmq"

import { describePg } from "@/__tests__/helpers/integration"
import { buildCondition, buildDefinition, buildMovieItem, buildSeasonItem, buildShowItem, buildSnapshotFacts, buildSourceStatuses, buildWhySnapshot }
  from "@/lib/cleanup/__tests__/helpers/builders"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import { serverZone } from "@/lib/cleanup/settings"
import { resetSnapshotCache } from "@/lib/cleanup/snapshot/cache"
import { createSnapshotHeader, writeSnapshot } from "@/lib/cleanup/snapshot/store"
import { PrismaClient } from "@/lib/generated/prisma/client"
import { getCleanupProcessor } from "@/lib/queue/jobs/cleanup"
import { AuditEventType } from "@/lib/security/audit-log"
import { addDays } from "@/lib/ui/date-range"
import { dayKey } from "@/lib/utils/zoned-time"
import type { RuleDefinition } from "@/lib/validations/cleanup-rule"

let mockDb: PrismaClient
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockDb
  },
}))
jest.mock("@/lib/utils/logger", () => ({ createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }))
const mockUp = {
  active: jest.fn(), readLibrary: jest.fn(), addJob: jest.fn(), getRadarrMovie: jest.fn(), getSonarrSeries: jest.fn(), getSonarrSeriesFull: jest.fn(),
  listSonarrEpisodeFiles: jest.fn(), listSonarrEpisodes: jest.fn(), roots: jest.fn(), tags: jest.fn(), deleteRadarrMovie: jest.fn(),
  deleteSonarrSeries: jest.fn(), putSonarrSeries: jest.fn(), unmonitorSonarrEpisodes: jest.fn(), deleteSonarrEpisodeFiles: jest.fn(),
  getPlexMetadata: jest.fn(), listPlexSeasonFiles: jest.fn(), readPlayingKeys: jest.fn(), forEachRequest: jest.fn(), runOverseerrJob: jest.fn(),
  forEachHistoryRow: jest.fn(), ok: jest.fn(),
}
function mockCall(name: keyof typeof mockUp) {
  return (...args: unknown[]) => mockUp[name](...args)
}
jest.mock("@/lib/data/active-service", () => ({ getActiveService: mockCall("active") }))
jest.mock("@/lib/cleanup/snapshot/read", () => ({ readLibrary: mockCall("readLibrary") }))
jest.mock("@/lib/queue/client", () => ({ addJob: mockCall("addJob") }))
jest.mock("@/lib/connections/radarr-library", () => ({ getRadarrMovie: mockCall("getRadarrMovie"), listRadarrRootFolders: mockCall("roots"),
  listRadarrTags: mockCall("tags") }))
jest.mock("@/lib/connections/sonarr-library", () => ({ getSonarrSeries: mockCall("getSonarrSeries"), getSonarrSeriesFull: mockCall("getSonarrSeriesFull"),
  listSonarrEpisodeFiles: mockCall("listSonarrEpisodeFiles"), listSonarrEpisodes: mockCall("listSonarrEpisodes"), listSonarrRootFolders: mockCall("roots"),
  listSonarrTags: mockCall("tags") }))
jest.mock("@/lib/connections/radarr-write", () => ({ deleteRadarrMovie: mockCall("deleteRadarrMovie"), unmonitorRadarrMovie: mockCall("ok"),
  deleteRadarrMovieFile: mockCall("ok") }))
jest.mock("@/lib/connections/sonarr-write", () => ({ deleteSonarrSeries: mockCall("deleteSonarrSeries"), putSonarrSeries: mockCall("putSonarrSeries"),
  unmonitorSonarrEpisodes: mockCall("unmonitorSonarrEpisodes"), deleteSonarrEpisodeFiles: mockCall("deleteSonarrEpisodeFiles") }))
jest.mock("@/lib/connections/plex-library-read", () => ({ getPlexMetadata: mockCall("getPlexMetadata"), listPlexSeasonFiles: mockCall("listPlexSeasonFiles") }))
jest.mock("@/lib/connections/plex-playing", () => ({ readPlayingKeys: mockCall("readPlayingKeys") }))
jest.mock("@/lib/connections/plex-collections", () => ({ removePlexCollectionItem: mockCall("ok") }))
jest.mock("@/lib/connections/plex-scan", () => ({ refreshPlexPath: mockCall("ok") }))
jest.mock("@/lib/connections/overseerr-cleanup", () => ({ forEachRequest: mockCall("forEachRequest"), runOverseerrJob: mockCall("runOverseerrJob") }))
jest.mock("@/lib/connections/tautulli-history-all", () => ({ forEachHistoryRow: mockCall("forEachHistoryRow") }))

const ADMIN = `pipeline-admin-${Date.now()}`
const nowS = () => Math.floor(Date.now() / 1000)
const GiB = 1024 ** 3
let today = ""
const OK = { ok: true, data: null }

const movie = (n: number, section: string) => buildMovieItem({ key: `movie:tmdb:${n}`, titleKey: `tmdb:${n}`, title: `Invented ${n}`, sectionId: section,
  ratingKey: `${7000 + n}`, copies: [{ ratingKey: `${7000 + n}`, sectionId: section }], ids: { tmdb: n }, sizeBytes: (n % 7 + 1) * GiB,
  arr: { service: "radarr", id: n, titleSlug: `invented-${n}`, path: `/media/movies/Invented ${n}`, root: "/media/movies", tags: [], importList: false,
    monitored: true, fileId: n } })
const OLD_MOVIE: RuleDefinition = buildDefinition({ libraries: ["1"], then: { graceDays: 1, action: "movie.delete", importListExclusion: false },
  conditions: [buildCondition("watch.lastPlayed", { value: { duration: { amount: 90, unit: "days" }, orNever: true } })] })
const KEPT_BY_P1 = buildCondition("watch.lastPlayed", { id: "p1", op: "lessThan", value: { duration: { amount: 3650, unit: "days" }, orNever: false } })

/** Stores a complete snapshot of `items` through the real store, as a read does. */
async function storeSnapshot(items: SnapshotItem[], takenAt = new Date(Date.now() - 3_600_000)): Promise<string> {
  const id = await createSnapshotHeader({ trigger: "scheduled", startedAt: takenAt })
  const facts = buildSnapshotFacts({ takenAt: takenAt.toISOString(), rowBaseline: {},
    history: { startAt: nowS() - 11 * 365 * 86_400, newestAt: nowS() - 86_400, rows: 5000, orphans: 0, usersWithPlay: 12 } })
  const parts = { movie: items.filter((i) => i.level === "movie"), show: items.filter((i) => i.level === "show"), season: items.filter((i) => i.level === "season") }
  await writeSnapshot(id, { parts, sources: buildSourceStatuses({}), facts, finishedAt: new Date() })
  resetSnapshotCache()
  return id
}

async function seedRule(id: string, mode: string, definition: RuleDefinition, createdAt = new Date("2026-01-01T00:00:00Z")) {
  await mockDb.cleanupRule.create({ data: { id, name: id, mode, definition, createdBy: ADMIN, createdAt } })
}

/** A row in Leaving soon that entered 40 days ago and is due today. */
async function seedItem(item: SnapshotItem, ruleIds: string[], extra: Record<string, unknown> = {}) {
  const arr = item.arr!
  const level = item.level
  return mockDb.cleanupItem.create({ data: { itemKey: item.key, level, titleKey: item.titleKey, sectionId: item.sectionId, ratingKey: item.ratingKey,
    title: item.title, year: item.year, seasonNumber: item.seasonNumber, sizeBytes: BigInt(item.sizeBytes ?? 0), state: "leaving", ruleIds,
    arr: { service: arr.service, id: arr.id, titleSlug: arr.titleSlug, path: arr.path }, action: level === "movie" ? "movie.delete" : `${level}.delete`,
    enteredAt: new Date(Date.now() - 40 * 86_400_000), leaveOn: addDays(today, -2), firstLeaveOn: addDays(today, -2), checkedAt: new Date(),
    why: buildWhySnapshot({ takenAt: new Date(Date.now() - 3_600_000).toISOString() }), ...extra } })
}

const approve = (itemKeys: string[]) => mockDb.cleanupItem.updateMany({ where: { itemKey: { in: itemKeys } },
  data: { state: "approved", approvedAt: new Date(), approvedBy: ADMIN } })
const process = (type: string, data: unknown) => getCleanupProcessor(type)!({ data } as unknown as Job)
const outcomes = () => mockDb.cleanupOutcome.findMany({ orderBy: { itemKey: "asc" }, select: { itemKey: true, kind: true, reason: true, runId: true, detail: true } })
/** The `CLEANUP_*` rows of a run. `logAuditEvent` writes without waiting, so it polls for `count` rows for at most 2 s. */
async function auditRows(runId: string, count: number) {
  for (let i = 0; ; i++) {
    const rows = await mockDb.auditLog.findMany({ where: { type: { startsWith: "CLEANUP_" }, details: { path: ["runId"], equals: runId } } })
    if (rows.length >= count || i >= 20) return rows
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}
const deletedMovies = () => mockUp.deleteRadarrMovie.mock.calls.map(([, id]) => id as number)

describePg("the media cleanup pipeline on PostgreSQL", (databaseUrl) => {
  beforeAll(async () => {
    mockDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    await mockDb.user.create({ data: { id: ADMIN, name: "Invented Admin", isAdmin: true } })
    today = dayKey(Date.now(), await serverZone())
  })

  beforeEach(async () => {
    for (const table of ["cleanupOutcome", "cleanupItem", "cleanupProtection", "cleanupRun", "cleanupRule", "cleanupSnapshot", "cleanupSettings"] as const) {
      await (mockDb[table] as { deleteMany: (args: object) => Promise<unknown> }).deleteMany({})
    }
    await mockDb.cleanupSettings.create({ data: { id: "cleanup", enabled: true, options: { entryCheck: { count: 2 }, protections: { g7: { enabled: false } } } } })
    for (const fn of Object.values(mockUp)) fn.mockReset()
    resetSnapshotCache()
    mockUp.active.mockImplementation(async (kind: string) => (kind === "plex" ? { url: "http://plex.test", token: "t" }
      : { url: `http://${kind}.test`, apiKey: `${kind}-key` }))
    mockUp.roots.mockImplementation(async (config: { url: string }) => ({ ok: true, data: [{ path: config.url.includes("radarr") ? "/media/movies" : "/media/tv" }] }))
    mockUp.tags.mockResolvedValue({ ok: true, data: [] })
    mockUp.getRadarrMovie.mockImplementation(async (_c: unknown, id: number) => ({ ok: true, data: { id, title: `Invented ${id}`, titleSlug: `invented-${id}`,
      tmdbId: id, path: `/media/movies/Invented ${id}`, monitored: true, hasFile: true, movieFileId: id, added: "2024-01-01T00:00:00Z", tags: [] } }))
    mockUp.getPlexMetadata.mockImplementation(async (_c: unknown, ratingKey: string) => ({ ok: true, data: { ratingKey, type: "movie",
      Media: [{ Part: [{ file: `/media/movies/Invented ${Number(ratingKey) - 7000}/movie.mkv` }] }] } }))
    mockUp.readPlayingKeys.mockResolvedValue({ ok: true, data: new Set<string>() })
    mockUp.forEachRequest.mockResolvedValue({ ok: true, data: { rows: 0, pages: 1 } })
    mockUp.forEachHistoryRow.mockResolvedValue({ ok: true, data: { rows: 0, pages: 1, complete: true } })
    mockUp.runOverseerrJob.mockResolvedValue(OK)
    for (const name of ["ok", "putSonarrSeries", "unmonitorSonarrEpisodes", "deleteSonarrSeries"] as const) mockUp[name].mockResolvedValue(OK)
    mockUp.deleteRadarrMovie.mockResolvedValue({ ok: true, data: { gone: false } })
    mockUp.deleteSonarrEpisodeFiles.mockResolvedValue({ ok: true, data: { deleted: 1 } })
  })

  afterAll(async () => {
    if (!mockDb) return
    for (const table of ["cleanupOutcome", "cleanupItem", "cleanupRun", "cleanupRule", "cleanupSnapshot", "cleanupSettings"] as const) {
      await (mockDb[table] as { deleteMany: (args: object) => Promise<unknown> }).deleteMany({})
    }
    await mockDb.user.deleteMany({ where: { id: ADMIN } })
    await mockDb.$disconnect()
  })

  it("runs the nightly chain: read, run with two live rules and a Dry run rule, entry check, act step, outcomes, audit rows, retention, claims", async () => {
    const [a1, a2, a3] = [movie(101, "1"), movie(102, "1"), movie(103, "1")]
    const held = [movie(201, "3"), movie(202, "3"), movie(203, "3")]
    await seedRule("rule-a", "automatic", OLD_MOVIE)
    await seedRule("rule-b", "reviewFirst", { ...OLD_MOVIE, libraries: ["3"] }, new Date("2026-01-02T00:00:00Z"))
    await seedRule("rule-d", "dryRun", OLD_MOVIE, new Date("2026-01-03T00:00:00Z"))
    for (const item of [a1, a2, a3]) await seedItem(item, ["rule-a"])
    for (let i = 0; i < 31; i++) await mockDb.cleanupRun.create({ data: { kind: "run", trigger: "scheduled", startedAt: new Date(Date.now() - (40 + i) * 86_400_000) } })
    mockUp.readLibrary.mockImplementation(async () => ({ snapshotId: await storeSnapshot([a1, a2, a3, ...held]), status: "complete", sources: buildSourceStatuses() }))
    mockUp.forEachHistoryRow.mockImplementation(async (_c: unknown, query: { ratingKeys: { keys: string[] } }, onRows: (rows: unknown[]) => unknown) => {
      if (query.ratingKeys.keys.includes(a2.ratingKey)) await onRows([{ row_id: "9", stopped: nowS() - 60, play_duration: 600, percent_complete: 20 }])
      return { ok: true, data: { rows: 1, pages: 1, complete: true } }
    })
    mockUp.readPlayingKeys.mockResolvedValue({ ok: true, data: new Set([a3.ratingKey]) })

    await expect(process("cleanup:read", { trigger: "scheduled", chain: true })).resolves.toMatchObject({ status: "complete", failedSources: [] })
    expect(mockUp.addJob).toHaveBeenCalledWith("cleanup:run", { trigger: "scheduled", act: true, readStatus: "complete" }, expect.any(Object))
    const run = await process("cleanup:run", mockUp.addJob.mock.calls[0][1])
    expect(run).toMatchObject({ busy: false, outcome: "held", held: 3, deleted: 1, rescued: 1, deferred: 1 })
    const runId = (run as { runId: string }).runId

    expect(deletedMovies()).toEqual([101])
    expect(await outcomes()).toEqual([{ itemKey: a1.key, kind: "deleted", reason: "deleted", runId, detail: null },
      { itemKey: a2.key, kind: "rescued", reason: "played", runId, detail: null }])
    expect(await mockDb.cleanupItem.findMany({ orderBy: { itemKey: "asc" }, select: { itemKey: true, state: true, deferredAt: true } })).toEqual([
      { itemKey: a3.key, state: "leaving", deferredAt: expect.any(Date) }, ...held.map((h) => ({ itemKey: h.key, state: "held", deferredAt: null }))])
    expect(mockUp.runOverseerrJob).toHaveBeenCalledTimes(1)
    const audit = await auditRows(runId, 4)
    expect(audit.map((row) => row.type).sort()).toEqual([AuditEventType.CLEANUP_ITEMS_HELD, AuditEventType.CLEANUP_ITEM_DELETED,
      AuditEventType.CLEANUP_ITEM_RESCUED, AuditEventType.CLEANUP_RUN].sort())
    const stored = await mockDb.cleanupRun.findUniqueOrThrow({ where: { id: runId } })
    expect(stored).toMatchObject({ kind: "run", outcome: "held", deleted: 1, rescued: 1, deferred: 1, held: 3, finishedAt: expect.any(Date) })
    expect(await mockDb.cleanupRun.count()).toBe(30)
    const dry = await mockDb.cleanupRule.findUniqueOrThrow({ where: { id: "rule-d" } })
    expect(dry).toMatchObject({ revision: 1, lastDryRunAt: expect.any(Date), stats: { dryRuns: [expect.objectContaining({ runId, matches: 3 })] } })
    await expect(mockDb.cleanupSettings.findUniqueOrThrow({ where: { id: "cleanup" } })).resolves.toMatchObject({ runClaimAt: null, readClaimAt: null })
  })

  it("does not delete a title that a rule protection saved before the approval protects", async () => {
    const item = movie(301, "1")
    await seedRule("rule-a", "reviewFirst", OLD_MOVIE)
    await storeSnapshot([item])
    await seedItem(item, ["rule-a"], { needsApproval: true })
    await mockDb.cleanupRule.update({ where: { id: "rule-a" }, data: { definition: { ...OLD_MOVIE, protections: [KEPT_BY_P1] }, revision: 2 } })
    await approve([item.key])
    await expect(process("cleanup:act", { trigger: "approval", actorId: ADMIN })).resolves.toMatchObject({ deleted: 0, rescued: 1 })
    expect(mockUp.deleteRadarrMovie).not.toHaveBeenCalled()
    expect(await outcomes()).toEqual([expect.objectContaining({ itemKey: item.key, kind: "rescued", reason: "protected", detail: { protectionId: "p1" } })])
  })

  it("does not delete a title whose rule got a protection during the act job, after its reconcile and before its candidate read (TS 8.8 step 6.5)", async () => {
    const item = movie(401, "1")
    await seedRule("rule-a", "automatic", OLD_MOVIE)
    await storeSnapshot([item])
    await seedItem(item, ["rule-a"])
    mockUp.roots.mockImplementationOnce(async () => {
      await mockDb.cleanupRule.update({ where: { id: "rule-a" }, data: { definition: { ...OLD_MOVIE, protections: [KEPT_BY_P1] }, revision: { increment: 1 } } })
      return { ok: true, data: [{ path: "/media/movies" }] }
    })
    await process("cleanup:act", { trigger: "approval", actorId: ADMIN })
    expect(mockUp.deleteRadarrMovie).not.toHaveBeenCalled()
    expect(await mockDb.cleanupItem.count()).toBe(0)
  })

  it("deletes a second batch that an admin approves while the act job runs, in the same job (TS 9.3)", async () => {
    const [first, second] = [movie(501, "1"), movie(502, "1")]
    await seedRule("rule-a", "reviewFirst", OLD_MOVIE)
    await storeSnapshot([first, second])
    await seedItem(first, ["rule-a"], { needsApproval: true })
    await seedItem(second, ["rule-a"], { needsApproval: true })
    await approve([first.key])
    mockUp.deleteRadarrMovie.mockImplementationOnce(async () => (await approve([second.key]), { ok: true, data: { gone: false } }))
    await expect(process("cleanup:act", { trigger: "approval", actorId: ADMIN })).resolves.toMatchObject({ rounds: 2, deleted: 2 })
    expect(deletedMovies().sort()).toEqual([501, 502])
  })

  it("rescues a title played inside a refreshed snapshot, then approved", async () => {
    const item = movie(601, "1")
    await seedRule("rule-a", "reviewFirst", OLD_MOVIE)
    await storeSnapshot([item], new Date(Date.now() - 30 * 3_600_000))
    await seedItem(item, ["rule-a"], { needsApproval: true, why: buildWhySnapshot({ takenAt: new Date(Date.now() - 30 * 3_600_000).toISOString() }) })
    const played = nowS() - 2 * 3600
    await storeSnapshot([{ ...item, plays: { lastCountedAt: played, countedAt: [played], viewers: [{ user: "100", lastCountedAt: played,
      lastCountedFinished: false, counted: 1, finished: false, finishedEpisodes: 0 }] } }])
    await approve([item.key])
    await process("cleanup:act", { trigger: "approval", actorId: ADMIN })
    expect(mockUp.deleteRadarrMovie).not.toHaveBeenCalled()
    // G4 (played in the last 30 days) protects it before its own clause fails
    expect(await outcomes()).toEqual([expect.objectContaining({ itemKey: item.key, kind: "rescued", reason: "protected", detail: { protectionId: "g4" } })])
  })

  it("deletes only item 1 when a pause commits between item 1 and item 2 (E20)", async () => {
    const [first, second] = [movie(706, "1"), movie(701, "1")]
    await seedRule("rule-a", "automatic", OLD_MOVIE)
    await storeSnapshot([first, second])
    await seedItem(first, ["rule-a"])
    await seedItem(second, ["rule-a"])
    mockUp.deleteRadarrMovie.mockImplementationOnce(async () => {
      await mockDb.cleanupSettings.update({ where: { id: "cleanup" }, data: { pausedAt: new Date(), pausedBy: ADMIN } })
      return { ok: true, data: { gone: false } }
    })
    await expect(process("cleanup:act", { trigger: "approval", actorId: ADMIN })).resolves.toMatchObject({ outcome: "paused", deleted: 1 })
    expect(deletedMovies()).toEqual([706])
    await expect(mockDb.cleanupItem.findUniqueOrThrow({ where: { itemKey: second.key } })).resolves.toMatchObject({ state: "leaving" })
  })

  it("plans a season before its show, and raises a show whose season was postponed instead of deleting it (E21)", async () => {
    const show = buildShowItem({ sizeBytes: 40 * GiB })
    const season = buildSeasonItem(show, 2, { sizeBytes: 50 * GiB, ratingKey: "6020", copies: [{ ratingKey: "6020", sectionId: "2" }] })
    const seasons: RuleDefinition = { ...OLD_MOVIE, level: "season", libraries: ["2"], then: { graceDays: 1, action: "season.unmonitorDeleteFiles",
      importListExclusion: false } }
    const shows: RuleDefinition = { ...OLD_MOVIE, level: "show", libraries: ["2"], then: { graceDays: 1, action: "show.delete", importListExclusion: false } }
    await seedRule("rule-season", "automatic", seasons)
    await seedRule("rule-show", "automatic", shows, new Date("2026-01-02T00:00:00Z"))
    await storeSnapshot([show, season])
    const order: string[] = []
    mockUp.getSonarrSeries.mockResolvedValue({ ok: true, data: { id: 22, title: show.title, titleSlug: "an-invented-show", tvdbId: 2002, tmdbId: 3003, path: show.arr!.path,
      status: "ended", monitored: true, added: "2020-01-01T00:00:00Z", tags: [], seasons: [{ seasonNumber: 2, monitored: true, statistics: { episodeFileCount: 1, sizeOnDisk: 1 } }] } })
    mockUp.getSonarrSeriesFull.mockResolvedValue({ ok: true, data: { id: 22, path: show.arr!.path, monitored: true, seasons: [{ seasonNumber: 2, monitored: true }] } })
    mockUp.listSonarrEpisodeFiles.mockResolvedValue({ ok: true, data: [{ id: 91, seriesId: 22, seasonNumber: 2, path: `${show.arr!.path}/Season 2/E1.mkv` }] })
    mockUp.listPlexSeasonFiles.mockResolvedValue({ ok: true, data: new Set([`${show.arr!.path}/Season 2/E1.mkv`]) })
    mockUp.listSonarrEpisodes.mockResolvedValue({ ok: true, data: [] })
    mockUp.deleteSonarrEpisodeFiles.mockImplementation(async () => (order.push("season"), { ok: true, data: { deleted: 1 } }))
    mockUp.deleteSonarrSeries.mockImplementation(async () => (order.push("show"), OK))

    await seedItem(season, ["rule-season"], { action: "season.unmonitorDeleteFiles", leaveOn: addDays(today, 5) })
    await seedItem(show, ["rule-show"], { action: "show.delete" })
    await process("cleanup:act", { trigger: "approval", actorId: ADMIN })
    expect(order).toEqual([])
    await expect(mockDb.cleanupItem.findUniqueOrThrow({ where: { itemKey: show.key } })).resolves.toMatchObject({ state: "leaving", leaveOn: addDays(today, 5) })

    await mockDb.cleanupItem.updateMany({ where: { level: { in: ["show", "season"] } }, data: { leaveOn: addDays(today, -1) } })
    await process("cleanup:act", { trigger: "approval", actorId: ADMIN })
    expect(order).toEqual(["season", "show"])
    expect(await mockDb.cleanupItem.count()).toBe(0)
  })
})
