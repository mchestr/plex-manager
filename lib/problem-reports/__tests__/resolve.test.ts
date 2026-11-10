/**
 * resolveFile: the file Plex plays, matched to Radarr's movie file or a
 * Sonarr episode file by name and folder, read fresh, with every case that
 * sends a fix to the server admin instead.
 */

import { getPlexItemMetadata, type PlexItemMetadata } from "@/lib/connections/plex"
import { findRadarrMovie } from "@/lib/connections/radarr"
import { getRadarrMovieFile } from "@/lib/connections/radarr-movie"
import { findSonarrSeries } from "@/lib/connections/sonarr"
import { getSonarrSeriesState, listSonarrEpisodeFiles, listSonarrEpisodes } from "@/lib/connections/sonarr-episodes"
import { getActiveService } from "@/lib/data/active-service"
import { resolveFile } from "@/lib/problem-reports/resolve"

jest.mock("@/lib/connections/plex", () => ({ getPlexItemMetadata: jest.fn() }))
jest.mock("@/lib/connections/radarr", () => ({ findRadarrMovie: jest.fn() }))
jest.mock("@/lib/connections/radarr-movie", () => ({ getRadarrMovieFile: jest.fn() }))
jest.mock("@/lib/connections/sonarr", () => ({ findSonarrSeries: jest.fn() }))
jest.mock("@/lib/connections/sonarr-episodes", () => ({ getSonarrSeriesState: jest.fn(), listSonarrEpisodes: jest.fn(), listSonarrEpisodeFiles: jest.fn() }))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))

const SERVER = { url: "http://plex.local:32400", token: "owner-token" }
const RADARR = { name: "Radarr", url: "http://radarr.local:7878", apiKey: "radarr-key" }
const SONARR = { name: "Sonarr", url: "http://sonarr.local:8989", apiKey: "sonarr-key" }

const version = (...files: string[]): PlexItemMetadata["media"][number] => ({ optimized: false, parts: files.map((file) => ({ file, size: 4200 })) })
const MOVIE_FILE = "/data/movies/Heat (1995)/Heat (1995) WEBDL-720p.mkv"
const MOVIE: PlexItemMetadata = { ratingKey: "555", type: "movie", title: "Heat", year: 1995, ids: { tmdb: 949 }, librarySectionId: "1", media: [version(MOVIE_FILE)], locations: [] }
const RADARR_FILE = { id: 77, relativePath: "Heat (1995) WEBDL-720p.mkv", path: "/movies/Heat (1995)/Heat (1995) WEBDL-720p.mkv", size: 4200, qualityCutoffNotMet: true, customFormatScore: 0 }
const RADARR_MOVIE = { id: 5, monitored: true, qualityProfileId: 4, path: "/movies/Heat (1995)", file: RADARR_FILE }

const EPISODE_FILE = "/data/tv/The Office (US)/Season 01/The Office S01E01.mkv"
const SHOW: PlexItemMetadata = { ratingKey: "6999", type: "show", title: "The Office", ids: { tvdb: 73244 }, librarySectionId: "2", media: [], locations: [] }
const EPISODE: PlexItemMetadata = {
  ratingKey: "7001",
  type: "episode",
  title: "Pilot",
  ids: {},
  librarySectionId: "2",
  grandparentRatingKey: "6999",
  seasonNumber: 1,
  episodeNumber: 1,
  media: [version(EPISODE_FILE)],
  locations: [],
}
const SONARR_FILE = { id: 501, relativePath: "Season 01/The Office S01E01.mkv", path: "/tv/The Office (US)/Season 01/The Office S01E01.mkv", size: 4200, qualityCutoffNotMet: false, customFormatScore: 20 }
const episode = (id: number, overrides: Partial<{ seasonNumber: number; episodeNumber: number; monitored: boolean; episodeFileId: number | null }> = {}) => ({
  id,
  seasonNumber: 1,
  episodeNumber: id - 10,
  airDateUtc: "2005-03-24T00:00:00Z",
  monitored: true,
  hasFile: true,
  episodeFileId: 501,
  ...overrides,
})

function plexHas(...items: PlexItemMetadata[]) {
  jest.mocked(getPlexItemMetadata).mockImplementation(async (_server, ratingKey) => {
    const item = items.find((candidate) => candidate.ratingKey === ratingKey)
    return item ? { status: "found", item } : { status: "missing" }
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getActiveService).mockImplementation((async (kind: string) => (kind === "radarr" ? RADARR : kind === "sonarr" ? SONARR : null)) as never)
  plexHas(MOVIE, SHOW, EPISODE)
  jest.mocked(findRadarrMovie).mockResolvedValue({ success: true, data: { id: 5, titleSlug: "heat-1995", tmdbId: 949 } })
  jest.mocked(getRadarrMovieFile).mockResolvedValue({ success: true, data: RADARR_MOVIE })
  jest.mocked(findSonarrSeries).mockResolvedValue({ success: true, data: { id: 42, titleSlug: "the-office-us", tvdbId: 73244 } })
  jest.mocked(getSonarrSeriesState).mockResolvedValue({ success: true, data: { id: 42, monitored: true, qualityProfileId: 6 } })
  jest.mocked(listSonarrEpisodes).mockResolvedValue({ success: true, data: [episode(11), episode(12, { episodeFileId: 502 })] })
  jest.mocked(listSonarrEpisodeFiles).mockResolvedValue({ success: true, data: [SONARR_FILE, { ...SONARR_FILE, id: 502, relativePath: "Season 01/The Office S01E02.mkv", path: null }] })
})

describe("resolveFile: a movie", () => {
  it("matches Radarr's file by name and folder, though the two see different roots", async () => {
    await expect(resolveFile(SERVER, "555")).resolves.toEqual({
      ok: true,
      resolved: {
        service: "radarr",
        config: RADARR,
        titleId: 5,
        qualityProfileId: 4,
        file: RADARR_FILE,
        episodeIds: [],
        plex: { ratingKey: "555", sectionId: "1", file: MOVIE_FILE, folder: "/data/movies/Heat (1995)" },
      },
    })
    expect(findRadarrMovie).toHaveBeenCalledWith(RADARR, { tmdb: 949 })
    expect(getRadarrMovieFile).toHaveBeenCalledWith(RADARR, 5)
  })

  it("matches a file Radarr names only relative to the movie's folder", async () => {
    jest.mocked(getRadarrMovieFile).mockResolvedValue({ success: true, data: { ...RADARR_MOVIE, file: { ...RADARR_FILE, path: null } } })

    await expect(resolveFile(SERVER, "555")).resolves.toMatchObject({ ok: true, resolved: { file: { id: 77 } } })
  })

  it("ignores a version Plex optimized", async () => {
    plexHas({ ...MOVIE, media: [version(MOVIE_FILE), { optimized: true, parts: [{ file: "/data/optimized/Heat.mp4" }] }] })

    await expect(resolveFile(SERVER, "555")).resolves.toMatchObject({ ok: true })
  })

  it.each([
    ["Plex has two real versions", { ...MOVIE, media: [version(MOVIE_FILE), version("/data/movies/Heat (1995)/Heat (1995) Bluray-2160p.mkv")] }, "SEVERAL_VERSIONS"],
    ["the movie is split into parts", { ...MOVIE, media: [version("/data/movies/Heat (1995)/Heat CD1.mkv", "/data/movies/Heat (1995)/Heat CD2.mkv")] }, "MULTI_PART"],
    ["Plex has only an optimized version", { ...MOVIE, media: [{ optimized: true, parts: [{ file: "/data/optimized/Heat.mp4" }] }] }, "NO_FILE"],
    ["Plex has no ids for it", { ...MOVIE, ids: {} }, "NO_IDS"],
    ["the item isn't a movie or an episode", { ...MOVIE, type: "show" }, "NO_FILE"],
  ])("goes to the server admin when %s", async (_case, item, reason) => {
    plexHas(item)

    await expect(resolveFile(SERVER, "555")).resolves.toEqual({ ok: false, reason })
  })

  it.each([
    ["Radarr's file has another name", () => jest.mocked(getRadarrMovieFile).mockResolvedValue({ success: true, data: { ...RADARR_MOVIE, file: { ...RADARR_FILE, path: "/movies/Heat (1995)/Heat (1995) Bluray-1080p.mkv", relativePath: "Heat (1995) Bluray-1080p.mkv" } } }), "NO_FILE"],
    ["Radarr's file is in another folder", () => jest.mocked(getRadarrMovieFile).mockResolvedValue({ success: true, data: { ...RADARR_MOVIE, file: { ...RADARR_FILE, path: "/movies/Heat (2022)/Heat (1995) WEBDL-720p.mkv" } } }), "NO_FILE"],
    ["Radarr has no file", () => jest.mocked(getRadarrMovieFile).mockResolvedValue({ success: true, data: { ...RADARR_MOVIE, file: null } }), "NO_FILE"],
    ["the movie isn't monitored", () => jest.mocked(getRadarrMovieFile).mockResolvedValue({ success: true, data: { ...RADARR_MOVIE, monitored: false } }), "UNMONITORED"],
    ["Radarr isn't set up", () => jest.mocked(getActiveService).mockResolvedValue(null), "NO_RADARR"],
    ["Radarr doesn't have the movie", () => jest.mocked(findRadarrMovie).mockResolvedValue({ success: true, data: null }), "NOT_IN_RADARR"],
    ["Radarr can't be searched", () => jest.mocked(findRadarrMovie).mockResolvedValue({ success: false, error: "down" }), "UNAVAILABLE"],
    ["the movie can't be read", () => jest.mocked(getRadarrMovieFile).mockResolvedValue({ success: false, error: "down" }), "UNAVAILABLE"],
    ["Plex can't be read", () => jest.mocked(getPlexItemMetadata).mockResolvedValue({ status: "unknown" }), "UNAVAILABLE"],
  ])("goes to the server admin when %s", async (_case, arrange, reason) => {
    arrange()

    await expect(resolveFile(SERVER, "555")).resolves.toEqual({ ok: false, reason })
  })
})

describe("resolveFile: an episode", () => {
  it("matches Sonarr's file by name and season folder, with the file's episodes and the show's ids", async () => {
    await expect(resolveFile(SERVER, "7001")).resolves.toEqual({
      ok: true,
      resolved: {
        service: "sonarr",
        config: SONARR,
        titleId: 42,
        qualityProfileId: 6,
        file: SONARR_FILE,
        episodeIds: [11],
        plex: { ratingKey: "7001", sectionId: "2", file: EPISODE_FILE, folder: "/data/tv/The Office (US)/Season 01" },
      },
    })
    expect(findSonarrSeries).toHaveBeenCalledWith(SONARR, { tvdb: 73244 })
  })

  it("keeps both episodes of a double-episode file", async () => {
    jest.mocked(listSonarrEpisodes).mockResolvedValue({ success: true, data: [episode(11), episode(12)] })

    await expect(resolveFile(SERVER, "7001")).resolves.toMatchObject({ ok: true, resolved: { episodeIds: [11, 12] } })
  })

  it("breaks a tie between files of the same name and folder by size", async () => {
    const twin = { ...SONARR_FILE, id: 503, path: "/tv/The Office (US)/Extras/Season 01/The Office S01E01.mkv", size: 99 }
    jest.mocked(listSonarrEpisodeFiles).mockResolvedValue({ success: true, data: [twin, SONARR_FILE] })

    await expect(resolveFile(SERVER, "7001")).resolves.toMatchObject({ ok: true, resolved: { file: { id: 501 } } })
  })

  it("goes to the server admin when files of the same name and folder can't be told apart", async () => {
    jest.mocked(listSonarrEpisodeFiles).mockResolvedValue({ success: true, data: [{ ...SONARR_FILE, id: 503, path: "/tv/Other/Season 01/The Office S01E01.mkv" }, SONARR_FILE] })

    await expect(resolveFile(SERVER, "7001")).resolves.toEqual({ ok: false, reason: "NO_FILE" })
  })

  it.each([
    ["it's a special in Plex", () => plexHas(SHOW, { ...EPISODE, seasonNumber: 0 }), "SPECIAL"],
    ["it's a special in Sonarr", () => jest.mocked(listSonarrEpisodes).mockResolvedValue({ success: true, data: [episode(11, { seasonNumber: 0 })] }), "SPECIAL"],
    ["one of the file's episodes isn't monitored", () => jest.mocked(listSonarrEpisodes).mockResolvedValue({ success: true, data: [episode(11, { monitored: false })] }), "UNMONITORED"],
    ["the series isn't monitored", () => jest.mocked(getSonarrSeriesState).mockResolvedValue({ success: true, data: { id: 42, monitored: false, qualityProfileId: 6 } }), "UNMONITORED"],
    ["no episode is in the file", () => jest.mocked(listSonarrEpisodes).mockResolvedValue({ success: true, data: [episode(11, { episodeFileId: 999 })] }), "NO_FILE"],
    ["Sonarr has no file of that name", () => jest.mocked(listSonarrEpisodeFiles).mockResolvedValue({ success: true, data: [] }), "NO_FILE"],
    ["the show can't be read", () => plexHas(EPISODE), "UNAVAILABLE"],
    ["Sonarr isn't set up", () => jest.mocked(getActiveService).mockResolvedValue(null), "NO_SONARR"],
    ["Sonarr doesn't have the show", () => jest.mocked(findSonarrSeries).mockResolvedValue({ success: true, data: null }), "NOT_IN_SONARR"],
    ["the episodes can't be read", () => jest.mocked(listSonarrEpisodes).mockResolvedValue({ success: false, error: "down" }), "UNAVAILABLE"],
    ["the series can't be read", () => jest.mocked(getSonarrSeriesState).mockResolvedValue({ success: false, error: "down" }), "UNAVAILABLE"],
  ])("goes to the server admin when %s", async (_case, arrange, reason) => {
    arrange()

    await expect(resolveFile(SERVER, "7001")).resolves.toEqual({ ok: false, reason })
  })
})
