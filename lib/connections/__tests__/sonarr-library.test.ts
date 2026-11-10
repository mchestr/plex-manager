/**
 * @jest-environment node
 */

/**
 * Tests for lib/connections/sonarr-library.ts: the Sonarr reads of media
 * cleanup (TS 7.2.2 S1 to S5, A2, TS 8.8 rows 1 and 2, TS 8.9) against the
 * fixtures of lib/cleanup/__tests__/fixtures.
 */

import diskspace from "@/lib/cleanup/__tests__/fixtures/arr-diskspace.json"
import importLists from "@/lib/cleanup/__tests__/fixtures/arr-importlist.json"
import rootFolders from "@/lib/cleanup/__tests__/fixtures/arr-rootfolder.json"
import tags from "@/lib/cleanup/__tests__/fixtures/arr-tag.json"
import episodeFiles from "@/lib/cleanup/__tests__/fixtures/sonarr-episodefile.json"
import episodes from "@/lib/cleanup/__tests__/fixtures/sonarr-episodes.json"
import seriesFull from "@/lib/cleanup/__tests__/fixtures/sonarr-series-full.json"
import seriesList from "@/lib/cleanup/__tests__/fixtures/sonarr-series-list.json"
import { sonarrFileCount } from "@/lib/cleanup/schema/upstream"
import {
  getSonarrDisk,
  getSonarrSeries,
  getSonarrSeriesFull,
  listSonarrEpisodeFiles,
  listSonarrEpisodes,
  listSonarrImportLists,
  listSonarrRootFolders,
  listSonarrSeries,
  listSonarrTags,
} from "@/lib/connections/sonarr-library"

const CONFIG = { url: "http://sonarr.invalid:8989", apiKey: "sonarr-key" }

let fetchSpy: jest.SpyInstance
let timeouts: jest.SpyInstance

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

function lastRequest() {
  const [url, init] = fetchSpy.mock.calls.at(-1) as [string, RequestInit]
  return { url: String(url), method: init.method, headers: init.headers as Record<string, string> }
}

beforeEach(() => {
  fetchSpy = jest.spyOn(global, "fetch")
  timeouts = jest.spyOn(AbortSignal, "timeout")
})

afterEach(() => jest.restoreAllMocks())

describe("listSonarrSeries", () => {
  it("reads every series with the key in a header and a 60 s budget", async () => {
    fetchSpy.mockResolvedValue(json(seriesList))

    const result = await listSonarrSeries(CONFIG)

    expect(result.ok && result.data.map((s) => [s.id, s.status])).toEqual([
      [21, "continuing"],
      [22, "ended"],
    ])
    expect(lastRequest()).toEqual({
      url: "http://sonarr.invalid:8989/api/v3/series",
      method: "GET",
      headers: { Accept: "application/json", "X-Api-Key": "sonarr-key" },
    })
    expect(timeouts).toHaveBeenCalledWith(60_000)
    expect(result.ok && result.data[0]).not.toHaveProperty("network")
  })

  it("fails above 1 % bad rows", async () => {
    jest.replaceProperty(process.env, "NODE_ENV", "production")
    fetchSpy.mockResolvedValue(json([seriesList[0], { ...seriesList[1], tvdbId: "x" }]))

    expect(await listSonarrSeries(CONFIG)).toEqual({ ok: false, code: "ROWS_INVALID" })
  })
})

describe("getSonarrSeries", () => {
  it("reads one series with its season statistics, 10 s", async () => {
    fetchSpy.mockResolvedValue(json(seriesList[0]))

    const result = await getSonarrSeries(CONFIG, 21)

    expect(lastRequest()).toMatchObject({ url: "http://sonarr.invalid:8989/api/v3/series/21", method: "GET" })
    expect(timeouts).toHaveBeenCalledWith(10_000)
    expect(result.ok && sonarrFileCount(result.data)).toBe(3)
  })

  it("parses a season whose statistics is null, which counts 0", async () => {
    const seasons = [
      { seasonNumber: 1, monitored: true, statistics: null },
      { seasonNumber: 2, monitored: true, statistics: { episodeFileCount: 1, sizeOnDisk: 1, episodeCount: 1 } },
    ]
    fetchSpy.mockResolvedValue(json({ ...seriesList[0], seasons }))

    const result = await getSonarrSeries(CONFIG, 21)

    expect(result.ok && result.data.seasons[0].statistics).toBeNull()
    expect(result.ok && sonarrFileCount(result.data)).toBe(1)
    expect(result.ok && sonarrFileCount(result.data, 1)).toBe(0)
  })

  it("reports a gone series as HTTP 404", async () => {
    fetchSpy.mockResolvedValue(json({ message: "NotFound" }, 404))

    expect(await getSonarrSeries(CONFIG, 21)).toEqual({ ok: false, code: "HTTP", status: 404 })
  })

  it("refuses an id that is not a positive whole number", async () => {
    expect(await getSonarrSeries(CONFIG, 0)).toEqual({ ok: false, code: "INVALID_KEY" })
    expect(await getSonarrSeriesFull(CONFIG, -3)).toEqual({ ok: false, code: "INVALID_KEY" })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe("getSonarrSeriesFull", () => {
  it("keeps every field, for the PUT that sends the body back", async () => {
    fetchSpy.mockResolvedValue(json(seriesFull))

    const result = await getSonarrSeriesFull(CONFIG, 21)

    expect(result).toEqual({ ok: true, data: seriesFull })
    expect(lastRequest().url).toBe("http://sonarr.invalid:8989/api/v3/series/21")
  })
})

describe("listSonarrEpisodeFiles", () => {
  it("reads the files of a series with its seriesId, 60 s", async () => {
    fetchSpy.mockResolvedValue(json(episodeFiles))

    const result = await listSonarrEpisodeFiles(CONFIG, 21)

    expect(result.ok && result.data.map((f) => [f.id, f.seasonNumber])).toEqual([
      [2101, 1],
      [2102, 1],
      [2103, 2],
    ])
    expect(result.ok && result.data[0]).not.toHaveProperty("mediaInfo")
    expect(lastRequest()).toMatchObject({ url: "http://sonarr.invalid:8989/api/v3/episodefile?seriesId=21", method: "GET" })
    expect(timeouts).toHaveBeenCalledWith(60_000)
  })

  it("fails on any bad row, so no file is left out", async () => {
    fetchSpy.mockResolvedValue(json([episodeFiles[0], { ...episodeFiles[1], path: null }]))

    expect(await listSonarrEpisodeFiles(CONFIG, 21)).toEqual({ ok: false, code: "INVALID_RESPONSE" })
  })

  it("refuses a series id that is not a positive whole number", async () => {
    expect(await listSonarrEpisodeFiles(CONFIG, 2.5)).toEqual({ ok: false, code: "INVALID_KEY" })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe("listSonarrEpisodes", () => {
  it("reads the episodes of one season, 10 s (A2)", async () => {
    fetchSpy.mockResolvedValue(json(episodes))

    const result = await listSonarrEpisodes(CONFIG, 21, 1)

    expect(result.ok && result.data.map((e) => [e.id, e.monitored])).toEqual([
      [3101, true],
      [3102, false],
    ])
    expect(lastRequest()).toMatchObject({ url: "http://sonarr.invalid:8989/api/v3/episode?seriesId=21&seasonNumber=1", method: "GET" })
    expect(timeouts).toHaveBeenCalledWith(10_000)
  })

  it("reads the specials, season 0", async () => {
    fetchSpy.mockResolvedValue(json([]))

    expect(await listSonarrEpisodes(CONFIG, 21, 0)).toEqual({ ok: true, data: [] })
  })

  it("fails on any bad row, so no monitored episode is left out", async () => {
    fetchSpy.mockResolvedValue(json([{ ...episodes[0], monitored: "yes" }]))

    expect(await listSonarrEpisodes(CONFIG, 21, 1)).toEqual({ ok: false, code: "INVALID_RESPONSE" })
  })

  it.each([
    [0, 1],
    [21, -1],
    [21, 1.5],
  ])("refuses series %p, season %p before any request", async (seriesId, seasonNumber) => {
    expect(await listSonarrEpisodes(CONFIG, seriesId, seasonNumber)).toEqual({ ok: false, code: "INVALID_KEY" })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe("the small Sonarr lists", () => {
  it.each([
    ["listSonarrTags", listSonarrTags, "/api/v3/tag", tags, 2],
    ["listSonarrImportLists", listSonarrImportLists, "/api/v3/importlist", importLists, 1],
    ["listSonarrRootFolders", listSonarrRootFolders, "/api/v3/rootfolder", rootFolders, 1],
    ["getSonarrDisk", getSonarrDisk, "/api/v3/diskspace", diskspace, 2],
  ] as const)("%s reads %s, 10 s", async (_name, read, path, body, count) => {
    fetchSpy.mockResolvedValue(json(body))

    const result = await read(CONFIG)

    expect(result.ok && result.data).toHaveLength(count)
    expect(lastRequest()).toMatchObject({ url: `http://sonarr.invalid:8989${path}`, method: "GET" })
    expect(timeouts).toHaveBeenCalledWith(10_000)
  })

  it("retries a 5xx read, inside the caller's run each time", async () => {
    fetchSpy.mockImplementation(async () => json({}, 503))
    let wrapped = 0
    const run = <R>(call: () => Promise<R>): Promise<R> => {
      wrapped += 1
      return call()
    }

    expect(await listSonarrTags(CONFIG, { run, attempts: 2 })).toEqual({ ok: false, code: "HTTP", status: 503 })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(wrapped).toBe(1)
  })
})
