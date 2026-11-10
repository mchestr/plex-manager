/**
 * @jest-environment node
 */

/**
 * Deletion per level (TS 8.9, E20, E21, E22, safety-r3-6, safety-r4-3,
 * safety-r5-4, safety-r7-1): the call order of each action against mocked
 * connections (every write goes through a mocked `serviceFetch`, so the real
 * write clients batch and shape the requests), every read before the first
 * write, no delete after a failed unmonitor, the gone check after a Sonarr
 * 500, the season file check, bulk batches of 50, an empty file list, show
 * and season items of one show, the show floor, and every write of a
 * `deleting` row matching `{ id, state: "deleting" }`.
 */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
const mockWarn = jest.fn()
const mockError = jest.fn()
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: (...a: unknown[]) => mockError(...a), warn: (...a: unknown[]) => mockWarn(...a) }),
}))
const mockRecord = jest.fn()
jest.mock("@/lib/security/audit-log", () => ({
  ...jest.requireActual("@/lib/security/audit-log"),
  recordAuditEvent: (...args: unknown[]) => mockRecord(...args),
}))
const mockCalls: string[] = []
const mockWrites: { method: string; path: string; body: unknown; timeoutMs?: number }[] = []
let mockResponses: Record<string, unknown[]> = {}
function mockAnswer(key: string, fallback: unknown) {
  return mockResponses[key]?.length ? mockResponses[key].shift() : fallback
}
function mockRead(name: string) {
  return async (...args: unknown[]) => {
    mockCalls.push(`read ${name}`)
    return mockAnswer(name, { ok: false, code: "NETWORK", args })
  }
}
jest.mock("@/lib/connections/http", () => ({
  ...jest.requireActual("@/lib/connections/http"),
  serviceFetch: async (opts: { url: string; method?: string; body?: string; timeoutMs?: number }) => {
    const url = new URL(opts.url)
    const method = opts.method ?? "GET"
    mockCalls.push(`${method} ${url.pathname}`)
    mockWrites.push({ method, path: `${url.pathname}${url.search}`, body: opts.body ? JSON.parse(opts.body) : undefined, timeoutMs: opts.timeoutMs })
    return mockAnswer(`${method} ${url.pathname}`, { ok: true, data: "" })
  },
}))
jest.mock("@/lib/connections/radarr-library", () => ({ getRadarrMovie: mockRead("getRadarrMovie") }))
jest.mock("@/lib/connections/sonarr-library", () => ({
  getSonarrSeries: mockRead("getSonarrSeries"), getSonarrSeriesFull: mockRead("getSonarrSeriesFull"),
  listSonarrEpisodeFiles: mockRead("listSonarrEpisodeFiles"), listSonarrEpisodes: mockRead("listSonarrEpisodes"),
}))
jest.mock("@/lib/connections/plex-library-read", () => ({ listPlexSeasonFiles: mockRead("listPlexSeasonFiles") }))

import { mockReset } from "jest-mock-extended"

import { buildCleanupItem } from "@/__tests__/helpers/cleanup-factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { deleteItem, type DeleteEnv } from "@/lib/cleanup/run/delete"
import type { ArrRef } from "@/lib/cleanup/schema/runtime"
import type { CleanupItem } from "@/lib/generated/prisma/client"
import { AuditEventType } from "@/lib/security/audit-log"

const MOVIE_ARR: ArrRef = { service: "radarr", id: 11, titleSlug: "invented-movie", path: "/media/movies/Invented (2019)" }
const SHOW_ARR: ArrRef = { service: "sonarr", id: 22, titleSlug: "invented-show", path: "/media/tv/Invented Show" }
const UPDATED = new Date("2026-11-08T03:00:00Z")
const APPROVED = new Date("2026-11-07T10:00:00Z")

const movie = (overrides: Partial<CleanupItem> = {}) => buildCleanupItem({ id: "item-movie", itemKey: "movie:tmdb:1001", level: "movie", titleKey: "tmdb:1001",
  sectionId: "1", ratingKey: "5001", arr: MOVIE_ARR, action: "movie.delete", importListExclusion: true, state: "approved", approvedAt: APPROVED,
  approvedBy: "admin-1", leaveOn: "2026-11-01", updatedAt: UPDATED, sizeBytes: 12n * 1024n ** 3n, ...overrides })
const show = (overrides: Partial<CleanupItem> = {}) => buildCleanupItem({ id: "item-show", itemKey: "show:tvdb:2002", level: "show", titleKey: "tvdb:2002",
  sectionId: "2", ratingKey: "6001", arr: SHOW_ARR, action: "show.delete", importListExclusion: false, state: "leaving", leaveOn: "2026-11-01",
  updatedAt: UPDATED, sizeBytes: 80n * 1024n ** 3n, ...overrides })
const season = (n: number, overrides: Partial<CleanupItem> = {}) => buildCleanupItem({ id: `item-season-${n}`, itemKey: `season:tvdb:2002:${n}`,
  level: "season", titleKey: "tvdb:2002", seasonNumber: n, sectionId: "2", ratingKey: `600${n}0`, arr: SHOW_ARR, action: "season.unmonitorDeleteFiles",
  state: "leaving", leaveOn: "2026-11-01", updatedAt: UPDATED, sizeBytes: 20n * 1024n ** 3n, ...overrides })

const env: DeleteEnv = {
  services: { plex: { url: "http://plex.test:32400", token: "plex-token" }, radarr: { url: "http://radarr.test", apiKey: "radarr-key" },
    sonarr: { url: "http://sonarr.test", apiKey: "sonarr-key" }, tautulli: null, overseerr: null },
  runId: "run-1", today: "2026-11-08",
  collections: { "1:movie": { ratingKey: "900", title: "Movies leaving soon", createdAt: "2026-11-01T00:00:00.000Z", lastSyncAt: "2026-11-08T00:00:00.000Z",
    count: 3, hub: { ownHome: true, sharedHome: true, recommended: false } } },
}

const fullSeries = (seasons: { seasonNumber: number; monitored: boolean }[]) => ({ ok: true, data: { id: 22, path: SHOW_ARR.path, monitored: true, seasons,
  qualityProfileId: 4, tags: [7] } })
const episodeFile = (id: number, seasonNumber: number) => ({ id, seriesId: 22, seasonNumber, path: `${SHOW_ARR.path}/Season ${seasonNumber}/E${id}.mkv` })
const is404 = { ok: false, code: "HTTP", status: 404 }
const respond = (map: Record<string, unknown[]>) => {
  mockResponses = map
}
const itemWrites = () => prismaMock.cleanupItem.updateMany.mock.calls.map(([args]) => ({ where: args.where, data: args.data }))
const sonarrWrites = () => mockWrites.filter((w) => w.path.startsWith("/api/v3/") && w.method !== "GET")

beforeEach(() => {
  mockReset(prismaMock)
  mockRecord.mockReset().mockResolvedValue(undefined)
  mockWarn.mockReset()
  mockError.mockReset()
  mockCalls.length = 0
  mockWrites.length = 0
  mockResponses = {}
  prismaMock.$transaction.mockImplementation(((fn: (client: unknown) => unknown) => fn(prismaMock)) as never)
  prismaMock.cleanupSettings.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.cleanupItem.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.cleanupItem.deleteMany.mockResolvedValue({ count: 1 })
  prismaMock.cleanupItem.findMany.mockResolvedValue([])
  prismaMock.cleanupOutcome.create.mockResolvedValue({ id: "outcome-1" } as never)
})

describe("the common steps (TS 8.9 steps 1 and 2)", () => {
  it("writes the stop guard before the deleting write, then removes the collection item, then calls Radarr", async () => {
    await expect(deleteItem(movie(), MOVIE_ARR, env)).resolves.toEqual({ kind: "deleted", freedBytes: 12n * 1024n ** 3n, alreadyGone: false })

    const guard = prismaMock.cleanupSettings.updateMany.mock.invocationCallOrder[0]
    const deleting = prismaMock.cleanupItem.updateMany.mock.invocationCallOrder[0]
    expect(guard).toBeLessThan(deleting)
    expect(prismaMock.cleanupSettings.updateMany).toHaveBeenCalledWith({ where: { id: "cleanup", enabled: true, pausedAt: null }, data: { enabled: true } })
    expect(itemWrites()[0]).toEqual({ where: { id: "item-movie", updatedAt: UPDATED }, data: { state: "deleting" } })
    expect(mockCalls).toEqual(["DELETE /library/collections/900/items/5001", "DELETE /api/v3/movie/11", "GET /library/sections/1/refresh"])
    expect(mockWrites[1].path).toBe("/api/v3/movie/11?deleteFiles=true&addImportExclusion=true")
  })

  it("stops with no item write when a pause or a feature off committed first (E20)", async () => {
    prismaMock.cleanupSettings.updateMany.mockResolvedValue({ count: 0 })
    await expect(deleteItem(movie(), MOVIE_ARR, env)).resolves.toEqual({ kind: "stopped" })
    expect(prismaMock.cleanupItem.updateMany).not.toHaveBeenCalled()
    expect(mockCalls).toEqual([])
  })

  it("rolls back and skips when the row changed (zero item rows)", async () => {
    prismaMock.cleanupItem.updateMany.mockResolvedValueOnce({ count: 0 })
    await expect(deleteItem(movie(), MOVIE_ARR, env)).resolves.toEqual({ kind: "skipped" })
    expect(mockCalls).toEqual([])
  })

  it("throws a database error of the deleting transaction", async () => {
    prismaMock.cleanupItem.updateMany.mockRejectedValueOnce(new Error("db down"))
    await expect(deleteItem(movie(), MOVIE_ARR, env)).rejects.toThrow("db down")
  })

  it("skips an action it does not know, or an arr that does not fit the level, before any write", async () => {
    await expect(deleteItem(movie({ action: "movie.archive" }), MOVIE_ARR, env)).resolves.toEqual({ kind: "skipped" })
    await expect(deleteItem(movie(), SHOW_ARR, env)).resolves.toEqual({ kind: "skipped" })
    await expect(deleteItem(movie(), MOVIE_ARR, { ...env, services: { ...env.services, radarr: null } })).resolves.toEqual({ kind: "skipped" })
    expect(prismaMock.cleanupSettings.updateMany).not.toHaveBeenCalled()
  })

  it("logs a failed collection removal and still deletes, and removes nothing without a stored collection", async () => {
    respond({ "DELETE /library/collections/900/items/5001": [{ ok: false, code: "TIMEOUT" }] })
    await expect(deleteItem(movie(), MOVIE_ARR, env)).resolves.toMatchObject({ kind: "deleted" })
    expect(mockWarn).toHaveBeenCalledWith("cleanup.collection_remove_failed", { itemKey: "movie:tmdb:1001", code: "TIMEOUT" })
    mockCalls.length = 0
    await deleteItem(movie(), MOVIE_ARR, { ...env, collections: {} })
    expect(mockCalls).toEqual(["DELETE /api/v3/movie/11", "GET /library/sections/1/refresh"])
  })

  it("exits deleted with the state match, freedBytes and the audit row of the approving admin (TS 8.9 step 4)", async () => {
    await deleteItem(movie(), MOVIE_ARR, env)
    expect(prismaMock.cleanupItem.deleteMany).toHaveBeenCalledWith({ where: { id: "item-movie", state: "deleting" } })
    expect(prismaMock.cleanupOutcome.create.mock.calls[0][0].data).toMatchObject({ kind: "deleted", reason: "deleted", freedBytes: 12n * 1024n ** 3n,
      alreadyGone: false, approvedBy: "admin-1", runId: "run-1" })
    expect(mockRecord).toHaveBeenCalledWith(AuditEventType.CLEANUP_ITEM_DELETED, "admin-1", expect.objectContaining({ runId: "run-1",
      itemKey: "movie:tmdb:1001", action: "movie.delete", service: "radarr", arrId: 11, freedBytes: String(12n * 1024n ** 3n), alreadyGone: false,
      importListExclusion: true, approval: "admin" }), prismaMock)
  })

  it("logs a failed folder scan, and gives auditFailed when the exit write throws", async () => {
    respond({ "GET /library/sections/1/refresh": [{ ok: false, code: "HTTP", status: 500 }, { ok: false, code: "HTTP", status: 500 }] })
    await deleteItem(movie({ approvedBy: null, approvedAt: null, state: "leaving" }), MOVIE_ARR, env)
    expect(mockWarn).toHaveBeenCalledWith("cleanup.folder_scan_failed", { itemKey: "movie:tmdb:1001", code: "HTTP" })
    expect(mockRecord).toHaveBeenCalledWith(AuditEventType.CLEANUP_ITEM_DELETED, "system", expect.objectContaining({ approval: "automatic" }), prismaMock)

    mockRecord.mockRejectedValueOnce(new Error("audit down"))
    await expect(deleteItem(movie(), MOVIE_ARR, env)).resolves.toEqual({ kind: "auditFailed" })
    expect(mockError).toHaveBeenCalledWith("cleanup.delete_exit_failed", expect.any(Error), { itemKey: "movie:tmdb:1001", action: "done" })
  })
  it("stops with auditFailed and logs when the deleted exit matched no deleting row (another holder moved it, safety review S-2)", async () => {
    prismaMock.cleanupItem.deleteMany.mockResolvedValue({ count: 0 })
    await expect(deleteItem(movie(), MOVIE_ARR, env)).resolves.toEqual({ kind: "auditFailed" })
    expect(mockError).toHaveBeenCalledWith("cleanup.deleted_exit_missed", undefined, { itemKey: "movie:tmdb:1001", action: "done" })
    expect(prismaMock.cleanupOutcome.create).not.toHaveBeenCalled()
    expect(mockCalls).not.toContain("GET /library/sections/1/refresh")
  })
})

describe("the movie actions", () => {
  it("exits a movie that Radarr already lost as gone, with no scan", async () => {
    respond({ "DELETE /api/v3/movie/11": [is404] })
    await expect(deleteItem(movie(), MOVIE_ARR, env)).resolves.toEqual({ kind: "deleted", freedBytes: 0n, alreadyGone: true })
    expect(prismaMock.cleanupOutcome.create.mock.calls[0][0].data).toMatchObject({ alreadyGone: true, freedBytes: 0n })
    expect(mockCalls).not.toContain("GET /library/sections/1/refresh")
  })

  it("reads the movie once after a failed delete: a 404 is gone, else the failure path", async () => {
    respond({ "DELETE /api/v3/movie/11": [{ ok: false, code: "HTTP", status: 500 }, { ok: false, code: "HTTP", status: 500 }], getRadarrMovie: [is404] })
    await expect(deleteItem(movie(), MOVIE_ARR, env)).resolves.toMatchObject({ kind: "deleted", alreadyGone: true })
    await expect(deleteItem(movie(), MOVIE_ARR, env)).resolves.toEqual({ kind: "failed", code: "HTTP", status: 500 })
  })

  it("unmonitors, reads the movie again and deletes its file (movie.unmonitorDeleteFiles)", async () => {
    respond({ getRadarrMovie: [{ ok: true, data: { id: 11, hasFile: true, movieFileId: 77 } }] })
    await deleteItem(movie({ action: "movie.unmonitorDeleteFiles" }), MOVIE_ARR, env)
    expect(mockCalls).toEqual(["DELETE /library/collections/900/items/5001", "PUT /api/v3/movie/editor", "read getRadarrMovie", "DELETE /api/v3/moviefile/77",
      "GET /library/sections/1/refresh"])
    expect(mockWrites[1].body).toEqual({ movieIds: [11], monitored: false })
  })

  it("deletes nothing after a failed unmonitor", async () => {
    respond({ "PUT /api/v3/movie/editor": [{ ok: false, code: "HTTP", status: 503 }], getRadarrMovie: [{ ok: true, data: { id: 11, hasFile: true, movieFileId: 77 } }] })
    await expect(deleteItem(movie({ action: "movie.unmonitorDeleteFiles" }), MOVIE_ARR, env)).resolves.toEqual({ kind: "failed", code: "HTTP", status: 503 })
    expect(mockCalls).not.toContain("DELETE /api/v3/moviefile/77")
    expect(itemWrites()[1].data).not.toHaveProperty("arr")
  })

  it("names a partial unmonitor when the unmonitor write got no answer, and none after a refused one (safety review S-4)", async () => {
    respond({ "PUT /api/v3/movie/editor": [{ ok: false, code: "TIMEOUT" }], getRadarrMovie: [{ ok: true, data: { id: 11, hasFile: true, movieFileId: 77 } }] })
    await expect(deleteItem(movie({ action: "movie.unmonitorDeleteFiles" }), MOVIE_ARR, env)).resolves.toEqual({ kind: "failed", code: "TIMEOUT" })
    expect(mockCalls).not.toContain("DELETE /api/v3/moviefile/77")
    expect(itemWrites()[1].data).toMatchObject({ arr: { ...MOVIE_ARR, unmonitored: true } })
    expect(prismaMock.cleanupOutcome.create.mock.calls[0][0].data.detail).toMatchObject({ stillUnmonitored: "radarr" })
  })

  it("is gone when the movie has no file after the unmonitor, and keeps the record unmonitored after a failed file delete", async () => {
    respond({ getRadarrMovie: [{ ok: true, data: { id: 11, hasFile: false, movieFileId: 0 } }, is404, { ok: true, data: { id: 11, hasFile: true, movieFileId: 77 } },
      { ok: false, code: "TIMEOUT" }] })
    await expect(deleteItem(movie({ action: "movie.unmonitorDeleteFiles" }), MOVIE_ARR, env)).resolves.toMatchObject({ alreadyGone: true })
    await expect(deleteItem(movie({ action: "movie.unmonitorDeleteFiles" }), MOVIE_ARR, env)).resolves.toMatchObject({ alreadyGone: true })
    respond({ getRadarrMovie: [{ ok: true, data: { id: 11, hasFile: true, movieFileId: 77 } }], "DELETE /api/v3/moviefile/77": [{ ok: false, code: "HTTP", status: 500 }] })
    prismaMock.cleanupItem.updateMany.mockClear()
    await expect(deleteItem(movie({ action: "movie.unmonitorDeleteFiles" }), MOVIE_ARR, env)).resolves.toMatchObject({ kind: "failed" })
    expect(itemWrites()[1].data).toMatchObject({ arr: { ...MOVIE_ARR, unmonitored: true } })
    respond({ getRadarrMovie: [{ ok: false, code: "TIMEOUT" }] })
    prismaMock.cleanupItem.updateMany.mockClear()
    await expect(deleteItem(movie({ action: "movie.unmonitorDeleteFiles" }), MOVIE_ARR, env)).resolves.toEqual({ kind: "failed", code: "TIMEOUT" })
    expect(itemWrites()[1].data).toMatchObject({ arr: { unmonitored: true } })
    respond({ getRadarrMovie: [{ ok: true, data: { id: 11, hasFile: true, movieFileId: 77 } }], "DELETE /api/v3/moviefile/77": [is404] })
    await expect(deleteItem(movie({ action: "movie.unmonitorDeleteFiles" }), MOVIE_ARR, env)).resolves.toMatchObject({ alreadyGone: true })
  })
})

describe("the failure path (TS 8.9 step 6)", () => {
  it("sets the previous state back with the state match, failCode and failCount, and writes the outcome and audit row", async () => {
    respond({ "DELETE /api/v3/movie/11": [{ ok: false, code: "HTTP", status: 401 }], getRadarrMovie: [{ ok: false, code: "HTTP", status: 401 }] })
    await expect(deleteItem(movie({ failCount: 2 }), MOVIE_ARR, env)).resolves.toEqual({ kind: "failed", code: "HTTP", status: 401, refused: "radarr" })
    expect(itemWrites()[1]).toEqual({ where: { id: "item-movie", state: "deleting" }, data: { state: "approved", failCode: "HTTP", failCount: { increment: 1 } } })
    expect(prismaMock.cleanupOutcome.create.mock.calls[0][0].data).toMatchObject({ kind: "failed", reason: "failed", detail: { code: "HTTP", service: "radarr" } })
    expect(mockRecord).toHaveBeenCalledWith(AuditEventType.CLEANUP_ITEM_FAILED, "admin-1", { runId: "run-1", itemKey: "movie:tmdb:1001", level: "movie",
      action: "movie.delete", service: "radarr", code: "HTTP", status: 401, failCount: 3 }, prismaMock)
  })

  it("writes no outcome when the row left deleting meanwhile", async () => {
    respond({ "DELETE /api/v3/movie/11": [{ ok: false, code: "TIMEOUT" }] })
    prismaMock.cleanupItem.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    await deleteItem(movie({ approvedAt: null, state: "leaving", why: null }), MOVIE_ARR, env)
    expect(itemWrites()[1].data).toMatchObject({ state: "leaving" })
    expect(prismaMock.cleanupOutcome.create).not.toHaveBeenCalled()
  })
})

describe("the show actions", () => {
  it("deletes a series with the exclusion, then exits its seasons still in Leaving soon as showDeleted (E21)", async () => {
    prismaMock.cleanupItem.findMany.mockImplementation((async (args: { where: { state: { in: string[] } } }) =>
      (args.where.state.in.includes("deleting") ? [] : [season(2, { state: "approved", approvedBy: "admin-1", approvedAt: APPROVED })])) as never)
    await expect(deleteItem(show({ importListExclusion: true }), SHOW_ARR, env)).resolves.toMatchObject({ kind: "deleted", alreadyGone: false })
    expect(mockWrites.find((w) => w.method === "DELETE" && w.path.startsWith("/api/v3/series/"))?.path).toBe(
      "/api/v3/series/22?deleteFiles=true&addImportListExclusion=true")
    const outcomes = prismaMock.cleanupOutcome.create.mock.calls.map(([args]) => args.data)
    expect(outcomes).toEqual([expect.objectContaining({ itemKey: "show:tvdb:2002", reason: "deleted" }),
      expect.objectContaining({ itemKey: "season:tvdb:2002:2", reason: "showDeleted", alreadyGone: true, freedBytes: 0n })])
    expect(prismaMock.cleanupItem.deleteMany.mock.calls[1][0]).toEqual({ where: { id: "item-season-2", updatedAt: UPDATED } })
  })

  it("reads the series after a Sonarr 500: a 404 is gone (TS 8.9 step 6)", async () => {
    respond({ "DELETE /api/v3/series/22": [{ ok: false, code: "HTTP", status: 500 }], getSonarrSeries: [is404] })
    await expect(deleteItem(show(), SHOW_ARR, env)).resolves.toMatchObject({ kind: "deleted", alreadyGone: true })
    expect(mockCalls.filter((c) => !c.startsWith("GET /library"))).toEqual(["DELETE /api/v3/series/22", "read getSonarrSeries"])
  })

  it("unmonitors the series and every season, then deletes the files 50 a call (show.unmonitorDeleteFiles)", async () => {
    const files = Array.from({ length: 120 }, (_, i) => episodeFile(i + 1, (i % 3) + 1))
    respond({ getSonarrSeriesFull: [fullSeries([{ seasonNumber: 1, monitored: true }, { seasonNumber: 2, monitored: false }])],
      listSonarrEpisodeFiles: [{ ok: true, data: files }] })
    await expect(deleteItem(show({ action: "show.unmonitorDeleteFiles" }), SHOW_ARR, env)).resolves.toMatchObject({ kind: "deleted" })
    expect(mockCalls.filter((c) => !c.startsWith("GET /library"))).toEqual(["read getSonarrSeriesFull", "read listSonarrEpisodeFiles", "PUT /api/v3/series/22",
      "DELETE /api/v3/episodefile/bulk", "DELETE /api/v3/episodefile/bulk", "DELETE /api/v3/episodefile/bulk"])
    const [put, ...bulk] = sonarrWrites()
    expect(put.body).toEqual({ id: 22, path: SHOW_ARR.path, monitored: false, qualityProfileId: 4, tags: [7],
      seasons: [{ seasonNumber: 1, monitored: false }, { seasonNumber: 2, monitored: false }] })
    expect(bulk.map((b) => (b.body as { episodeFileIds: number[] }).episodeFileIds.length)).toEqual([50, 50, 20])
    expect(bulk[0].timeoutMs).toBe(300_000)
  })

  it("is gone with no file, a 404 or no series, and fails on a failed read", async () => {
    respond({ getSonarrSeriesFull: [fullSeries([]), is404, { ok: false, code: "TIMEOUT" }, fullSeries([])],
      listSonarrEpisodeFiles: [{ ok: true, data: [] }, { ok: false, code: "TIMEOUT" }] })
    const unmonitor = show({ action: "show.unmonitorDeleteFiles" })
    await expect(deleteItem(unmonitor, SHOW_ARR, env)).resolves.toMatchObject({ alreadyGone: true })
    await expect(deleteItem(unmonitor, SHOW_ARR, env)).resolves.toMatchObject({ alreadyGone: true })
    await expect(deleteItem(unmonitor, SHOW_ARR, env)).resolves.toEqual({ kind: "failed", code: "TIMEOUT" })
    await expect(deleteItem(unmonitor, SHOW_ARR, env)).resolves.toEqual({ kind: "failed", code: "TIMEOUT" })
    expect(sonarrWrites()).toEqual([])
  })

  it("deletes nothing after a failed series PUT, and reads the files again after a bulk timeout", async () => {
    respond({ getSonarrSeriesFull: [fullSeries([{ seasonNumber: 1, monitored: true }])], listSonarrEpisodeFiles: [{ ok: true, data: [episodeFile(1, 1)] }],
      "PUT /api/v3/series/22": [{ ok: false, code: "HTTP", status: 500 }], getSonarrSeries: [{ ok: true, data: { id: 22 } }] })
    await expect(deleteItem(show({ action: "show.unmonitorDeleteFiles" }), SHOW_ARR, env)).resolves.toEqual({ kind: "failed", code: "HTTP", status: 500 })
    expect(mockCalls).not.toContain("DELETE /api/v3/episodefile/bulk")

    respond({ getSonarrSeriesFull: [fullSeries([{ seasonNumber: 1, monitored: true }])],
      listSonarrEpisodeFiles: [{ ok: true, data: [episodeFile(1, 1)] }, { ok: true, data: [episodeFile(9, 1)] }],
      "DELETE /api/v3/episodefile/bulk": [{ ok: false, code: "TIMEOUT" }] })
    await expect(deleteItem(show({ action: "show.unmonitorDeleteFiles" }), SHOW_ARR, env)).resolves.toMatchObject({ kind: "deleted", alreadyGone: false })
  })

  it("raises a due show to a later season date, writes no deleting state and skips it (TS 8.9 step 1.1, safety-r7-1)", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([{ leaveOn: "2026-11-20" }, { leaveOn: "2026-11-01" }] as never)
    await expect(deleteItem(show(), SHOW_ARR, env)).resolves.toEqual({ kind: "skipped" })
    expect(prismaMock.cleanupItem.findMany).toHaveBeenCalledWith({ where: { level: "season", titleKey: "tvdb:2002", state: { in: ["leaving", "approved", "deleting"] } },
      select: { leaveOn: true } })
    expect(itemWrites()).toEqual([{ where: { itemKey: "show:tvdb:2002", state: { in: ["leaving", "approved"] }, leaveOn: { lt: "2026-11-20" } },
      data: { leaveOn: "2026-11-20" } }])
    expect(mockCalls).toEqual([])
  })

  it("deletes a show whose seasons leave no later than today", async () => {
    prismaMock.cleanupItem.findMany.mockImplementation((async (args: { where: { state: { in: string[] } } }) =>
      (args.where.state.in.includes("deleting") ? [{ leaveOn: "2026-11-08" }] : [])) as never)
    await expect(deleteItem(show(), SHOW_ARR, env)).resolves.toMatchObject({ kind: "deleted" })
  })

  it("keeps the deleted exit when a season postpone touched the show during its arr call (safety-r4-3)", async () => {
    respond({ "DELETE /api/v3/series/22": [{ ok: true, data: "" }] })
    await deleteItem(show({ updatedAt: new Date("2026-11-08T02:00:00Z") }), SHOW_ARR, env)
    expect(prismaMock.cleanupItem.deleteMany).toHaveBeenCalledWith({ where: { id: "item-show", state: "deleting" } })
    expect(mockRecord).toHaveBeenCalledWith(AuditEventType.CLEANUP_ITEM_DELETED, "system", expect.objectContaining({ itemKey: "show:tvdb:2002" }), prismaMock)
    expect(itemWrites().filter((w) => "leaveOn" in (w.data as object))).toEqual([])
  })
})

describe("the season action (season.unmonitorDeleteFiles, E22)", () => {
  const plexFiles = (n: number, ids: number[]) => ({ ok: true, data: new Set(ids.map((id) => `${SHOW_ARR.path}/Season ${n}/E${id}.mkv`)) })
  const seasonReads = (extra: Record<string, unknown[]> = {}) => respond({
    getSonarrSeriesFull: [fullSeries([{ seasonNumber: 1, monitored: true }, { seasonNumber: 2, monitored: false }])],
    listSonarrEpisodeFiles: [{ ok: true, data: [episodeFile(1, 1), episodeFile(2, 2), episodeFile(3, 2)] }],
    listPlexSeasonFiles: [plexFiles(2, [2, 3])],
    listSonarrEpisodes: [{ ok: true, data: [{ id: 31, seriesId: 22, seasonNumber: 2, episodeNumber: 1, hasFile: true, monitored: true },
      { id: 32, seriesId: 22, seasonNumber: 2, episodeNumber: 2, hasFile: true, monitored: false }] }],
    ...extra,
  })

  it("reads and checks everything before the first write, then unmonitors the monitored episodes of an unmonitored season", async () => {
    seasonReads()
    await expect(deleteItem(season(2), SHOW_ARR, env)).resolves.toMatchObject({ kind: "deleted" })
    expect(mockCalls.filter((c) => !c.startsWith("GET /library"))).toEqual(["read getSonarrSeriesFull", "read listSonarrEpisodeFiles", "read listPlexSeasonFiles",
      "read listSonarrEpisodes", "PUT /api/v3/episode/monitor", "DELETE /api/v3/episodefile/bulk"])
    expect(sonarrWrites().map((w) => w.body)).toEqual([{ episodeIds: [31], monitored: false }, { episodeFileIds: [2, 3] }])
  })

  it("sets the season flag off with the whole series body when the season is monitored", async () => {
    seasonReads({ listPlexSeasonFiles: [plexFiles(1, [1])], listSonarrEpisodes: [{ ok: true, data: [] }] })
    await deleteItem(season(1), SHOW_ARR, env)
    const [put, bulk] = sonarrWrites()
    expect(put.path).toBe("/api/v3/series/22")
    expect(put.body).toEqual({ id: 22, path: SHOW_ARR.path, monitored: true, qualityProfileId: 4, tags: [7],
      seasons: [{ seasonNumber: 1, monitored: false }, { seasonNumber: 2, monitored: false }] })
    expect(bulk.body).toEqual({ episodeFileIds: [1] })
  })

  it("rescues Plex S03 files under Sonarr S02 after the deleting write, with the state match, and writes nothing to Sonarr", async () => {
    seasonReads({ listPlexSeasonFiles: [plexFiles(3, [2, 3])] })
    await expect(deleteItem(season(2), SHOW_ARR, env)).resolves.toEqual({ kind: "rescued" })
    expect(sonarrWrites()).toEqual([])
    expect(prismaMock.cleanupItem.deleteMany).toHaveBeenCalledWith({ where: { id: "item-season-2", state: "deleting" } })
    expect(prismaMock.cleanupOutcome.create.mock.calls[0][0].data).toMatchObject({ kind: "rescued", reason: "recordChanged", detail: { code: "seasonMismatch" } })
  })

  it("rescues a season whose Plex files are fewer than Sonarr's", async () => {
    seasonReads({ listPlexSeasonFiles: [plexFiles(2, [2])] })
    await expect(deleteItem(season(2), SHOW_ARR, env)).resolves.toEqual({ kind: "rescued" })
  })

  it("holds plexMissing with the row back in its previous state, and writes nothing to Sonarr (safety-r5-4)", async () => {
    seasonReads({ listPlexSeasonFiles: [is404] })
    await expect(deleteItem(season(2, { state: "approved", approvedAt: APPROVED, approvedBy: "admin-1" }), SHOW_ARR, env)).resolves.toEqual({ kind: "held" })
    expect(itemWrites()[1]).toEqual({ where: { id: "item-season-2", state: "deleting" }, data: { state: "approved", holdCode: "plexMissing" } })
    expect(sonarrWrites()).toEqual([])
  })

  it.each([
    ["sourceFailed:plex", { listPlexSeasonFiles: [{ ok: false, code: "TIMEOUT" }] }, 2],
    ["noArrSeason", {}, 4],
    ["outsideArrPath", { listSonarrEpisodeFiles: [{ ok: true, data: [{ ...episodeFile(2, 2), path: "/media/other/E2.mkv" }] }] }, 2],
  ])("takes the failure path with %s and writes nothing to Sonarr", async (code, extra, n) => {
    seasonReads(extra)
    await expect(deleteItem(season(n), SHOW_ARR, env)).resolves.toEqual({ kind: "failed", code })
    expect(itemWrites()[1]).toEqual({ where: { id: `item-season-${n}`, state: "deleting" }, data: { state: "leaving", failCode: code, failCount: { increment: 1 } } })
    expect(sonarrWrites()).toEqual([])
  })

  it("stops with noSeasonNumber before any read, and with no Plex server", async () => {
    await expect(deleteItem(season(0, { seasonNumber: null }), SHOW_ARR, env)).resolves.toEqual({ kind: "failed", code: "noSeasonNumber" })
    expect(mockCalls).toEqual([])
    seasonReads()
    await expect(deleteItem(season(2), SHOW_ARR, { ...env, services: { ...env.services, plex: null } })).resolves.toEqual({ kind: "failed", code: "sourceFailed:plex" })
  })

  it("is gone with no file of the season, or no series, and fails on failed reads", async () => {
    seasonReads({ listSonarrEpisodeFiles: [{ ok: true, data: [episodeFile(1, 1)] }] })
    await expect(deleteItem(season(2), SHOW_ARR, env)).resolves.toMatchObject({ alreadyGone: true })
    respond({ getSonarrSeriesFull: [is404] })
    await expect(deleteItem(season(2), SHOW_ARR, env)).resolves.toMatchObject({ alreadyGone: true })
    respond({ getSonarrSeriesFull: [{ ok: false, code: "TIMEOUT" }] })
    await expect(deleteItem(season(2), SHOW_ARR, env)).resolves.toEqual({ kind: "failed", code: "TIMEOUT" })
    seasonReads({ listSonarrEpisodeFiles: [{ ok: false, code: "TIMEOUT" }] })
    await expect(deleteItem(season(2), SHOW_ARR, env)).resolves.toEqual({ kind: "failed", code: "TIMEOUT" })
    seasonReads({ listSonarrEpisodes: [{ ok: false, code: "TIMEOUT" }] })
    await expect(deleteItem(season(2), SHOW_ARR, env)).resolves.toEqual({ kind: "failed", code: "TIMEOUT" })
    expect(sonarrWrites()).toEqual([])
  })

  it("deletes nothing after a failed season flag write or episode unmonitor", async () => {
    seasonReads({ listPlexSeasonFiles: [plexFiles(1, [1])], "PUT /api/v3/series/22": [{ ok: false, code: "HTTP", status: 500 }],
      getSonarrSeries: [{ ok: true, data: { id: 22 } }] })
    await expect(deleteItem(season(1), SHOW_ARR, env)).resolves.toEqual({ kind: "failed", code: "HTTP", status: 500 })
    seasonReads({ "PUT /api/v3/episode/monitor": [{ ok: false, code: "HTTP", status: 500 }] })
    await expect(deleteItem(season(2), SHOW_ARR, env)).resolves.toEqual({ kind: "failed", code: "HTTP", status: 500 })
    expect(mockCalls).not.toContain("DELETE /api/v3/episodefile/bulk")
  })

  it("sets arr.unmonitored after a failed bulk delete that followed the unmonitor, and never monitors again (safety-r3-6)", async () => {
    seasonReads({ "DELETE /api/v3/episodefile/bulk": [{ ok: false, code: "HTTP", status: 500 }], getSonarrSeries: [{ ok: true, data: { id: 22 } }] })
    await expect(deleteItem(season(2), SHOW_ARR, env)).resolves.toEqual({ kind: "failed", code: "HTTP", status: 500 })
    expect(itemWrites()[1].data).toEqual({ state: "leaving", failCode: "HTTP", failCount: { increment: 1 }, arr: { ...SHOW_ARR, unmonitored: true } })
    expect(prismaMock.cleanupOutcome.create.mock.calls[0][0].data.detail).toEqual({ code: "HTTP", service: "sonarr", stillUnmonitored: "sonarr" })
    expect(sonarrWrites().filter((w) => JSON.stringify(w.body).includes('"monitored":true'))).toEqual([])
  })

  it("names no unmonitor after a failed bulk delete when the season and its episodes were unmonitored already (safety review S-4)", async () => {
    const unmonitoredEpisodes = { ok: true, data: [{ id: 31, seriesId: 22, seasonNumber: 2, episodeNumber: 1, hasFile: true, monitored: false }] }
    seasonReads({ listSonarrEpisodes: [unmonitoredEpisodes], "DELETE /api/v3/episodefile/bulk": [{ ok: false, code: "HTTP", status: 500 }],
      getSonarrSeries: [{ ok: true, data: { id: 22 } }] })
    await expect(deleteItem(season(2), SHOW_ARR, env)).resolves.toEqual({ kind: "failed", code: "HTTP", status: 500 })
    expect(sonarrWrites().map((w) => w.path)).toEqual(["/api/v3/episodefile/bulk"])
    expect(itemWrites()[1].data).not.toHaveProperty("arr")
    expect(prismaMock.cleanupOutcome.create.mock.calls[0][0].data.detail).toEqual({ code: "HTTP", service: "sonarr" })
  })

  it.each([
    ["the season flag write", { "PUT /api/v3/series/22": [{ ok: false, code: "TIMEOUT" }] }, 1],
    ["the episode unmonitor", { "PUT /api/v3/episode/monitor": [{ ok: false, code: "NETWORK" }] }, 2],
  ])("names a partial unmonitor when %s got no answer: Sonarr may have applied it (safety review S-4)", async (_case, extra, n) => {
    seasonReads({ ...(n === 1 ? { listPlexSeasonFiles: [plexFiles(1, [1])] } : {}), ...extra, getSonarrSeries: [{ ok: true, data: { id: 22 } }] })
    await expect(deleteItem(season(n), SHOW_ARR, env)).resolves.toMatchObject({ kind: "failed" })
    expect(itemWrites()[1].data).toMatchObject({ arr: { ...SHOW_ARR, unmonitored: true } })
    expect(prismaMock.cleanupOutcome.create.mock.calls[0][0].data.detail).toMatchObject({ stillUnmonitored: "sonarr" })
  })

  it("exits the season item and the seasons before their show: a season is deleted while its show row waits", async () => {
    seasonReads()
    await deleteItem(season(2), SHOW_ARR, env)
    expect(prismaMock.cleanupItem.findMany).not.toHaveBeenCalled()
    expect(prismaMock.cleanupItem.deleteMany).toHaveBeenCalledTimes(1)
  })
})
