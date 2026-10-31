/**
 * The Radarr tools answer about the movie asked for (GAP-07): history comes
 * from that movie's own route, the queue and calendar are filtered here, and
 * every list reply says how many records it shows. Each record is projected
 * to the fields an answer needs, so a reply stays under the 40,000 characters
 * a tool result may take, even on a large server.
 */

import { mockReset } from "jest-mock-extended"

import movieHistory from "@/lib/connections/__tests__/fixtures/arr/radarr-movie-history.json"
import queue from "@/lib/connections/__tests__/fixtures/arr/radarr-queue.json"
import calendar from "@/lib/connections/__tests__/fixtures/arr/radarr-calendar.json"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import type { Radarr } from "@/lib/generated/prisma/client"

import { executeRadarrTool } from "../radarr"
import { scrubForDiscord } from "../scrub"
import { withLocalInstants } from "../timestamps"
import { movieTitle, paged, qualityProfile, radarrHistory, radarrLookup, radarrMovie, radarrQueueItem, range, rootFolder, serveArr } from "./helpers/arr-large-server"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const radarrRow = { id: "radarr-1", name: "Radarr", url: "http://radarr.lan:7878", apiKey: "arr-key", publicUrl: null, isActive: true } as Radarr
const library = [
  { id: 22, title: "Heat 2", titleSlug: "1000001", tmdbId: 1000001 },
  { id: 9, title: "Heat", titleSlug: "949", tmdbId: 949 },
  { id: 14, title: "Dune: Part Two", titleSlug: "693134", tmdbId: 693134 },
]
let mockFetch: jest.Mock

function serve(routes: Record<string, unknown>) {
  mockFetch = serveArr(routes)
}

function paths(): string[] {
  return mockFetch.mock.calls.map(([url]) => new URL(String(url)).pathname)
}

function query(call: number): URLSearchParams {
  return new URL(String(mockFetch.mock.calls[call][0])).searchParams
}

async function run(toolName: string, args: Record<string, unknown> = {}) {
  return JSON.parse(await executeRadarrTool(toolName, args))
}

beforeEach(() => {
  mockReset(prismaMock)
  prismaMock.radarr.findFirst.mockResolvedValue(radarrRow)
})

afterEach(() => jest.restoreAllMocks())

describe("why didn't Heat download?", () => {
  it("returns only Heat's history, by its exact title, with the failure message and a flat quality", async () => {
    serve({ "/api/v3/movie": library, "/api/v3/history/movie": movieHistory })

    const output = await run("get_radarr_history", { movieName: "heat" })

    expect(paths()).toEqual(["/api/v3/movie", "/api/v3/history/movie"])
    expect(query(1).get("movieId")).toBe("9")
    expect(output.showing).toBe("showing 2 of 2")
    expect(output.records[0]).toEqual({
      date: "2027-01-12T21:04:11Z",
      eventType: "downloadFailed",
      sourceTitle: "Heat.1995.REMASTERED.1080p.BluRay.x264-AMIABLE",
      quality: "Bluray-1080p",
      message: "Import failed: not enough free space on /data/media/movies",
      indexer: "TorrentLeech (Prowlarr)",
      movieId: 9,
      movie: { title: "Heat", year: 1995 },
    })
  })

  it("filters the queue to a movie and says why its import is blocked", async () => {
    serve({ "/api/v3/movie": library, "/api/v3/queue": queue })

    const output = await run("get_radarr_queue", { movieName: "Dune" })

    expect(output.showing).toBe("showing 1 for this title, from the latest 2 of 2")
    expect(output.records).toEqual([
      {
        movieId: 14,
        movie: { title: "Dune: Part Two", year: 2024 },
        title: "Dune.Part.Two.2024.1080p.WEB-DL.DDP5.1.Atmos.H.264-FLUX",
        quality: "WEBDL-1080p",
        status: "completed",
        trackedDownloadStatus: "warning",
        trackedDownloadState: "importBlocked",
        size: 8589934592,
        sizeleft: 0,
        timeleft: "00:00:00",
        downloadClient: "qBittorrent",
        statusMessage:
          "One or more movies expected in this release were not imported or missing | Dune.Part.Two.2024.1080p.WEB-DL.DDP5.1.Atmos.H.264-FLUX.mkv: Not an upgrade for existing movie file. Existing quality: Bluray-1080p. New Quality WEBDL-1080p.",
      },
    ])
  })

  it("refuses a movieId it cannot read rather than answering for the whole server", async () => {
    serve({})

    expect(await executeRadarrTool("get_radarr_queue", { movieId: "fourteen" })).toBe("Error: 'movieId' must be a whole number of at least 1, or left out")
    expect(await executeRadarrTool("get_radarr_history", { movieId: 0 })).toBe("Error: 'movieId' must be a whole number of at least 1, or left out")
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("filters the calendar by movieId, with release dates as days", async () => {
    serve({ "/api/v3/calendar": calendar })

    const output = await run("get_radarr_calendar", { movieId: 14, startDate: "2027-01-14", endDate: "2027-01-21" })

    expect(query(0).get("start")).toBe("2027-01-14")
    expect(query(0).get("end")).toBe("2027-01-21")
    expect(output.showing).toBe("showing 1 for this title, from the 2 in the date range")
    expect(output.records).toEqual([
      {
        id: 14,
        title: "Dune: Part Two",
        year: 2024,
        tmdbId: 693134,
        status: "released",
        monitored: true,
        hasFile: false,
        isAvailable: true,
        minimumAvailability: "released",
        inCinemas: "2024-02-27",
        digitalRelease: "2027-01-16",
        physicalRelease: "2027-01-20",
      },
    ])
  })

  it("ends the calendar 7 days after its start when no end is given", async () => {
    serve({ "/api/v3/calendar": [] })

    await run("get_radarr_calendar", { startDate: "2027-01-28" })

    expect(query(0).get("end")).toBe("2027-02-04")
  })

  it("names a movie that is not in the library", async () => {
    serve({ "/api/v3/movie": library })

    expect(await run("get_radarr_queue", { movieName: "Collateral" })).toEqual({ error: 'Movie "Collateral" not found in Radarr library' })
  })
})

describe("in Discord", () => {
  it("keeps the queue's allowlisted fields, with why an import is blocked, and drops download ids, clients and paths", async () => {
    serve({ "/api/v3/queue": queue })

    const scrubbed = JSON.parse(scrubForDiscord("get_radarr_queue", await executeRadarrTool("get_radarr_queue", {}, "user-1", "discord")))

    expect(scrubbed.records[1]).toEqual({
      movie: { title: "Dune: Part Two" },
      title: "Dune.Part.Two.2024.1080p.WEB-DL.DDP5.1.Atmos.H.264-FLUX",
      quality: "WEBDL-1080p",
      status: "completed",
      trackedDownloadStatus: "warning",
      trackedDownloadState: "importBlocked",
      size: 8589934592,
      sizeleft: 0,
      timeleft: "00:00:00",
      statusMessage: expect.stringMatching(/^One or more movies expected in this release were not imported or missing \| Dune\..+\.mkv: Not an upgrade for existing movie file/),
    })
    expect(JSON.stringify(scrubbed)).not.toMatch(/qBittorrent|TorrentLeech|downloads|0123456789ABCDEF/)
  })

  it("cuts the paths a queue item's import warning names to the folder's own name", async () => {
    serve({ "/api/v3/queue": paged(range(8, radarrQueueItem)) })

    const scrubbed = JSON.parse(scrubForDiscord("get_radarr_queue", await executeRadarrTool("get_radarr_queue", {}, "user-1", "discord")))

    expect(scrubbed.records[4].statusMessage).toBe(`No files found are eligible for import in …/${scrubbed.records[4].title}`)
    expect(JSON.stringify(scrubbed)).not.toMatch(/\/data|downloads/)
  })

  it("keeps the history's event, release, quality and movie title", async () => {
    serve({ "/api/v3/history": paged(movieHistory) })

    const scrubbed = JSON.parse(scrubForDiscord("get_radarr_history", await executeRadarrTool("get_radarr_history", {})))

    expect(scrubbed.records[0]).toEqual({
      date: "2027-01-12T21:04:11Z",
      eventType: "downloadFailed",
      sourceTitle: "Heat.1995.REMASTERED.1080p.BluRay.x264-AMIABLE",
      quality: "Bluray-1080p",
      movie: { title: "Heat" },
    })
  })
})

describe("the library", () => {
  it("lists a page of movies sorted by title, with ids, file, quality and size", async () => {
    serve({ "/api/v3/movie": range(120, radarrMovie) })

    const output = await run("get_radarr_movies", { pageSize: 1000 })

    expect(output.showing).toBe("showing 75 of 120 movies, sorted by title (page 1 of 2); pass page 2 for the next 75, or pass search to find a title")
    expect(output.records[0]).toEqual({
      id: 2,
      title: movieTitle(1),
      year: 1991,
      titleSlug: "dr-strangelove-or-how-i-learned-to-stop-worrying-and-love-the-bomb-1-690001",
      tmdbId: 690001,
      imdbId: "tt15000001",
      status: "released",
      monitored: true,
      hasFile: true,
      quality: "WEBDL-2160p",
      sizeOnDisk: 64424509440,
      added: "2024-05-20T09:30:00Z",
      qualityProfileId: 2,
    })
    // A movie with no file has no quality
    const withoutFile = output.records.filter((movie: { hasFile: boolean }) => !movie.hasFile)
    expect(withoutFile.length).toBeGreaterThan(0)
    expect(withoutFile.map((movie: { quality?: string }) => movie.quality)).toEqual(withoutFile.map(() => undefined))
  })

  it("finds movies whose title contains the search", async () => {
    serve({ "/api/v3/movie": range(120, radarrMovie) })

    const output = await run("get_radarr_movies", { search: "SPIDER-VERSE 1" })

    expect(output.records.map((movie: { title: string }) => movie.title)).toEqual(
      [1, 10, 11, 12, 13, 14, 15, 16, 17].map((n) => `Spider-Man: Across the Spider-Verse ${n}`)
    )
    expect(output.showing).toBe('showing 9 of 9 movies whose title contains "SPIDER-VERSE 1", of 120 in the library')
  })

  it("drops images and keeps five alternate titles in a movie's details, with its file", async () => {
    serve({ "/api/v3/movie/2": radarrMovie(1) })

    const output = await run("get_radarr_movie_details", { movieId: 2 })

    expect(output.images).toBeUndefined()
    expect(output.alternateTitles.map((alternate: { title: string }) => alternate.title)).toEqual(range(5, (n) => `${movieTitle(1)} (alternate ${n})`))
    expect(output.alternateTitleCount).toBe(20)
    expect(output.movieFile.mediaInfo.videoDynamicRangeType).toBe("DV HDR10Plus")
  })
})

describe("search_radarr_movies", () => {
  it("returns ten projected results, marked in the library by TMDB id, never by title", async () => {
    const remake = { ...radarrLookup(0), tmdbId: 999 }
    serve({ "/api/v3/movie/lookup": [radarrLookup(1), remake, ...range(15, (i) => radarrLookup(i + 2))], "/api/v3/movie": [radarrMovie(0), radarrMovie(1)] })

    const output = await run("search_radarr_movies", { term: "strangelove" })

    expect(output.showing).toBe('showing 10 of 17 results for "strangelove"; use a more specific term, or tmdb:<tmdbId> or imdb:<imdbId> for one movie')
    expect(output.records[0]).toEqual({
      title: movieTitle(1),
      year: 1991,
      tmdbId: 690001,
      imdbId: "tt15000001",
      titleSlug: "dr-strangelove-or-how-i-learned-to-stop-worrying-and-love-the-bomb-1-690001",
      status: "released",
      studio: "Legendary Pictures",
      overview: expect.stringMatching(/^A long synopsis.{150,}…$/),
      radarrId: 2,
      inLibrary: true,
    })
    expect(output.records[1]).toMatchObject({ title: movieTitle(0), inLibrary: false })
    expect(output.records[1].radarrId).toBeUndefined()
  })

  it("asks for a term", async () => {
    expect(await executeRadarrTool("search_radarr_movies", { term: "  " })).toBe("Error: 'term' parameter is required and must be a string")
  })
})

describe("get_radarr_wanted_missing", () => {
  it("returns at most 50 missing movies", async () => {
    serve({ "/api/v3/wanted/missing": paged(range(150, radarrMovie), 5000) })

    const output = await run("get_radarr_wanted_missing", { pageSize: 500 })

    expect(output.records).toHaveLength(50)
    expect(output.showing).toBe("showing 50 of 5000; pass a movie (movieId or movieName)")
  })

  it("finds a movie among the latest 150, and says how to check one past them", async () => {
    serve({ "/api/v3/wanted/missing": paged(range(150, radarrMovie), 5000) })

    const found = await run("get_radarr_wanted_missing", { movieId: 2 })
    const past = await run("get_radarr_wanted_missing", { movieId: 2999 })

    expect(found.records.map((movie: { id: number }) => movie.id)).toEqual([2])
    expect(past.records).toEqual([])
    expect(past.showing).toBe(
      "showing 0 for this title, from the latest 150 of 5000; if it is not among them, check the movie itself with get_radarr_movie_details (monitored, hasFile, isAvailable)"
    )
  })

  it("needs no hint when the latest missing movies are all there are", async () => {
    serve({ "/api/v3/wanted/missing": paged(range(40, radarrMovie)) })

    expect((await run("get_radarr_wanted_missing", { movieId: 2 })).showing).toBe("showing 1 for this title, from the latest 40 of 40")
  })
})

describe("configuration", () => {
  it("gives quality profiles as their cutoff and allowed qualities", async () => {
    serve({ "/api/v3/qualityProfile": [qualityProfile(1)] })

    expect(await run("get_radarr_quality_profiles")).toEqual([
      { id: 2, name: "Profile 2 for 4K HDR and 1080p fallbacks", upgradeAllowed: true, cutoff: "WEB 1080p", allowed: ["HDTV-1080p", "WEB 1080p (WEBDL-1080p, WEBRip-1080p)", "Bluray-1080p"] },
    ])
  })

  it("counts a root folder's unmapped folders instead of listing them", async () => {
    serve({ "/api/v3/rootFolder": [rootFolder(1)] })

    expect(await run("get_radarr_root_folders")).toEqual([{ id: 2, path: "/data/media/root-2/", accessible: true, freeSpace: 4398046511104, unmappedFolderCount: 3000 }])
  })
})

describe("on a large server (3,000 movies, long titles), every reply fits in a tool result", () => {
  const LIMIT = 40_000
  const movies = range(3000, radarrMovie)

  /** The output, and the same with the zone offsets the dispatcher adds, both within the limit. */
  async function fits(toolName: string, args: Record<string, unknown> = {}) {
    const output = await executeRadarrTool(toolName, args)
    expect(output.length).toBeLessThanOrEqual(LIMIT)
    expect(withLocalInstants(output, "Asia/Kolkata").length).toBeLessThanOrEqual(LIMIT)
    return JSON.parse(output)
  }

  it.each([
    [{}, 50],
    [{ page: 40, pageSize: 1000 }, 75],
    [{ search: "the" }, 50],
  ])("get_radarr_movies %j", async (args, count) => {
    serve({ "/api/v3/movie": movies })
    expect((await fits("get_radarr_movies", args)).records).toHaveLength(count)
  })

  it.each([
    [{}, 20],
    [{ pageSize: 1000 }, 50],
    [{ movieId: 1, pageSize: 1000 }, 50],
  ])("get_radarr_history %j", async (args, count) => {
    serve({ "/api/v3/history": paged(range(150, radarrHistory), 25000), "/api/v3/history/movie": range(400, radarrHistory) })
    expect((await fits("get_radarr_history", args)).records).toHaveLength(count)
  })

  it.each([{}, { movieId: 1 }])("get_radarr_queue %j", async (args) => {
    serve({ "/api/v3/queue": paged(range(150, (i) => ({ ...radarrQueueItem(i), movieId: 1 })), 400) })
    expect((await fits("get_radarr_queue", args)).records).toHaveLength(50)
  })

  it.each([{}, { movieId: 1 }])("get_radarr_calendar %j", async (args) => {
    serve({ "/api/v3/calendar": range(300, (i) => ({ ...radarrMovie(i), id: 1 })) })
    expect((await fits("get_radarr_calendar", args)).records).toHaveLength(100)
  })

  it.each([
    [{}, 20],
    [{ pageSize: 1000 }, 50],
  ])("get_radarr_wanted_missing %j", async (args, count) => {
    serve({ "/api/v3/wanted/missing": paged(range(150, (i) => ({ ...radarrMovie(i), id: 1 })), 5000) })
    expect((await fits("get_radarr_wanted_missing", args)).records).toHaveLength(count)
  })

  it("get_radarr_wanted_missing for a movie, with every one of the latest 150 its own", async () => {
    serve({ "/api/v3/wanted/missing": paged(range(150, (i) => ({ ...radarrMovie(i), id: 1 })), 5000) })
    expect((await fits("get_radarr_wanted_missing", { movieId: 1, pageSize: 1000 })).records.length).toBeGreaterThan(50)
  })

  it("search_radarr_movies", async () => {
    serve({ "/api/v3/movie/lookup": range(50, radarrLookup), "/api/v3/movie": movies })
    expect((await fits("search_radarr_movies", { term: "the" })).records).toHaveLength(10)
  })

  it("get_radarr_movie_details", async () => {
    serve({ "/api/v3/movie/1": { ...radarrMovie(0), alternateTitles: range(80, (n) => ({ sourceType: "tmdb", title: `Alternate title number ${n}` })) } })
    expect((await fits("get_radarr_movie_details", { movieId: 1 })).alternateTitleCount).toBe(80)
  })

  it("get_radarr_status, get_radarr_quality_profiles and get_radarr_root_folders", async () => {
    serve({
      "/api/v3/system/status": { appName: "Radarr", version: "5.14.0.9383", startupPath: "/app/radarr/bin", appData: "/config", osName: "ubuntu", isDocker: true },
      "/api/v3/queue": paged(range(1, radarrQueueItem), 400),
      "/api/v3/health": range(30, (i) => ({ source: "IndexerStatusCheck", type: "warning", message: `Indexers unavailable due to failures: indexer ${i}`, wikiUrl: "https://wiki.servarr.com/radarr/system#indexers-are-unavailable-due-to-failures" })),
      "/api/v3/diskspace": range(40, (i) => ({ path: `/data/mount-${i}`, label: `mount-${i}`, freeSpace: 4398046511104, totalSpace: 8796093022208 })),
      "/api/v3/qualityProfile": range(15, qualityProfile),
      "/api/v3/rootFolder": range(4, rootFolder),
    })
    expect((await fits("get_radarr_status")).queue).toEqual({ totalRecords: 400 })
    expect(await fits("get_radarr_quality_profiles")).toHaveLength(15)
    expect(await fits("get_radarr_root_folders")).toHaveLength(4)
  })
})
