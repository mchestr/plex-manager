/**
 * Sonarr client against recorded fixtures (GAP-07): per-series history,
 * `includeSeries` on the list calls, and paging that stops at the total or
 * the cap.
 */

import historyPage1 from "./fixtures/arr/sonarr-history-page-1.json"
import historyPage2 from "./fixtures/arr/sonarr-history-page-2.json"
import seriesHistory from "./fixtures/arr/sonarr-series-history.json"
import queue from "./fixtures/arr/sonarr-queue.json"
import calendar from "./fixtures/arr/sonarr-calendar.json"
import seriesByTvdb from "./fixtures/arr/sonarr-series-by-tvdb.json"
import {
  findSonarrSeries,
  getSonarrCalendar,
  getSonarrHistory,
  getSonarrQueue,
  getSonarrWantedMissing,
} from "@/lib/connections/sonarr"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const config = { name: "Sonarr", url: "http://sonarr.lan:8989", apiKey: "arr-key", publicUrl: undefined }
const mockFetch = jest.fn()

function respond(body: unknown) {
  return { ok: true, status: 200, headers: new Headers(), json: async () => body }
}

/** The query of call `n` as an object, and its path. */
function call(n: number) {
  const url = new URL(String(mockFetch.mock.calls[n][0]))
  return { path: url.pathname, query: Object.fromEntries(url.searchParams) }
}

/** A page of `count` records out of `totalRecords`. */
function page(count: number, totalRecords: number, first = 0) {
  return { page: 1, pageSize: 50, totalRecords, records: Array.from({ length: count }, (_, i) => ({ id: first + i })) }
}

beforeEach(() => {
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
})

describe("getSonarrHistory", () => {
  it("reads a series' history from /history/series with seriesId", async () => {
    mockFetch.mockResolvedValue(respond(seriesHistory))

    const result = await getSonarrHistory(config, { pageSize: 20, seriesId: 12 })

    expect(call(0)).toEqual({
      path: "/api/v3/history/series",
      query: { seriesId: "12", includeSeries: "true", includeEpisode: "true" },
    })
    expect(result).toEqual({ success: true, data: { records: seriesHistory, totalRecords: 2 } })
  })

  it("reads an episode's history from /history with episodeId", async () => {
    mockFetch.mockResolvedValue(respond(historyPage2))

    await getSonarrHistory(config, { pageSize: 20, seriesId: 12, episodeId: 4410 })

    expect(call(0)).toEqual({
      path: "/api/v3/history",
      query: { includeSeries: "true", includeEpisode: "true", episodeId: "4410", page: "1", pageSize: "20" },
    })
  })

  it("follows pages and stops at totalRecords", async () => {
    mockFetch.mockResolvedValueOnce(respond(historyPage1)).mockResolvedValueOnce(respond(historyPage2))

    const result = await getSonarrHistory(config, { pageSize: 150 })

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(call(0).query).toMatchObject({ page: "1", pageSize: "50", includeSeries: "true" })
    expect(call(0).query).not.toHaveProperty("seriesId")
    expect(call(1).query).toMatchObject({ page: "2" })
    expect(result).toEqual({
      success: true,
      data: { records: [...historyPage1.records, ...historyPage2.records], totalRecords: 3 },
    })
  })
})

describe("list calls", () => {
  it("asks the queue for 50 items with their series and episodes", async () => {
    mockFetch.mockResolvedValue(respond(queue))

    const result = await getSonarrQueue(config)

    expect(call(0)).toEqual({
      path: "/api/v3/queue",
      query: { includeSeries: "true", includeEpisode: "true", page: "1", pageSize: "50" },
    })
    expect(result).toEqual({ success: true, data: { records: queue.records, totalRecords: 2 } })
  })

  it("asks the calendar for each episode's series", async () => {
    mockFetch.mockResolvedValue(respond(calendar))

    expect(await getSonarrCalendar(config, "2027-01-14", "2027-01-21")).toEqual({ success: true, data: calendar })
    expect(call(0)).toEqual({
      path: "/api/v3/calendar",
      query: { start: "2027-01-14", end: "2027-01-21", includeSeries: "true" },
    })
  })

  it("asks wanted/missing for each episode's series with an explicit page size", async () => {
    mockFetch.mockResolvedValue(respond(page(5, 5)))

    await getSonarrWantedMissing(config, 20)

    expect(call(0)).toEqual({
      path: "/api/v3/wanted/missing",
      query: { includeSeries: "true", sortKey: "airDateUtc", page: "1", pageSize: "20" },
    })
  })

  it("stops at three pages and 150 records", async () => {
    mockFetch
      .mockResolvedValueOnce(respond(page(50, 400)))
      .mockResolvedValueOnce(respond(page(50, 400, 50)))
      .mockResolvedValueOnce(respond(page(50, 400, 100)))

    const result = await getSonarrQueue(config, 1000)

    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(result.success && result.data.records).toHaveLength(150)
    expect(result.success && result.data.totalRecords).toBe(400)
  })

  it("stops at the limit", async () => {
    mockFetch.mockResolvedValue(respond(page(20, 400)))

    const result = await getSonarrWantedMissing(config, 20)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(result.success && result.data.records).toHaveLength(20)
  })
})

describe("findSonarrSeries", () => {
  const otherSeries = { ...seriesByTvdb[0], id: 8, tvdbId: 79168, tmdbId: 1668, imdbId: "tt0108778", titleSlug: "friends" }

  it("asks Sonarr for the series with a TVDB id", async () => {
    mockFetch.mockResolvedValue(respond(seriesByTvdb))

    const result = await findSonarrSeries(config, { tvdb: 73244, tmdb: 2316 })

    expect(result).toEqual({ success: true, data: expect.objectContaining({ id: 7, titleSlug: "the-office-us", tvdbId: 73244 }) })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(call(0)).toEqual({ path: "/api/v3/series", query: { tvdbId: "73244" } })
    expect(mockFetch.mock.calls[0][1].headers["X-Api-Key"]).toBe("arr-key")
  })

  it.each([
    ["TMDB", { tmdb: 2316 }],
    ["IMDb", { imdb: "tt0386676" }],
  ])("finds a series without a TVDB id by its %s id across the library", async (_label, ids) => {
    mockFetch.mockResolvedValue(respond([otherSeries, ...seriesByTvdb]))

    expect(await findSonarrSeries(config, ids)).toEqual({ success: true, data: expect.objectContaining({ id: 7 }) })
    expect(call(0)).toEqual({ path: "/api/v3/series", query: {} })
  })

  it("falls back to the other ids when the TVDB id finds nothing", async () => {
    mockFetch.mockResolvedValueOnce(respond([])).mockResolvedValueOnce(respond([otherSeries, ...seriesByTvdb]))

    expect(await findSonarrSeries(config, { tvdb: 73245, imdb: "tt0386676" })).toEqual({
      success: true,
      data: expect.objectContaining({ id: 7 }),
    })
  })

  it("finds nothing for a series Sonarr doesn't have", async () => {
    mockFetch.mockResolvedValue(respond([]))

    expect(await findSonarrSeries(config, { tvdb: 73245 })).toEqual({ success: true, data: null })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("makes no request without an id", async () => {
    expect(await findSonarrSeries(config, {})).toEqual({ success: true, data: null })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("reports a failed request", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, headers: new Headers(), json: async () => ({}) })

    expect(await findSonarrSeries(config, { tvdb: 73244 })).toEqual({ success: false, error: "Sonarr returned HTTP 500" })
  })
})
