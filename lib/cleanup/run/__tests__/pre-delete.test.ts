/**
 * @jest-environment node
 */

/**
 * The pre-delete re-read (TS 8.8 table, safety-r2-3, safety-r2-10,
 * safety-r3-5, integrations-r3-4, integrations-r4-1 to r7-2): each of the
 * seven rows and its results, `since(item)`, the G12 read of a season's show
 * with its paging (through the real Tautulli history reader, so the mock sees
 * every `start` and `grouping`), and `prepareChecks()`.
 */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({ createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }) }))
const mockArr = { getRadarrMovie: jest.fn(), listRadarrRootFolders: jest.fn(), listRadarrTags: jest.fn(), getSonarrSeries: jest.fn(),
  listSonarrRootFolders: jest.fn(), listSonarrTags: jest.fn() }
jest.mock("@/lib/connections/radarr-library", () => ({ getRadarrMovie: (...a: unknown[]) => mockArr.getRadarrMovie(...a),
  listRadarrRootFolders: (...a: unknown[]) => mockArr.listRadarrRootFolders(...a), listRadarrTags: (...a: unknown[]) => mockArr.listRadarrTags(...a) }))
jest.mock("@/lib/connections/sonarr-library", () => ({ getSonarrSeries: (...a: unknown[]) => mockArr.getSonarrSeries(...a),
  listSonarrRootFolders: (...a: unknown[]) => mockArr.listSonarrRootFolders(...a), listSonarrTags: (...a: unknown[]) => mockArr.listSonarrTags(...a) }))
const mockMetadata = jest.fn()
jest.mock("@/lib/connections/plex-library-read", () => ({ getPlexMetadata: (...a: unknown[]) => mockMetadata(...a) }))
const mockPlaying = jest.fn()
jest.mock("@/lib/connections/plex-playing", () => ({ readPlayingKeys: (...a: unknown[]) => mockPlaying(...a) }))
const mockRequests = jest.fn()
jest.mock("@/lib/connections/overseerr-cleanup", () => ({ forEachRequest: (...a: unknown[]) => mockRequests(...a) }))
const mockTautulli = jest.fn()
jest.mock("@/lib/connections/tautulli", () => ({ tautulliCommand: (...a: unknown[]) => mockTautulli(...a) }))
const mockActive = jest.fn()
jest.mock("@/lib/data/active-service", () => ({ getActiveService: (...a: unknown[]) => mockActive(...a) }))

import { mockReset } from "jest-mock-extended"

import { buildCleanupItem } from "@/__tests__/helpers/cleanup-factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildMovieItem, buildOptions, buildSeasonItem, buildShowItem, buildWhySnapshot, NOW } from "@/lib/cleanup/__tests__/helpers/builders"
import { type ActServices, loadActServices, preDelete, type PreDeleteEnv, type PreDeleteInput, prepareChecks, sinceOf } from "@/lib/cleanup/run/pre-delete"
import type { ArrRef } from "@/lib/cleanup/schema/runtime"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"

const DAY = 86_400_000
const TAKEN_AT = NOW - 9 * 3_600_000 // the newest snapshot read at 03:00
const SINCE_S = Math.floor(TAKEN_AT / 1000)
const services: ActServices = { plex: { url: "http://plex.test:32400", token: "plex-token" }, radarr: { url: "http://radarr.test", apiKey: "rk" },
  sonarr: { url: "http://sonarr.test", apiKey: "sk" }, tautulli: { url: "http://tautulli.test", apiKey: "tk" }, overseerr: { url: "http://seerr.test", apiKey: "ok" } }
const MOVIE = buildMovieItem()
const SHOW = buildShowItem({ copies: [{ ratingKey: "6001", sectionId: "2" }, { ratingKey: "6009", sectionId: "4" }] })
const SEASON = buildSeasonItem(SHOW, 2, { copies: [{ ratingKey: "60020", sectionId: "2" }], episodeKeys: ["6201"] })
const MOVIE_ARR: ArrRef = { service: "radarr", id: 11, titleSlug: "the-invented-movie-1001", path: "/media/movies/The Invented Movie (2019)" }
const SHOW_ARR: ArrRef = { service: "sonarr", id: 22, titleSlug: "an-invented-show", path: "/media/tv/An Invented Show" }

const radarrMovie = (overrides: object = {}) => ({ id: 11, title: "The Invented Movie", titleSlug: MOVIE_ARR.titleSlug, tmdbId: 1001, imdbId: "tt0000001",
  path: MOVIE_ARR.path, monitored: false, hasFile: true, movieFileId: 77, added: "2025-01-01T00:00:00Z", tags: [], ...overrides })
const sonarrSeries = (seasons: { seasonNumber: number; statistics: { episodeFileCount: number; sizeOnDisk: number } | null }[], overrides: object = {}) => ({
  id: 22, title: "An Invented Show", titleSlug: SHOW_ARR.titleSlug, tvdbId: 2002, tmdbId: 3003, imdbId: null, path: SHOW_ARR.path, status: "ended",
  monitored: false, added: "2020-01-01T00:00:00Z", tags: [], seasons: seasons.map((s) => ({ monitored: false, ...s })), ...overrides })
const stats = (episodeFileCount: number) => ({ episodeFileCount, sizeOnDisk: episodeFileCount * 1000 })

function input(item: SnapshotItem, overrides: Partial<PreDeleteInput> = {}): PreDeleteInput {
  const arr = item.level === "movie" ? MOVIE_ARR : SHOW_ARR
  return { row: buildCleanupItem({ itemKey: item.key, level: item.level, titleKey: item.titleKey, ratingKey: item.ratingKey, seasonNumber: item.seasonNumber,
    arr, why: buildWhySnapshot({ takenAt: new Date(TAKEN_AT).toISOString() }) }), arr, item, show: item.level === "season" ? SHOW : null, ...overrides }
}

function env(overrides: Partial<PreDeleteEnv> = {}): PreDeleteEnv {
  return { services, options: buildOptions({ protections: { g12: { enabled: false } } }), users: { 100: { hasAccess: true, lastPlayAt: null, owner: false } },
    takenAt: TAKEN_AT, zone: "UTC", now: new Date(NOW), prepared: { roots: { radarr: ["/media/movies"], sonarr: ["/media/tv"] },
      tags: { radarr: new Map([[1, "keep"]]), sonarr: new Map() }, requests: [] }, ...overrides }
}

type HistoryRowInput = { row_id?: string | null; started?: number; stopped?: number | null; play_duration?: number; percent_complete?: number }
const historyRow = (r: HistoryRowInput = {}) => ({ row_id: "1", reference_id: "1", user_id: 100, started: SINCE_S - 3600, stopped: SINCE_S - 1800,
  play_duration: 1800, percent_complete: 50, watched_status: 0, media_type: "episode", rating_key: "6201", parent_rating_key: "60020",
  grandparent_rating_key: "6001", guid: null, live: 0, ...r })
/** Pages by key column: `pages[column][page]` is the row list of that page. */
function history(pages: Record<string, HistoryRowInput[][]>) {
  mockTautulli.mockImplementation(async (_config: unknown, _cmd: string, query: Record<string, string | number>) => {
    const columns = ["rating_key", "parent_rating_key", "grandparent_rating_key"]
    const column = columns.find((c) => c in query) ?? ""
    const page = Number(query.start) / 25
    const rows = (pages[column]?.[page] ?? []).map((r, i) => historyRow({ row_id: String(columns.indexOf(column) * 100_000 + page * 100 + i + 1), ...r }))
    return { ok: true, data: { recordsFiltered: 9999, data: rows } }
  })
}
const historyQueries = () => mockTautulli.mock.calls.map(([, , query]) => query as Record<string, string | number>)
const short = (n: number, at = SINCE_S + 600) => Array.from({ length: n }, () => ({ started: at, stopped: at + 30, play_duration: 30, percent_complete: 1 }))

beforeEach(() => {
  mockReset(prismaMock)
  for (const fn of [...Object.values(mockArr), mockMetadata, mockPlaying, mockRequests, mockTautulli, mockActive]) fn.mockReset()
  mockArr.getRadarrMovie.mockResolvedValue({ ok: true, data: radarrMovie() })
  mockArr.getSonarrSeries.mockResolvedValue({ ok: true, data: sonarrSeries([{ seasonNumber: 1, statistics: stats(2) }, { seasonNumber: 2, statistics: stats(1) },
    { seasonNumber: 3, statistics: stats(1) }]) })
  mockMetadata.mockResolvedValue({ ok: true, data: { ratingKey: "5001", type: "movie", Media: [{ Part: [{ file: `${MOVIE_ARR.path}/movie.mkv` }] }] } })
  mockPlaying.mockResolvedValue({ ok: true, data: new Set(["999"]) })
  history({})
  prismaMock.cleanupProtection.findMany.mockResolvedValue([])
  prismaMock.userMediaMark.findFirst.mockResolvedValue(null)
  prismaMock.watchlistSyncHistory.findMany.mockResolvedValue([])
})

describe("sinceOf and the connections", () => {
  it("takes the older of the item's Why and the newest snapshot, and the snapshot without a Why", () => {
    const older = new Date(TAKEN_AT - 2 * DAY).toISOString()
    expect(sinceOf({ why: buildWhySnapshot({ takenAt: older }) }, TAKEN_AT)).toBe(TAKEN_AT - 2 * DAY)
    expect(sinceOf({ why: buildWhySnapshot({ takenAt: new Date(TAKEN_AT + DAY).toISOString() }) }, TAKEN_AT)).toBe(TAKEN_AT)
    expect(sinceOf({ why: null }, TAKEN_AT)).toBe(TAKEN_AT)
  })

  it("reads the active connections, with null for a service that is not set up", async () => {
    mockActive.mockImplementation(async (kind: string) => (kind === "plex" ? { url: "http://plex.test", token: "t" } : kind === "radarr" ? { url: "http://r", apiKey: "k" } : null))
    await expect(loadActServices()).resolves.toEqual({ plex: { url: "http://plex.test", token: "t" }, radarr: { url: "http://r", apiKey: "k" }, sonarr: null,
      tautulli: null, overseerr: null })
  })
})

describe("prepareChecks (TS 8.8 step 5)", () => {
  it("reads the roots, the tag maps in lower case and the requests after the oldest since, once", async () => {
    mockArr.listRadarrRootFolders.mockResolvedValue({ ok: true, data: [{ path: "/media/movies" }] })
    mockArr.listSonarrRootFolders.mockResolvedValue({ ok: false, code: "TIMEOUT" })
    mockArr.listRadarrTags.mockResolvedValue({ ok: true, data: [{ id: 1, label: "Keep" }] })
    mockArr.listSonarrTags.mockResolvedValue({ ok: false, code: "TIMEOUT" })
    const request = { id: 1, status: 2, type: "movie", createdAt: new Date(NOW).toISOString(), requestedBy: null, media: { tmdbId: 1001 } }
    mockRequests.mockImplementation(async (_c: unknown, onRows: (rows: unknown[]) => void) => (onRows([request]), { ok: true, data: { rows: 1, pages: 1 } }))
    const prepared = await prepareChecks(services, { oldestSince: TAKEN_AT, g9: true })
    expect(prepared).toEqual({ roots: { radarr: ["/media/movies"], sonarr: null }, tags: { radarr: new Map([[1, "keep"]]), sonarr: null }, requests: [request] })
    expect(mockRequests).toHaveBeenCalledWith(services.overseerr, expect.any(Function), { until: TAKEN_AT, signal: undefined })
  })

  it("reads no tags with G9 off, nothing of a service that is not set up, and gives null when Overseerr failed", async () => {
    mockArr.listRadarrRootFolders.mockResolvedValue({ ok: true, data: [] })
    const none = { ...services, sonarr: null, overseerr: null }
    await expect(prepareChecks(none, { oldestSince: TAKEN_AT, g9: false })).resolves.toEqual({ roots: { radarr: [], sonarr: null },
      tags: { radarr: null, sonarr: null }, requests: [] })
    expect(mockArr.listRadarrTags).not.toHaveBeenCalled()
    expect(mockArr.listSonarrRootFolders).not.toHaveBeenCalled()
    mockRequests.mockResolvedValue({ ok: false, code: "TIMEOUT" })
    await expect(prepareChecks({ ...none, overseerr: services.overseerr }, { oldestSince: TAKEN_AT, g9: false })).resolves.toBeNull()
  })
})

describe("row 1: the arr record still exists", () => {
  it("gives gone on a 404 of Radarr or Sonarr (getSonarrSeries, integrations-r3-4)", async () => {
    mockArr.getRadarrMovie.mockResolvedValue({ ok: false, code: "HTTP", status: 404 })
    await expect(preDelete(input(MOVIE), env())).resolves.toEqual({ kind: "gone" })
    mockArr.getSonarrSeries.mockResolvedValue({ ok: false, code: "HTTP", status: 404 })
    await expect(preDelete(input(SEASON), env())).resolves.toEqual({ kind: "gone" })
    expect(mockArr.getSonarrSeries).toHaveBeenCalledWith(services.sonarr, 22, { signal: undefined })
  })

  it("holds on another failure, names a refused key, and holds without the service or its roots", async () => {
    mockArr.getRadarrMovie.mockResolvedValueOnce({ ok: false, code: "TIMEOUT" }).mockResolvedValueOnce({ ok: false, code: "HTTP", status: 401 })
    await expect(preDelete(input(MOVIE), env())).resolves.toEqual({ kind: "hold", code: "sourceFailed:radarr" })
    await expect(preDelete(input(MOVIE), env())).resolves.toEqual({ kind: "hold", code: "sourceFailed:radarr", refused: "radarr" })
    await expect(preDelete(input(MOVIE), env({ services: { ...services, radarr: null } }))).resolves.toEqual({ kind: "hold", code: "sourceFailed:radarr" })
    const prepared = { ...env().prepared, roots: { radarr: null, sonarr: ["/media/tv"] } }
    await expect(preDelete(input(MOVIE), env({ prepared }))).resolves.toEqual({ kind: "hold", code: "sourceFailed:radarr" })
  })
})

describe("row 2: same ids and path, no new files", () => {
  it.each([
    ["another match id", { tmdbId: 1002 }],
    ["another shared id", { imdbId: "tt0000009" }],
    ["another path", { path: "/media/movies/Other (2019)" }],
  ])("rescues recordChanged for %s", async (_name, overrides) => {
    mockArr.getRadarrMovie.mockResolvedValue({ ok: true, data: radarrMovie(overrides) })
    await expect(preDelete(input(MOVIE), env())).resolves.toEqual({ kind: "rescue", reason: "recordChanged" })
  })

  it("rescues a path that no root strictly holds, and passes an id that only one side has", async () => {
    await expect(preDelete(input(MOVIE), env({ prepared: { ...env().prepared, roots: { radarr: [MOVIE_ARR.path], sonarr: [] } } })))
      .resolves.toEqual({ kind: "rescue", reason: "recordChanged" })
    mockArr.getRadarrMovie.mockResolvedValue({ ok: true, data: radarrMovie({ imdbId: null }) })
    await expect(preDelete(input(MOVIE), env())).resolves.toMatchObject({ kind: "go" })
    await expect(preDelete(input(buildMovieItem({ match: { state: "matched" } })), env())).resolves.toEqual({ kind: "rescue", reason: "recordChanged" })
  })

  it("reads an arr id of 0 or an empty IMDb id as no id, and IMDb ids in any case, as the snapshot match does (safety review S-3)", async () => {
    mockArr.getSonarrSeries.mockResolvedValue({ ok: true, data: sonarrSeries([{ seasonNumber: 2, statistics: stats(1) }], { tmdbId: 0 }) })
    await expect(preDelete(input(buildShowItem({ ids: { tvdb: 2002, tmdb: 3003 } })), env())).resolves.toMatchObject({ kind: "go" })
    mockArr.getRadarrMovie.mockResolvedValue({ ok: true, data: radarrMovie({ imdbId: "TT0000001" }) })
    await expect(preDelete(input(buildMovieItem({ ids: { tmdb: 1001, imdb: "tt0000001" } })), env())).resolves.toMatchObject({ kind: "go" })
    mockArr.getRadarrMovie.mockResolvedValue({ ok: true, data: radarrMovie({ imdbId: "" }) })
    await expect(preDelete(input(MOVIE), env())).resolves.toMatchObject({ kind: "go" })
    mockArr.getRadarrMovie.mockResolvedValue({ ok: true, data: radarrMovie({ tmdbId: 0 }) })
    await expect(preDelete(input(MOVIE), env())).resolves.toEqual({ kind: "rescue", reason: "recordChanged" })
  })

  it("rescues newContent for more Sonarr files than the snapshot item's arr.fileCount (safety-r2-3, architecture-r3-5)", async () => {
    const show = buildShowItem({ arr: { ...SHOW.arr!, fileCount: 3 } })
    await expect(preDelete(input(show), env())).resolves.toEqual({ kind: "rescue", reason: "newContent" })
    const season = buildSeasonItem(SHOW, 1, { arr: { ...SHOW.arr!, fileCount: 1 } })
    await expect(preDelete(input(season), env())).resolves.toEqual({ kind: "rescue", reason: "newContent" })
  })

  it("counts a season with null statistics as 0, and passes with no stored fileCount", async () => {
    mockArr.getSonarrSeries.mockResolvedValue({ ok: true, data: sonarrSeries([{ seasonNumber: 1, statistics: null }, { seasonNumber: 2, statistics: stats(1) }]) })
    await expect(preDelete(input(buildShowItem({ arr: { ...SHOW.arr!, fileCount: 1 } })), env())).resolves.toMatchObject({ kind: "go" })
    await expect(preDelete(input(buildSeasonItem(SHOW, 1, { arr: { ...SHOW.arr!, fileCount: 0 } })), env())).resolves.toMatchObject({ kind: "go" })
    mockArr.getSonarrSeries.mockResolvedValue({ ok: true, data: sonarrSeries([{ seasonNumber: 1, statistics: stats(9) }]) })
    const { fileCount: _drop, ...noCount } = SHOW.arr!
    await expect(preDelete(input(buildShowItem({ arr: noCount })), env())).resolves.toMatchObject({ kind: "go" })
  })
})

describe("row 3: the Plex copy inside the arr path (movies)", () => {
  it("holds plexMissing on a 404 and sourceFailed on another failure or with no Plex server", async () => {
    mockMetadata.mockResolvedValueOnce({ ok: false, code: "HTTP", status: 404 }).mockResolvedValueOnce({ ok: false, code: "TIMEOUT" })
    await expect(preDelete(input(MOVIE), env())).resolves.toEqual({ kind: "hold", code: "plexMissing" })
    await expect(preDelete(input(MOVIE), env())).resolves.toEqual({ kind: "hold", code: "sourceFailed:plex" })
    await expect(preDelete(input(MOVIE), env({ services: { ...services, plex: null } }))).resolves.toEqual({ kind: "hold", code: "sourceFailed:plex" })
    expect(mockMetadata).toHaveBeenCalledWith(services.plex, "5001", { signal: undefined })
  })

  it("rescues recordChanged for a file outside the path, or no file", async () => {
    mockMetadata.mockResolvedValueOnce({ ok: true, data: { Media: [{ Part: [{ file: "/media/movies4k/movie.mkv" }] }] } })
      .mockResolvedValueOnce({ ok: true, data: { Media: [] } })
    await expect(preDelete(input(MOVIE), env())).resolves.toEqual({ kind: "rescue", reason: "recordChanged" })
    await expect(preDelete(input(MOVIE), env())).resolves.toEqual({ kind: "rescue", reason: "recordChanged" })
  })
})

describe("row 4: no play since since(item)", () => {
  it("reads the copy keys of each level with after = since − 1 day, include_activity, grouping and stopped", async () => {
    await preDelete(input(MOVIE), env())
    await preDelete(input(SHOW), env())
    await preDelete(input(SEASON), env())
    const queries = historyQueries()
    expect(queries.map((q) => [q.rating_key, q.grandparent_rating_key, q.parent_rating_key])).toEqual([["5001", undefined, undefined],
      [undefined, "6001,6009", undefined], [undefined, undefined, "60020"]])
    expect(queries[0]).toMatchObject({ after: "2026-11-07", include_activity: 1, grouping: 1, order_column: "date", order_dir: "desc", start: 0, length: 25 })
  })

  it.each([
    ["a row that stopped after since", { started: SINCE_S + 60, stopped: SINCE_S + 600 }],
    ["a session that started before takenAt and stopped later", { started: SINCE_S - 7200, stopped: SINCE_S + 60, play_duration: 7260 }],
    ["a live session row (row_id null)", { row_id: null, stopped: null, started: SINCE_S - 60 }],
  ])("rescues played for %s", async (_name, row) => {
    history({ rating_key: [[row]] })
    await expect(preDelete(input(MOVIE), env())).resolves.toEqual({ kind: "rescue", reason: "played" })
  })

  it("rescues a play inside a refreshed snapshot: since is the item's older takenAt", async () => {
    const older = TAKEN_AT - 2 * DAY
    history({ rating_key: [[{ started: SINCE_S - DAY / 1000, stopped: SINCE_S - DAY / 1000 + 600 }]] })
    const row = { ...input(MOVIE).row, why: buildWhySnapshot({ takenAt: new Date(older).toISOString() }) }
    await expect(preDelete({ ...input(MOVIE), row }, env())).resolves.toEqual({ kind: "rescue", reason: "played" })
    expect(historyQueries()[0].after).toBe("2026-11-05")
  })

  it("passes a row that stopped before since, holds on a failure, and reads nothing without Tautulli", async () => {
    history({ rating_key: [[{}]] })
    await expect(preDelete(input(MOVIE), env())).resolves.toMatchObject({ kind: "go" })
    mockTautulli.mockResolvedValue({ ok: false, code: "TIMEOUT" })
    await expect(preDelete(input(MOVIE), env())).resolves.toEqual({ kind: "hold", code: "sourceFailed:tautulli" })
    mockTautulli.mockClear()
    await expect(preDelete(input(MOVIE), env({ services: { ...services, tautulli: null } }))).resolves.toMatchObject({ kind: "go" })
    expect(mockTautulli).not.toHaveBeenCalled()
  })

  it("holds noValue:history after 8 full pages of the item's rows before since", async () => {
    history({ rating_key: Array.from({ length: 8 }, () => Array.from({ length: 25 }, () => ({}))) })
    await expect(preDelete(input(MOVIE), env())).resolves.toEqual({ kind: "hold", code: "noValue:history" })
  })
})

describe("row 4 for a season while G12 is on (safety-r3-5, integrations-r4-1 to r7-2)", () => {
  const g12 = () => env({ options: buildOptions() })

  it("rescues protected g12 for 25 short rows of the show on page 0 and one counted row on page 1", async () => {
    history({ grandparent_rating_key: [short(25), [{ started: SINCE_S + 60, stopped: SINCE_S + 3000, play_duration: 2940, percent_complete: 60 }]] })
    await expect(preDelete(input(SEASON), g12())).resolves.toEqual({ kind: "rescue", reason: "protected", detail: { protectionId: "g12" } })
    const shows = historyQueries().filter((q) => "grandparent_rating_key" in q)
    expect(shows.map((q) => q.start)).toEqual([0, 25])
    expect(shows.every((q) => q.grouping === 1 && q.grandparent_rating_key === "6001,6009" && q.after === "2026-11-07")).toBe(true)
  })

  it("reads on past a full page 0 whose last row started before since, and rescues on page 1 (integrations-r6-1)", async () => {
    const page0 = [...short(24), { started: SINCE_S - 7200, stopped: SINCE_S - 7000, play_duration: 30, percent_complete: 1 }]
    history({ grandparent_rating_key: [page0, [{ started: SINCE_S - 5000, stopped: SINCE_S + 600, play_duration: 5600, percent_complete: 95 }]] })
    await expect(preDelete(input(SEASON), g12())).resolves.toEqual({ kind: "rescue", reason: "protected", detail: { protectionId: "g12" } })
    expect(historyQueries().filter((q) => "grandparent_rating_key" in q).map((q) => [q.start, q.grouping])).toEqual([[0, 1], [25, 1]])
  })

  it("holds noValue:g12 after eight full pages of short rows, and never reads start=200 (integrations-r7-2)", async () => {
    history({ grandparent_rating_key: Array.from({ length: 9 }, () => short(25)) })
    await expect(preDelete(input(SEASON), g12())).resolves.toEqual({ kind: "hold", code: "noValue:g12" })
    const starts = historyQueries().filter((q) => "grandparent_rating_key" in q).map((q) => q.start)
    expect(starts).toEqual([0, 25, 50, 75, 100, 125, 150, 175])
  })

  it("passes a show with only short rows, holds with no show item or a failed read, and reads no show with G12 off", async () => {
    history({ grandparent_rating_key: [short(3)] })
    await expect(preDelete(input(SEASON), g12())).resolves.toMatchObject({ kind: "go" })
    await expect(preDelete(input(SEASON, { show: null }), g12())).resolves.toEqual({ kind: "hold", code: "noValue:g12" })
    mockTautulli.mockImplementation(async (_c: unknown, _cmd: string, q: Record<string, unknown>) =>
      ("grandparent_rating_key" in q ? { ok: false, code: "TIMEOUT" } : { ok: true, data: { recordsFiltered: 0, data: [] } }))
    await expect(preDelete(input(SEASON), g12())).resolves.toEqual({ kind: "hold", code: "sourceFailed:tautulli" })
    mockTautulli.mockClear()
    await preDelete(input(SEASON), env())
    expect(historyQueries().some((q) => "grandparent_rating_key" in q)).toBe(false)
  })
})

describe("row 5: no new request", () => {
  const request = (overrides: object) => ({ id: 1, status: 2, type: "movie", createdAt: new Date(NOW - 3_600_000).toISOString(), requestedBy: null,
    media: { tmdbId: 1001 }, ...overrides })
  const withRequests = (requests: object[]) => env({ prepared: { ...env().prepared, requests: requests as never } })

  it.each([
    ["a movie request after since", MOVIE, [request({})]],
    ["a request whose date does not parse", MOVIE, [request({ createdAt: "not a date" })]],
    ["a whole-show request", SEASON, [request({ type: "tv", media: { tvdbId: 2002 } })]],
    ["a request of the season", SEASON, [request({ type: "tv", media: { tvdbId: 2002 }, seasons: [{ seasonNumber: 2 }] })]],
    ["a tv request by tmdb id only", SHOW, [request({ type: "tv", media: { tmdbId: 3003 } })]],
  ])("rescues requested for %s", async (_name, item, requests) => {
    await expect(preDelete(input(item), withRequests(requests))).resolves.toEqual({ kind: "rescue", reason: "requested" })
  })

  it.each([
    ["a declined request", MOVIE, [request({ status: 3 })]],
    ["a request before since", MOVIE, [request({ createdAt: new Date(TAKEN_AT - 1000).toISOString() })]],
    ["a request of another season", SEASON, [request({ type: "tv", media: { tvdbId: 2002 }, seasons: [{ seasonNumber: 3 }] })]],
    ["a request of another title", MOVIE, [request({ media: { tmdbId: 9 } }), request({ type: "tv", media: { tvdbId: 1001 } })]],
  ])("passes %s", async (_name, item, requests) => {
    await expect(preDelete(input(item), withRequests(requests))).resolves.toMatchObject({ kind: "go" })
  })
})

describe("row 6: no protection now", () => {
  it("reads the protections of cascadeWhere() and of shared external ids, and rescues a Keep before an exclusion", async () => {
    prismaMock.cleanupProtection.findMany.mockResolvedValue([{ kind: "adminExclude" }, { kind: "memberKeep" }] as never)
    await expect(preDelete(input(SEASON), env())).resolves.toEqual({ kind: "rescue", reason: "kept" })
    const where = prismaMock.cleanupProtection.findMany.mock.calls[0][0]?.where
    expect(JSON.stringify(where)).toContain(JSON.stringify({ itemKey: { in: ["season:tvdb:2002:2", "show:tvdb:2002"] } }))
    expect(JSON.stringify(where)).toContain(JSON.stringify({ AND: [{ OR: [{ externalIds: { path: ["tmdb"], equals: 3003 } },
      { externalIds: { path: ["tvdb"], equals: 2002 } }] }, { OR: [{ level: "show" }, { level: "season", seasonNumber: 2 }] }] }))
    prismaMock.cleanupProtection.findMany.mockResolvedValue([{ kind: "adminExclude" }] as never)
    await expect(preDelete(input(MOVIE), env())).resolves.toEqual({ kind: "rescue", reason: "excluded" })
    expect(JSON.stringify(prismaMock.cleanupProtection.findMany.mock.calls[1][0]?.where)).toContain('{"level":"movie"}')
    await preDelete(input(SHOW), env())
    expect(JSON.stringify(prismaMock.cleanupProtection.findMany.mock.calls[2][0]?.where)).toContain('{"level":{"in":["show","season"]}}')
  })

  it("rescues markedKeepForever for a mark on a copy or episode key, and reads no mark with G2 off", async () => {
    prismaMock.userMediaMark.findFirst.mockResolvedValue({ id: "mark-1" } as never)
    await expect(preDelete(input(SEASON), env())).resolves.toEqual({ kind: "rescue", reason: "markedKeepForever" })
    expect(prismaMock.userMediaMark.findFirst).toHaveBeenCalledWith({ where: { markType: "KEEP_FOREVER", plexRatingKey: { in: ["6201", "6001", "6009"] } },
      select: { id: true } })
    prismaMock.userMediaMark.findFirst.mockClear()
    await expect(preDelete(input(MOVIE), env({ options: buildOptions({ protections: { g2: { enabled: false }, g12: { enabled: false } } }) })))
      .resolves.toMatchObject({ kind: "go" })
    expect(prismaMock.userMediaMark.findFirst).not.toHaveBeenCalled()
  })

  it("rescues g8 for a watchlist of a member with access only, with the show's ids for a season", async () => {
    prismaMock.watchlistSyncHistory.findMany.mockResolvedValue([{ user: { plexUserId: "200" } }, { user: { plexUserId: null } }] as never)
    await expect(preDelete(input(SEASON), env())).resolves.toMatchObject({ kind: "go" })
    expect(prismaMock.watchlistSyncHistory.findMany.mock.calls[0][0]?.where?.OR).toEqual([{ tmdbId: 3003 }, { tvdbId: 2002 }])
    prismaMock.watchlistSyncHistory.findMany.mockResolvedValue([{ user: { plexUserId: "100" } }] as never)
    await expect(preDelete(input(MOVIE), env())).resolves.toEqual({ kind: "rescue", reason: "protected", detail: { protectionId: "g8" } })
  })

  it("rescues g9 for a keep tag of the record that row 1 read, and holds when the tag map failed", async () => {
    mockArr.getRadarrMovie.mockResolvedValue({ ok: true, data: radarrMovie({ tags: [1] }) })
    await expect(preDelete(input(MOVIE), env())).resolves.toEqual({ kind: "rescue", reason: "protected", detail: { protectionId: "g9" } })
    await expect(preDelete(input(MOVIE), env({ prepared: { ...env().prepared, tags: { radarr: null, sonarr: null } } })))
      .resolves.toEqual({ kind: "hold", code: "sourceFailed:radarr" })
    await expect(preDelete(input(MOVIE), env({ options: buildOptions({ protections: { g9: { enabled: false }, g12: { enabled: false } } }) })))
      .resolves.toMatchObject({ kind: "go" })
  })
})

describe("row 7: nobody plays it now", () => {
  it("defers for a playing copy or episode key, a failed read, or no Plex server", async () => {
    mockPlaying.mockResolvedValueOnce({ ok: true, data: new Set(["6201"]) }).mockResolvedValueOnce({ ok: false, code: "TIMEOUT" })
    await expect(preDelete(input(SEASON), env())).resolves.toEqual({ kind: "defer" })
    await expect(preDelete(input(MOVIE), env())).resolves.toEqual({ kind: "defer" })
    await expect(preDelete(input(SEASON), env({ services: { ...services, plex: null } }))).resolves.toEqual({ kind: "defer" })
  })

  it("gives go with the record when every check passes", async () => {
    await expect(preDelete(input(MOVIE), env())).resolves.toEqual({ kind: "go", record: expect.objectContaining({ id: 11, tmdbId: 1001 }) })
  })
})
