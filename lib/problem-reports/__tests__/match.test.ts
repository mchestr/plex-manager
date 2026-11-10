/**
 * Checking Plex's match against Radarr and Sonarr for the same file: agreed
 * when Plex's ids lead to the file (and, for an episode, Sonarr's numbers
 * include Plex's); found by folder, and differing, when they lead elsewhere;
 * and unknown otherwise.
 */

import { listRadarrMovieFiles, listSonarrSeriesFolders } from "@/lib/connections/arr-titles"
import { getPlexItemMetadata, type PlexItemMetadata } from "@/lib/connections/plex"
import { listSonarrEpisodeFiles, listSonarrEpisodes } from "@/lib/connections/sonarr-episodes"
import { getActiveService } from "@/lib/data/active-service"
import { checkMatch, idsFit } from "@/lib/problem-reports/match"
import { resolveFile, type ResolvedFile } from "@/lib/problem-reports/resolve"

jest.mock("@/lib/connections/arr-titles", () => ({ listRadarrMovieFiles: jest.fn(), listSonarrSeriesFolders: jest.fn() }))
jest.mock("@/lib/connections/plex", () => ({ getPlexItemMetadata: jest.fn() }))
jest.mock("@/lib/connections/sonarr-episodes", () => ({ listSonarrEpisodeFiles: jest.fn(), listSonarrEpisodes: jest.fn() }))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))
jest.mock("@/lib/problem-reports/resolve", () => ({ ...jest.requireActual("@/lib/problem-reports/resolve"), resolveFile: jest.fn() }))

const SERVER = { url: "http://plex.local:32400", token: "owner-token" }
const RADARR = { name: "Radarr", url: "http://radarr.local:7878", apiKey: "radarr-key" }
const SONARR = { name: "Sonarr", url: "http://sonarr.local:8989", apiKey: "sonarr-key" }
const version = (file: string) => ({ optimized: false, parts: [{ file, size: 4200 }] })

const MOVIE: PlexItemMetadata = {
  ratingKey: "555",
  type: "movie",
  title: "Heat",
  year: 1995,
  guid: "plex://movie/wrong",
  ids: { tmdb: 11111 },
  librarySectionId: "1",
  media: [version("/data/movies/Heat (1995)/Heat (1995).mkv")],
  locations: [],
}
const SHOW: PlexItemMetadata = { ratingKey: "6999", type: "show", title: "The Office", guid: "plex://show/office", ids: { tvdb: 73244 }, librarySectionId: "2", media: [], locations: ["/data/tv/The Office (US)"] }
const EPISODE: PlexItemMetadata = {
  ratingKey: "7001",
  type: "episode",
  title: "Pilot",
  ids: {},
  librarySectionId: "2",
  grandparentRatingKey: "6999",
  seasonNumber: 1,
  episodeNumber: 1,
  media: [version("/data/tv/The Office (US)/Season 01/The Office S01E01.mkv")],
  locations: [],
}
const FILE = { id: 77, relativePath: "Heat (1995).mkv", path: null, size: 4200, qualityCutoffNotMet: false, customFormatScore: 0, sceneName: null, quality: null, languages: [] }
const RESOLVED_EPISODE: ResolvedFile = {
  service: "sonarr",
  config: SONARR,
  titleId: 42,
  qualityProfileId: 6,
  file: { ...FILE, id: 501 },
  episodeIds: [11],
  plex: { ratingKey: "7001", guid: null, sectionId: "2", file: "/data/tv/x.mkv", folder: "/data/tv" },
}
const episode = (id: number, seasonNumber: number, episodeNumber: number) => ({ id, seasonNumber, episodeNumber, airDateUtc: null, monitored: true, hasFile: true, episodeFileId: 501 })

function plexHas(...items: PlexItemMetadata[]) {
  jest.mocked(getPlexItemMetadata).mockImplementation(async (_server, ratingKey) => {
    const item = items.find((candidate) => candidate.ratingKey === ratingKey)
    return item ? { status: "found", item } : { status: "missing" }
  })
}

beforeEach(() => {
  jest.resetAllMocks()
  plexHas(MOVIE, SHOW, EPISODE)
  jest.mocked(getActiveService).mockImplementation((async (kind: string) => (kind === "radarr" ? RADARR : SONARR)) as never)
  jest.mocked(resolveFile).mockResolvedValue({ ok: false, reason: "NOT_IN_RADARR" })
  jest.mocked(listRadarrMovieFiles).mockResolvedValue({
    success: true,
    data: [
      { id: 4, tmdbId: 1, imdbId: null, title: "Other", year: 2001, path: "/movies/Other (2001)", file: { ...FILE, id: 70, relativePath: "Other (2001).mkv" } },
      { id: 5, tmdbId: 949, imdbId: "tt0113277", title: "Heat", year: 1995, path: "/movies/Heat (1995)", file: FILE },
    ],
  })
  jest.mocked(listSonarrSeriesFolders).mockResolvedValue({
    success: true,
    data: [
      { id: 41, tvdbId: 1, title: "The Office (UK)", year: 2001, path: "/tv/The Office (UK)" },
      { id: 42, tvdbId: 73244, title: "The Office (US)", year: 2005, path: "/tv/The Office (US)" },
    ],
  })
  jest.mocked(listSonarrEpisodeFiles).mockResolvedValue({ success: true, data: [{ ...FILE, id: 501, path: "/tv/The Office (US)/Season 01/The Office S01E01.mkv" }] })
  jest.mocked(listSonarrEpisodes).mockResolvedValue({ success: true, data: [episode(11, 1, 1)] })
})

describe("checkMatch: a movie", () => {
  it("agrees when Plex's ids lead to the file", async () => {
    jest.mocked(resolveFile).mockResolvedValue({ ok: true, resolved: { ...RESOLVED_EPISODE, service: "radarr", config: RADARR, episodeIds: [] } })

    await expect(checkMatch(SERVER, "555")).resolves.toEqual({ verdict: "AGREES" })
    expect(listRadarrMovieFiles).not.toHaveBeenCalled()
  })

  it("finds the movie whose file it is by folder, and says Plex has another title", async () => {
    await expect(checkMatch(SERVER, "555")).resolves.toEqual({
      verdict: "DIFFERS",
      target: { ratingKey: "555", sectionId: "1", type: "movie", guid: "plex://movie/wrong", title: "Heat" },
      expected: { ids: { tmdb: 949, imdb: "tt0113277" }, title: "Heat", year: 1995 },
    })
    expect(listRadarrMovieFiles).toHaveBeenCalledWith(RADARR)
  })

  it("agrees when the movie found by folder has Plex's ids after all", async () => {
    plexHas({ ...MOVIE, ids: { imdb: "tt0113277" } })

    await expect(checkMatch(SERVER, "555")).resolves.toEqual({ verdict: "AGREES" })
  })

  it("can't tell when no movie has the file, or Radarr can't be read or isn't set up", async () => {
    jest.mocked(listRadarrMovieFiles).mockResolvedValueOnce({ success: true, data: [] }).mockResolvedValueOnce({ success: false, error: "down" })

    await expect(checkMatch(SERVER, "555")).resolves.toEqual({ verdict: "UNKNOWN", reason: "NOT_IN_RADARR" })
    await expect(checkMatch(SERVER, "555")).resolves.toEqual({ verdict: "UNKNOWN", reason: "UNAVAILABLE" })
    jest.mocked(getActiveService).mockResolvedValue(null)
    await expect(checkMatch(SERVER, "555")).resolves.toEqual({ verdict: "UNKNOWN", reason: "NO_RADARR" })
  })

  it("can't tell when resolving fails for another reason than Plex's ids", async () => {
    jest.mocked(resolveFile).mockResolvedValue({ ok: false, reason: "SEVERAL_VERSIONS" })

    await expect(checkMatch(SERVER, "555")).resolves.toEqual({ verdict: "UNKNOWN", reason: "SEVERAL_VERSIONS" })
    expect(listRadarrMovieFiles).not.toHaveBeenCalled()
  })

  it("can't tell for an item Plex doesn't have, or can't read", async () => {
    jest.mocked(getPlexItemMetadata).mockResolvedValueOnce({ status: "missing" }).mockResolvedValueOnce({ status: "unknown" })

    await expect(checkMatch(SERVER, "555")).resolves.toEqual({ verdict: "UNKNOWN", reason: "NO_FILE" })
    await expect(checkMatch(SERVER, "555")).resolves.toEqual({ verdict: "UNKNOWN", reason: "UNAVAILABLE" })
  })
})

describe("checkMatch: an episode", () => {
  it("agrees when the show's ids lead to the file and Sonarr numbers it as Plex does", async () => {
    jest.mocked(resolveFile).mockResolvedValue({ ok: true, resolved: RESOLVED_EPISODE })

    await expect(checkMatch(SERVER, "7001")).resolves.toEqual({ verdict: "AGREES" })
    expect(listSonarrEpisodes).toHaveBeenCalledWith(SONARR, 42)
  })

  it("says it's the episode order when Sonarr numbers the file's episode differently", async () => {
    jest.mocked(resolveFile).mockResolvedValue({ ok: true, resolved: RESOLVED_EPISODE })
    jest.mocked(listSonarrEpisodes).mockResolvedValue({ success: true, data: [episode(11, 1, 2)] })

    await expect(checkMatch(SERVER, "7001")).resolves.toEqual({ verdict: "UNKNOWN", reason: "EPISODE_ORDER" })
  })

  it("finds the series whose folder holds the file, and says the show has another match", async () => {
    plexHas({ ...SHOW, ids: { tvdb: 1 } }, EPISODE)
    jest.mocked(resolveFile).mockResolvedValue({ ok: false, reason: "NO_FILE" })

    await expect(checkMatch(SERVER, "7001")).resolves.toEqual({
      verdict: "DIFFERS",
      target: { ratingKey: "6999", sectionId: "2", type: "show", guid: "plex://show/office", title: "The Office" },
      expected: { ids: { tvdb: 73244 }, title: "The Office (US)", year: 2005 },
    })
    expect(listSonarrEpisodeFiles).toHaveBeenCalledWith(SONARR, 42)
    expect(listSonarrEpisodeFiles).toHaveBeenCalledTimes(1)
  })

  it("can't tell for a special, or when no series' folder holds the file", async () => {
    plexHas(SHOW, { ...EPISODE, seasonNumber: 0 })
    jest.mocked(resolveFile).mockResolvedValue({ ok: false, reason: "NOT_IN_SONARR" })
    await expect(checkMatch(SERVER, "7001")).resolves.toEqual({ verdict: "UNKNOWN", reason: "SPECIAL" })

    plexHas(SHOW, EPISODE)
    jest.mocked(listSonarrEpisodeFiles).mockResolvedValue({ success: true, data: [] })
    await expect(checkMatch(SERVER, "7001")).resolves.toEqual({ verdict: "UNKNOWN", reason: "NOT_IN_SONARR" })
  })
})

describe("checkMatch: a show", () => {
  it("finds the series by the show's folder and compares the TVDB ids", async () => {
    await expect(checkMatch(SERVER, "6999")).resolves.toEqual({ verdict: "AGREES" })

    plexHas({ ...SHOW, ids: {}, guid: "local://6999" })
    await expect(checkMatch(SERVER, "6999")).resolves.toMatchObject({ verdict: "DIFFERS", target: { ratingKey: "6999", guid: "local://6999" }, expected: { ids: { tvdb: 73244 } } })
    expect(resolveFile).not.toHaveBeenCalled()
  })

  it("can't tell when no series has one of the show's folders", async () => {
    plexHas({ ...SHOW, locations: ["/data/tv/Unknown Show"] })

    await expect(checkMatch(SERVER, "6999")).resolves.toEqual({ verdict: "UNKNOWN", reason: "NOT_IN_SONARR" })
  })
})

describe("idsFit", () => {
  it("compares a movie by TMDB id, or by IMDb id when Plex has no TMDB id, and a show by TVDB id", () => {
    expect(idsFit({ tmdb: 949 }, { tmdb: 949, imdb: null })).toBe(true)
    expect(idsFit({ tmdb: 1, imdb: "tt0113277" }, { tmdb: 949, imdb: "tt0113277" })).toBe(false)
    expect(idsFit({ imdb: "tt0113277" }, { tmdb: 949, imdb: "tt0113277" })).toBe(true)
    expect(idsFit({}, { tmdb: 949, imdb: null })).toBe(false)
    expect(idsFit({ tvdb: 73244 }, { tvdb: 73244 })).toBe(true)
  })
})
