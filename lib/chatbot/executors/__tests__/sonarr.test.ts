/**
 * The Sonarr tools answer about the series asked for (GAP-07): history comes
 * from that series' own route, the queue and calendar are filtered here, and
 * every list reply says how many records it shows. Each record is projected
 * to the fields an answer needs, so a reply stays under the 40,000 characters
 * a tool result may take, even on a large server.
 */

import { mockReset } from "jest-mock-extended"

import seriesHistory from "@/lib/connections/__tests__/fixtures/arr/sonarr-series-history.json"
import queue from "@/lib/connections/__tests__/fixtures/arr/sonarr-queue.json"
import calendar from "@/lib/connections/__tests__/fixtures/arr/sonarr-calendar.json"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import type { Sonarr } from "@/lib/generated/prisma/client"

import { executeSonarrTool } from "../sonarr"
import { scrubForDiscord } from "../scrub"
import { withLocalInstants } from "../timestamps"
import { paged, qualityProfile, range, rootFolder, serveArr, showTitle, sonarrEpisode, sonarrHistory, sonarrLookup, sonarrQueueItem, sonarrSeries } from "./helpers/arr-large-server"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const sonarrRow = { id: "sonarr-1", name: "Sonarr", url: "http://sonarr.lan:8989", apiKey: "arr-key", publicUrl: null, isActive: true } as Sonarr
const library = [
  { id: 12, title: "Severance", titleSlug: "severance", tvdbId: 371980 },
  { id: 31, title: "Slow Horses", titleSlug: "slow-horses", tvdbId: 377998 },
]
let mockFetch: jest.Mock

/** Answers by path, like a Sonarr server with the fixtures. */
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
  return JSON.parse(await executeSonarrTool(toolName, args))
}

beforeEach(() => {
  mockReset(prismaMock)
  prismaMock.sonarr.findFirst.mockResolvedValue(sonarrRow)
})

afterEach(() => jest.restoreAllMocks())

describe("why didn't Severance download?", () => {
  it("returns only Severance's history, with titles, and says how many were shown", async () => {
    serve({ "/api/v3/series": library, "/api/v3/history/series": seriesHistory })

    const output = await run("get_sonarr_history", { seriesName: "severance" })

    expect(paths()).toEqual(["/api/v3/series", "/api/v3/history/series"])
    expect(query(1).get("seriesId")).toBe("12")
    expect(output.showing).toBe("showing 2 of 2")
    expect(output.records.map((record: { series: { title: string } }) => record.series.title)).toEqual(["Severance", "Severance"])
    expect(output.records[0].episode.title).toBe("Cold Harbor")
  })

  it("gives each history record its event, release, quality name, ids and failure message", async () => {
    serve({ "/api/v3/series": library, "/api/v3/history/series": seriesHistory })

    const output = await run("get_sonarr_history", { seriesName: "severance" })

    expect(output.records[0]).toEqual({
      date: "2027-01-12T21:04:11Z",
      eventType: "downloadFailed",
      sourceTitle: "Severance.S02E10.1080p.WEB.H264",
      quality: "WEBDL-1080p",
      message: "Import failed, path does not exist or is not accessible by Sonarr",
      seriesId: 12,
      episodeId: 4410,
      series: { title: "Severance" },
      episode: { title: "Cold Harbor", seasonNumber: 2, episodeNumber: 10 },
    })
  })

  it("filters the queue to Severance, reading up to the cap", async () => {
    serve({ "/api/v3/series": library, "/api/v3/queue": queue })

    const output = await run("get_sonarr_queue", { seriesName: "Severance" })

    expect(query(1).get("pageSize")).toBe("50")
    expect(output.records).toHaveLength(1)
    expect(output.records[0].series.title).toBe("Severance")
    expect(output.showing).toBe("showing 1 for this title, from the latest 2 of 2")
  })

  it("filters the calendar by seriesId without a library lookup", async () => {
    serve({ "/api/v3/calendar": calendar })

    const output = await run("get_sonarr_calendar", { seriesId: 31 })

    expect(paths()).toEqual(["/api/v3/calendar"])
    expect(output.records.map((episode: { seriesId: number }) => episode.seriesId)).toEqual([31])
    expect(output.records[0]).toEqual({
      id: 5122,
      seriesId: 31,
      series: { title: "Slow Horses" },
      seasonNumber: 4,
      episodeNumber: 8,
      title: "Episode 8",
      airDateUtc: "2027-01-17T02:00:00Z",
      hasFile: false,
      monitored: true,
    })
  })

  it("says why a season pack's import is blocked: the summary, then each file and its errors", async () => {
    // Sonarr's CompletedDownloadService: a summary with no messages, then one entry per file not imported
    const blocked = {
      ...queue.records[0],
      title: "Severance.S02.1080p.WEB.H264",
      trackedDownloadStatus: "warning",
      trackedDownloadState: "importBlocked",
      downloadClient: "SABnzbd",
      added: "2027-01-12T20:00:00Z",
      statusMessages: [
        { title: "One or more episodes expected in this release were not imported or missing from the release", messages: [] },
        { title: "Severance.S02E09.1080p.WEB.H264.mkv", messages: ["Not an upgrade for existing episode file(s). Existing quality: WEBDL-1080p. New Quality WEBDL-1080p."] },
      ],
    }
    serve({ "/api/v3/queue": { ...queue, totalRecords: 1, records: [blocked] } })

    const [item] = (await run("get_sonarr_queue", { seriesId: 12 })).records

    expect(item).toMatchObject({ trackedDownloadState: "importBlocked", downloadClient: "SABnzbd", added: "2027-01-12T20:00:00Z" })
    expect(item.statusMessage).toBe(
      "One or more episodes expected in this release were not imported or missing from the release | Severance.S02E09.1080p.WEB.H264.mkv: Not an upgrade for existing episode file(s). Existing quality: WEBDL-1080p. New Quality WEBDL-1080p."
    )
  })

  it("names a series that is not in the library", async () => {
    serve({ "/api/v3/series": library })

    expect(await run("get_sonarr_history", { seriesName: "Andor" })).toEqual({ error: 'Series "Andor" not found in Sonarr library' })
  })

  it("refuses an id it cannot read rather than answering for the whole server", async () => {
    serve({})

    for (const [toolName, args, error] of [
      ["get_sonarr_queue", { seriesId: 0 }, "Error: 'seriesId' must be a whole number of at least 1, or left out"],
      ["get_sonarr_wanted_missing", { seriesId: 1.5 }, "Error: 'seriesId' must be a whole number of at least 1, or left out"],
      ["get_sonarr_history", { episodeId: -4 }, "Error: 'episodeId' must be a whole number of at least 1, or left out"],
      ["get_sonarr_episodes", { seriesId: 12, seasonNumber: "two" }, "Error: 'seasonNumber' must be a whole number of at least 0, or left out"],
      ["get_sonarr_calendar", { seriesName: { title: "Severance" } }, "Error: 'seriesName' must be text, or left out"],
      ["get_sonarr_queue", { seasonNumber: 2 }, "Error: 'seasonNumber' needs a series (seriesId or seriesName)"],
    ] as const) {
      expect(await executeSonarrTool(toolName, args)).toBe(error)
    }
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("falls back on seriesName when the seriesId cannot be read, and reads a number as a title", async () => {
    serve({ "/api/v3/series": [...library, { id: 40, title: "1883" }], "/api/v3/history/series": [] })

    await run("get_sonarr_history", { seriesId: 0, seriesName: "Severance" })
    await run("get_sonarr_history", { seriesName: 1883 })

    expect([query(1).get("seriesId"), query(3).get("seriesId")]).toEqual(["12", "40"])
  })

  it("picks the series whose title is the name over one that only contains it", async () => {
    serve({ "/api/v3/series": [{ id: 7, title: "The Office Christmas Special" }, { id: 8, title: "The Office" }], "/api/v3/history/series": [] })

    await run("get_sonarr_history", { seriesName: "the office" })

    expect(query(1).get("seriesId")).toBe("8")
  })
})

it("reports the whole queue's total in the status tool", async () => {
  serve({
    "/api/v3/system/status": { version: "4.0.10" },
    "/api/v3/queue": { ...queue, totalRecords: 64, records: queue.records.slice(0, 1) },
    "/api/v3/health": [],
    "/api/v3/diskspace": [],
  })

  const output = await run("get_sonarr_status")

  expect(output.queue).toEqual({ totalRecords: 64 })
})

describe("in Discord", () => {
  it("keeps the queue's allowlisted fields, with why an import is blocked, and drops download paths, clients and ids", async () => {
    serve({ "/api/v3/queue": paged(range(8, sonarrQueueItem)) })

    const scrubbed = JSON.parse(scrubForDiscord("get_sonarr_queue", await executeSonarrTool("get_sonarr_queue", {}, "user-1", "discord")))

    expect(scrubbed.showing).toBe("showing 8 of 8")
    expect(scrubbed.records[0]).toEqual({
      series: { title: showTitle(0) },
      episode: { title: "An Episode Title That Runs Long, Part 1", seasonNumber: 1, episodeNumber: 1 },
      title: expect.stringContaining("S01E1.2160p"),
      quality: "WEBDL-2160p",
      status: "downloading",
      trackedDownloadStatus: "warning",
      trackedDownloadState: "importBlocked",
      size: 5368709120,
      sizeleft: 2147483648,
      timeleft: "00:12:30",
      estimatedCompletionTime: "2026-10-31T15:12:30Z",
      errorMessage: "The download is stalled with no connections",
      statusMessage: expect.stringMatching(/^One or more episodes expected in this release were not imported or missing from the release \| The\.Lord\.of\.the\.Rings\.\S+S01E1\.\S+\.mkv: Not an upgrade/),
    })
    // A warning that names the download's folder keeps only the folder's own name
    expect(scrubbed.records[4].statusMessage).toBe(`No files found are eligible for import in …/${scrubbed.records[4].title}`)
    expect(JSON.stringify(scrubbed)).not.toMatch(/downloads|SABnzbd|NZBgeek|seriesId|added/)
  })

  it("leaves the paths whole outside Discord", async () => {
    serve({ "/api/v3/queue": paged(range(8, sonarrQueueItem)) })

    const { records } = await run("get_sonarr_queue")

    expect(records[4].statusMessage).toBe(`No files found are eligible for import in /data/downloads/complete/tv/${records[4].title}`)
    expect(records[4]).toMatchObject({ downloadClient: "SABnzbd", added: "2026-10-31T14:00:00Z" })
  })

  it("keeps the history's event, release, quality, series and episode, and why a download failed without its path", async () => {
    serve({ "/api/v3/history": paged(range(3, sonarrHistory)) })

    const scrubbed = JSON.parse(scrubForDiscord("get_sonarr_history", await executeSonarrTool("get_sonarr_history", {}, "user-1", "discord")))

    expect(scrubbed.records[0]).toEqual({
      date: "2026-10-30T21:04:11Z",
      eventType: "downloadFailed",
      sourceTitle: expect.stringContaining("S01E1"),
      quality: "WEBDL-2160p",
      message: "Import failed, path does not exist or is not accessible by Sonarr: …/release",
      series: { title: showTitle(0) },
      episode: { title: "An Episode Title That Runs Long, Part 1", seasonNumber: 1, episodeNumber: 1 },
    })
    expect(JSON.stringify(scrubbed)).not.toMatch(/\/data|downloads\/|NZBgeek|SABnzbd|seriesId|episodeId/)
  })

  it("keeps the history's path whole outside Discord", async () => {
    serve({ "/api/v3/history": paged(range(3, sonarrHistory)) })

    const { records } = await run("get_sonarr_history")

    expect(records[0]).toMatchObject({ message: "Import failed, path does not exist or is not accessible by Sonarr: /data/downloads/complete/tv/release", indexer: "NZBgeek (Prowlarr)" })
  })

  it("offers a seriesName to narrow the history, never an id no Discord tool gives", async () => {
    serve({ "/api/v3/history": paged(range(150, sonarrHistory), 25000), "/api/v3/history/series": range(340, sonarrHistory) })

    const discord = async (args: Record<string, unknown>) => JSON.parse(await executeSonarrTool("get_sonarr_history", args, "user-1", "discord")).showing

    expect(await discord({})).toBe("showing 20 of 25000; pass a pageSize up to 50, or pass a seriesName")
    expect(await discord({ seriesId: 1 })).toBe("showing 20 of 340; pass a pageSize up to 50")
    expect(await discord({ seriesId: 1, pageSize: 50 })).toBe("showing 50 of 340")
  })

  it("offers a seriesName to narrow the queue", async () => {
    serve({ "/api/v3/queue": paged(range(50, sonarrQueueItem), 400) })

    const output = JSON.parse(await executeSonarrTool("get_sonarr_queue", {}, "user-1", "discord"))

    expect(output.showing).toBe("showing 50 of 400; pass a seriesName to see only its items")
  })

  it("cuts a queue item's own folder out of its messages, whatever its names hold", async () => {
    const outputPath = "C:\\Users\\J. R. Smith\\Downloads\\complete\\Severance.S02E10"
    const item = sonarrQueueItem(4)
    const stuck = {
      ...item,
      outputPath,
      statusMessages: [{ title: item.title, messages: [`Import failed, path does not exist or is not accessible by Sonarr: ${outputPath}. Ensure the path exists`] }],
      errorMessage: `Unpacking failed, write error in ${outputPath}`,
    }
    serve({ "/api/v3/queue": paged([stuck]) })

    const scrubbed = JSON.parse(scrubForDiscord("get_sonarr_queue", await executeSonarrTool("get_sonarr_queue", {}, "user-1", "discord")))

    expect(scrubbed.records[0]).toMatchObject({
      statusMessage: "Import failed, path does not exist or is not accessible by Sonarr: …/Severance.S02E10. Ensure the path exists",
      errorMessage: "Unpacking failed, write error in …/Severance.S02E10",
    })
    expect(JSON.stringify(scrubbed)).not.toMatch(/Smith|Users|outputPath/)
  })

  it("cuts the paths in the status tool's health messages, which every member may read", async () => {
    serve({
      "/api/v3/system/status": { appName: "Sonarr", version: "4.0.10" },
      "/api/v3/queue": paged([], 0),
      "/api/v3/health": [{ source: "RemotePathMappingCheck", type: "error", message: "Remote download client SABnzbd places downloads in /home/jane doe/downloads/complete but this directory does not appear to exist" }],
      "/api/v3/diskspace": [],
    })

    const scrubbed = JSON.parse(scrubForDiscord("get_sonarr_status", await executeSonarrTool("get_sonarr_status", {}, "user-1", "discord")))
    const admin = await run("get_sonarr_status")

    expect(scrubbed.health[0].message).toBe("Remote download client SABnzbd places downloads in …/complete but this directory does not appear to exist")
    expect(admin.health[0].message).toContain("/home/jane doe/downloads/complete")
  })
})

describe("the library", () => {
  it("lists a page of series sorted by title, with ids, type, network, counts and size", async () => {
    serve({ "/api/v3/series": range(120, sonarrSeries) })

    const output = await run("get_sonarr_series")

    expect(output.showing).toBe("showing 50 of 120 series, sorted by title (page 1 of 3); pass page 2 for the next 50, or pass search to find a title")
    expect(output.totalRecords).toBe(120)
    expect(output.records[0]).toEqual({
      id: 7,
      title: "Avatar: The Last Airbender 1",
      year: 2016,
      titleSlug: "avatar-the-last-airbender-1",
      tvdbId: 300006,
      tmdbId: 60006,
      status: "ended",
      seriesType: "standard",
      network: "Prime Video",
      monitored: true,
      seasonCount: 8,
      episodeFileCount: 76,
      episodeCount: 80,
      sizeOnDisk: 171798691840,
      added: "2023-05-01T12:34:56.1234567Z",
      qualityProfileId: 3,
    })
  })

  it("finds series whose title contains the search, ignoring case and punctuation", async () => {
    serve({ "/api/v3/series": range(120, sonarrSeries) })

    const output = await run("get_sonarr_series", { search: "agents of shield 1" })

    expect(output.records.map((series: { title: string }) => series.title)).toEqual(["Marvel's Agents of S.H.I.E.L.D. 1", "Marvel's Agents of S.H.I.E.L.D. 10", "Marvel's Agents of S.H.I.E.L.D. 11", "Marvel's Agents of S.H.I.E.L.D. 12"])
    expect(output.showing).toBe('showing 4 of 4 series whose title contains "agents of shield 1", of 120 in the library')
  })

  it("says which pages exist when asked for one past the end", async () => {
    serve({ "/api/v3/series": range(120, sonarrSeries) })

    const output = await run("get_sonarr_series", { page: 9, pageSize: "40" })

    expect(output.records).toEqual([])
    expect(output.showing).toBe("showing 0 of 120 series, sorted by title (page 9 of 3); pass a page from 1 to 3")
  })

  it("holds at most 75 series a page", async () => {
    serve({ "/api/v3/series": range(120, sonarrSeries) })

    expect((await run("get_sonarr_series", { pageSize: 100 })).showing).toBe(
      "showing 75 of 120 series, sorted by title (page 1 of 2); pass page 2 for the next 75, or pass search to find a title"
    )
  })

  it("drops images and keeps five alternate titles in a series' details", async () => {
    const series = { ...sonarrSeries(0), alternateTitles: range(9, (n) => ({ title: `Alias ${n}`, seasonNumber: -1 })) }
    serve({ "/api/v3/series/1": series })

    const output = await run("get_sonarr_series_details", { seriesId: "1" })

    expect(output.images).toBeUndefined()
    expect(output.alternateTitles).toEqual(range(5, (n) => ({ title: `Alias ${n}`, seasonNumber: -1 })))
    expect(output.alternateTitleCount).toBe(9)
    expect(output.seasons).toHaveLength(8)
    expect(output.path).toBe("/data/media/tv/The Lord of the Rings: The Rings of Power 1")
  })

  it("asks for a seriesId it can read", async () => {
    expect(await executeSonarrTool("get_sonarr_series_details", { seriesId: "twelve" })).toBe("Error: 'seriesId' parameter is required and must be a number")
  })
})

describe("search_sonarr_series", () => {
  it("returns ten projected results, marked in the library by TVDB id, never by title", async () => {
    const remake = { ...sonarrLookup(0), tvdbId: 999999 }
    serve({ "/api/v3/series/lookup": [sonarrLookup(1), remake, ...range(30, (i) => sonarrLookup(i + 2))], "/api/v3/series": [sonarrSeries(0), sonarrSeries(1)] })

    const output = await run("search_sonarr_series", { term: "lord of the rings" })

    expect(output.showing).toBe('showing 10 of 32 results for "lord of the rings"; use a more specific term, or tvdb:<tvdbId> for one series')
    expect(output.records).toHaveLength(10)
    expect(output.records[0]).toEqual({
      title: showTitle(1),
      year: 2011,
      tvdbId: 300001,
      tmdbId: 60001,
      imdbId: "tt7000001",
      titleSlug: "marvel-s-agents-of-s-h-i-e-l-d-1",
      status: "continuing",
      network: "Prime Video",
      overview: expect.stringMatching(/^A long synopsis.{150,}…$/),
      sonarrId: 2,
      inLibrary: true,
      monitored: true,
      episodeFileCount: 76,
      episodeCount: 80,
    })
    // Same title as the library's series 1, but another show: no library state either
    expect(output.records[1]).toMatchObject({ title: showTitle(0), inLibrary: false })
    for (const field of ["sonarrId", "monitored", "episodeFileCount", "episodeCount"]) expect(output.records[1]).not.toHaveProperty(field)
  })

  it("says how much of a series in the library is downloaded, from the library", async () => {
    const unmonitored = { ...sonarrSeries(3), monitored: false, statistics: { ...sonarrSeries(3).statistics, episodeFileCount: 0, episodeCount: 12 } }
    serve({ "/api/v3/series/lookup": [sonarrLookup(3)], "/api/v3/series": [unmonitored] })

    expect((await run("search_sonarr_series", { term: "maisel" })).records[0]).toMatchObject({ sonarrId: 4, inLibrary: true, monitored: false, episodeFileCount: 0, episodeCount: 12 })
  })

  it("takes the id Sonarr gives a series it holds", async () => {
    serve({ "/api/v3/series/lookup": [{ ...sonarrLookup(5), id: 6 }], "/api/v3/series": [] })

    expect((await run("search_sonarr_series", { term: "x" })).records[0]).toMatchObject({ sonarrId: 6, inLibrary: true })
  })
})

describe("get_sonarr_episodes", () => {
  const episodes = [
    ...range(24, (i) => sonarrEpisode(i, { seriesIndex: 0, season: 1 + Math.floor(i / 12), number: 1 + (i % 12), withSeries: false })),
    sonarrEpisode(99, { seriesIndex: 0, season: 0, number: 1, withSeries: false }),
  ]

  it("returns no episodes, with a note and the seasons, when a filter matches none (it used to return all)", async () => {
    serve({ "/api/v3/episode": episodes })

    const output = await run("get_sonarr_episodes", { seriesId: 1, seasonNumber: 9, episodeNumber: 3 })

    expect(output.records).toEqual([])
    expect(output.showing).toBe("showing 0 of 0 episodes matching season 9, episode 3")
    expect(output.totalRecords).toBe(0)
    expect(output.note).toBe("No episode of this series matches season 9, episode 3; seasons lists the seasons it has")
    expect(output.seasons).toEqual([
      { seasonNumber: 0, episodes: 1, withFile: 0 },
      { seasonNumber: 1, episodes: 12, withFile: 6 },
      { seasonNumber: 2, episodes: 12, withFile: 6 },
    ])
  })

  it("filters to a season and episode, with the episode's id", async () => {
    serve({ "/api/v3/episode": episodes })

    const output = await run("get_sonarr_episodes", { seriesId: 1, seasonNumber: 2, episodeNumber: 3 })

    expect(query(0).get("seriesId")).toBe("1")
    expect(output.showing).toBe("showing 1 of 1 episodes matching season 2, episode 3")
    expect(output.records).toEqual([
      { id: 100014, seasonNumber: 2, episodeNumber: 3, title: "An Episode Title That Runs Long, Part 3", airDate: "2026-11-02", hasFile: true, monitored: true },
    ])
  })

  it("lists every episode by season and number when they fit, specials first", async () => {
    serve({ "/api/v3/episode": episodes })

    const output = await run("get_sonarr_episodes", { seriesId: 1 })

    expect(output.showing).toBe("showing 25 of 25 episodes, by season and number")
    expect(output.seasons).toBeUndefined()
    expect(output.records[0]).toMatchObject({ seasonNumber: 0, episodeNumber: 1 })
    expect(output.records[24]).toMatchObject({ seasonNumber: 2, episodeNumber: 12 })
  })

  it("pages a long series and lists its seasons", async () => {
    serve({ "/api/v3/episode": range(250, (i) => sonarrEpisode(i, { seriesIndex: 0, season: 1 + Math.floor(i / 50), number: 1 + (i % 50), withSeries: false })) })

    const output = await run("get_sonarr_episodes", { seriesId: 1, page: 2 })

    expect(output.showing).toBe(
      "showing 100 of 250 episodes, by season and number (page 2 of 3); pass page 3 for the next 100, or pass seasonNumber for one season (seasons lists them)"
    )
    expect(output.records[0]).toMatchObject({ seasonNumber: 3, episodeNumber: 1 })
    expect(output.seasons).toHaveLength(5)
  })
})

describe("get_sonarr_calendar", () => {
  it("ends the range 7 days after the start it is given, since Sonarr would end it 2 days after today", async () => {
    serve({ "/api/v3/calendar": [] })

    await run("get_sonarr_calendar", { startDate: "2026-11-09" })

    expect(query(0).get("start")).toBe("2026-11-09")
    expect(query(0).get("end")).toBe("2026-11-16")
  })

  it("asks for today to 7 days from now with no dates", async () => {
    jest.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-31T18:00:00Z"))
    serve({ "/api/v3/calendar": [] })

    await run("get_sonarr_calendar")

    expect(query(0).get("start")).toBeNull()
    expect(query(0).get("end")).toBe("2026-11-07")
  })

  it("caps a busy week and says how to see the rest", async () => {
    serve({ "/api/v3/calendar": range(600, (i) => sonarrEpisode(i)) })

    const output = await run("get_sonarr_calendar")

    expect(output.records).toHaveLength(100)
    expect(output.showing).toBe("showing 100 of 600; narrow the date range (startDate, endDate) or pass a series to see the rest")
  })
})

describe("get_sonarr_wanted_missing", () => {
  it("returns at most 50 missing episodes", async () => {
    serve({ "/api/v3/wanted/missing": paged(range(150, (i) => sonarrEpisode(i)), 5000) })

    const output = await run("get_sonarr_wanted_missing", { pageSize: 500 })

    expect(query(0).get("pageSize")).toBe("50")
    expect(output.records).toHaveLength(50)
    expect(output.showing).toBe("showing 50 of 5000; pass a series (seriesId or seriesName)")
  })

  it("returns every missing episode of a series among the latest 150, past any pageSize, and how to find older ones", async () => {
    serve({ "/api/v3/wanted/missing": paged(range(150, (i) => sonarrEpisode(i, { seriesIndex: i % 2 })), 5000) })

    const output = await run("get_sonarr_wanted_missing", { seriesId: 2, pageSize: 10 })

    expect(query(0).get("pageSize")).toBe("50")
    expect(output.records).toHaveLength(75)
    expect(output.showing).toBe(
      "showing 75 for this title, from the latest 150 of 5000; to find every missing one, list the series' episodes with get_sonarr_episodes: a monitored, aired episode with hasFile false is missing"
    )
  })

  it("needs no hint when the latest missing episodes are all there are", async () => {
    serve({ "/api/v3/wanted/missing": paged(range(40, (i) => sonarrEpisode(i, { seriesIndex: i % 2 }))) })

    expect((await run("get_sonarr_wanted_missing", { seriesId: 2 })).showing).toBe("showing 20 for this title, from the latest 40 of 40")
  })
})

describe("get_sonarr_queue for one series", () => {
  // A complete-series pack: one queue item per episode, across eight seasons
  const pack = paged(range(150, (i) => ({ ...sonarrQueueItem(i), seriesId: 1 })), 400)

  it("keeps every item that fits, and offers a season when they do not all fit", async () => {
    serve({ "/api/v3/queue": pack })

    const output = await run("get_sonarr_queue", { seriesId: 1 })

    expect(output.records.length).toBeGreaterThan(50)
    expect(output.showing).toBe(`showing ${output.records.length} of the 150 for this title, from the latest 150 of 400; pass seasonNumber to see one season's items`)
  })

  it("filters to one season", async () => {
    serve({ "/api/v3/queue": pack })

    const output = await run("get_sonarr_queue", { seriesId: 1, seasonNumber: 3 })

    expect(output.showing).toBe("showing 19 for this title, from the latest 150 of 400")
    expect(new Set(output.records.map((item: { episode: { seasonNumber: number } }) => item.episode.seasonNumber))).toEqual(new Set([3]))
  })
})

describe("get_sonarr_history for one series", () => {
  it("offers an episode when it cannot show all of the series' history (outside Discord)", async () => {
    serve({ "/api/v3/history/series": range(340, sonarrHistory) })

    expect((await run("get_sonarr_history", { seriesId: 1, pageSize: 50 })).showing).toBe(
      "showing 50 of 340; pass an episodeId (from get_sonarr_episodes) for one episode's history"
    )
    expect((await run("get_sonarr_history", { seriesId: 1 })).showing).toBe(
      "showing 20 of 340; pass a pageSize up to 50, or pass an episodeId (from get_sonarr_episodes) for one episode's history"
    )
  })
})

describe("configuration", () => {
  it("gives quality profiles as their cutoff and allowed qualities", async () => {
    serve({ "/api/v3/qualityProfile": [qualityProfile(0)] })

    expect(await run("get_sonarr_quality_profiles")).toEqual([
      {
        id: 1,
        name: "Profile 1 for 4K HDR and 1080p fallbacks",
        upgradeAllowed: true,
        cutoff: "WEB 1080p",
        allowed: ["HDTV-1080p", "WEB 1080p (WEBDL-1080p, WEBRip-1080p)", "Bluray-1080p", "WEB 2160p (WEBDL-2160p, WEBRip-2160p)", "Bluray-2160p"],
      },
    ])
  })

  it("counts a root folder's unmapped folders instead of listing them", async () => {
    serve({ "/api/v3/rootFolder": [rootFolder(0)] })

    expect(await run("get_sonarr_root_folders")).toEqual([
      { id: 1, path: "/data/media/root-1/", accessible: true, freeSpace: 4398046511104, unmappedFolderCount: 3000 },
    ])
  })
})

describe("on a large server (1,500 series, long titles), every reply fits in a tool result", () => {
  const LIMIT = 40_000
  const seriesLibrary = range(1500, sonarrSeries)

  /** The output, and the same with the zone offsets the dispatcher adds, both within the limit. */
  async function fits(toolName: string, args: Record<string, unknown> = {}) {
    const output = await executeSonarrTool(toolName, args)
    expect(output.length).toBeLessThanOrEqual(LIMIT)
    expect(withLocalInstants(output, "Asia/Kolkata").length).toBeLessThanOrEqual(LIMIT)
    return JSON.parse(output)
  }

  it.each([
    [{}, 50],
    [{ page: 15, pageSize: 1000 }, 75],
    [{ search: "the" }, 50],
  ])("get_sonarr_series %j", async (args, count) => {
    serve({ "/api/v3/series": seriesLibrary })
    expect((await fits("get_sonarr_series", args)).records).toHaveLength(count)
  })

  it.each([{}, { pageSize: 1000 }, { seriesId: 1, pageSize: 1000 }])("get_sonarr_history %j", async (args) => {
    serve({ "/api/v3/history": paged(range(150, sonarrHistory), 25000), "/api/v3/history/series": range(400, sonarrHistory) })
    expect((await fits("get_sonarr_history", args)).records.length).toBe("pageSize" in args ? 50 : 20)
  })

  it.each([
    [{}, 50],
    [{ seriesId: 1, seasonNumber: 1 }, 19],
  ])("get_sonarr_queue %j", async (args, count) => {
    serve({ "/api/v3/queue": paged(range(150, (i) => ({ ...sonarrQueueItem(i), seriesId: 1 })), 400) })
    expect((await fits("get_sonarr_queue", args)).records).toHaveLength(count)
  })

  it("get_sonarr_queue for a series whose pack fills the latest 150 items", async () => {
    serve({ "/api/v3/queue": paged(range(150, (i) => ({ ...sonarrQueueItem(i), seriesId: 1 })), 400) })
    expect((await fits("get_sonarr_queue", { seriesId: 1 })).records.length).toBeGreaterThan(50)
  })

  it("get_sonarr_queue in Discord", async () => {
    serve({ "/api/v3/queue": paged(range(150, (i) => ({ ...sonarrQueueItem(i), seriesId: 1 })), 400) })
    const output = await executeSonarrTool("get_sonarr_queue", { seriesId: 1 }, "user-1", "discord")
    expect(scrubForDiscord("get_sonarr_queue", withLocalInstants(output, "Asia/Kolkata")).length).toBeLessThanOrEqual(LIMIT)
  })

  it.each([{}, { seriesId: 1 }])("get_sonarr_calendar %j", async (args) => {
    serve({ "/api/v3/calendar": range(600, (i) => ({ ...sonarrEpisode(i), seriesId: 1 })) })
    expect((await fits("get_sonarr_calendar", args)).records).toHaveLength(100)
  })

  it.each([
    [{}, 20],
    [{ pageSize: 1000 }, 50],
  ])("get_sonarr_wanted_missing %j", async (args, count) => {
    serve({ "/api/v3/wanted/missing": paged(range(150, (i) => ({ ...sonarrEpisode(i), seriesId: 1 })), 5000) })
    expect((await fits("get_sonarr_wanted_missing", args)).records).toHaveLength(count)
  })

  it("get_sonarr_wanted_missing for a series whose every one of the latest 150 is missing", async () => {
    serve({ "/api/v3/wanted/missing": paged(range(150, (i) => ({ ...sonarrEpisode(i), seriesId: 1 })), 5000) })
    const output = await fits("get_sonarr_wanted_missing", { seriesId: 1 })
    expect(output.records.length).toBeGreaterThan(100)
    expect(output.showing).toMatch(/^showing \d+ of the 150 for this title, from the latest 150 of 5000; to find every missing one, list the series' episodes with get_sonarr_episodes/)
  })

  it.each([{}, { seasonNumber: 1 }, { page: 40 }])("get_sonarr_episodes of a daily show %j", async (args) => {
    serve({ "/api/v3/episode": range(4000, (i) => sonarrEpisode(i, { seriesIndex: 0, season: 1 + Math.floor(i / 250), number: 1 + (i % 250), withSeries: false })) })
    expect((await fits("get_sonarr_episodes", { seriesId: 1, ...args })).records).toHaveLength(100)
  })

  it("search_sonarr_series", async () => {
    serve({ "/api/v3/series/lookup": range(50, sonarrLookup), "/api/v3/series": seriesLibrary })
    expect((await fits("search_sonarr_series", { term: "the" })).records).toHaveLength(10)
  })

  it("get_sonarr_series_details and get_sonarr_episode_details", async () => {
    const series = { ...sonarrSeries(0), seasons: range(40, (s) => sonarrSeries(0).seasons[s % 8]) }
    serve({ "/api/v3/series/1": series, "/api/v3/episode/7": { ...sonarrEpisode(7), series } })
    expect((await fits("get_sonarr_series_details", { seriesId: 1 })).seasons).toHaveLength(40)
    expect((await fits("get_sonarr_episode_details", { episodeId: 7 })).series.seasons).toHaveLength(40)
  })

  it("get_sonarr_status, get_sonarr_quality_profiles and get_sonarr_root_folders", async () => {
    serve({
      "/api/v3/system/status": { appName: "Sonarr", version: "4.0.10.2544", startupPath: "/app/sonarr/bin", appData: "/config", osName: "ubuntu", isDocker: true },
      "/api/v3/queue": paged(range(1, sonarrQueueItem), 400),
      "/api/v3/health": range(30, (i) => ({ source: "IndexerStatusCheck", type: "warning", message: `Indexers unavailable due to failures: indexer ${i}`, wikiUrl: "https://wiki.servarr.com/sonarr/system#indexers-are-unavailable-due-to-failures" })),
      "/api/v3/diskspace": range(40, (i) => ({ path: `/data/mount-${i}`, label: `mount-${i}`, freeSpace: 4398046511104, totalSpace: 8796093022208 })),
      "/api/v3/qualityProfile": range(15, qualityProfile),
      "/api/v3/rootFolder": range(4, rootFolder),
    })
    await fits("get_sonarr_status")
    expect(await fits("get_sonarr_quality_profiles")).toHaveLength(15)
    expect(await fits("get_sonarr_root_folders")).toHaveLength(4)
  })
})
