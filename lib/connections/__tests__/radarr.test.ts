/**
 * Radarr client (GAP-07): per-movie history, `includeMovie` on history and
 * the queue, and paging that stops at the total or the cap.
 */

import {
  getRadarrCalendar,
  getRadarrHistory,
  getRadarrQueue,
  getRadarrWantedMissing,
} from "@/lib/connections/radarr"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const config = { name: "Radarr", url: "http://radarr.lan:7878", apiKey: "arr-key", publicUrl: undefined }
const mockFetch = jest.fn()

function respond(body: unknown) {
  return { ok: true, status: 200, headers: new Headers(), json: async () => body }
}

function call(n: number) {
  const url = new URL(String(mockFetch.mock.calls[n][0]))
  return { path: url.pathname, query: Object.fromEntries(url.searchParams) }
}

function page(count: number, totalRecords: number, first = 0) {
  return { page: 1, pageSize: 50, totalRecords, records: Array.from({ length: count }, (_, i) => ({ id: first + i })) }
}

const movieHistory = [
  { id: 501, movieId: 9, eventType: "downloadFailed", sourceTitle: "Heat.1995.1080p", movie: { id: 9, title: "Heat" } },
  { id: 500, movieId: 9, eventType: "grabbed", sourceTitle: "Heat.1995.1080p", movie: { id: 9, title: "Heat" } },
]

beforeEach(() => {
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
})

describe("getRadarrHistory", () => {
  it("reads a movie's history from /history/movie with movieId", async () => {
    mockFetch.mockResolvedValue(respond(movieHistory))

    const result = await getRadarrHistory(config, { pageSize: 1, movieId: 9 })

    expect(call(0)).toEqual({ path: "/api/v3/history/movie", query: { movieId: "9", includeMovie: "true" } })
    expect(result).toEqual({ success: true, data: { records: [movieHistory[0]], totalRecords: 2 } })
  })

  it("reads the server-wide history with includeMovie and pages until totalRecords", async () => {
    mockFetch.mockResolvedValueOnce(respond(page(50, 70))).mockResolvedValueOnce(respond(page(20, 70, 50)))

    const result = await getRadarrHistory(config, { pageSize: 150 })

    expect(call(0)).toEqual({ path: "/api/v3/history", query: { includeMovie: "true", page: "1", pageSize: "50" } })
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(result.success && result.data.records).toHaveLength(70)
  })
})

describe("list calls", () => {
  it("asks the queue for 50 items with their movies", async () => {
    mockFetch.mockResolvedValue(respond(page(2, 2)))

    await getRadarrQueue(config)

    expect(call(0)).toEqual({ path: "/api/v3/queue", query: { includeMovie: "true", page: "1", pageSize: "50" } })
  })

  it("pages wanted/missing with an explicit page size and stops at the cap", async () => {
    mockFetch
      .mockResolvedValueOnce(respond(page(50, 900)))
      .mockResolvedValueOnce(respond(page(50, 900, 50)))
      .mockResolvedValueOnce(respond(page(50, 900, 100)))

    const result = await getRadarrWantedMissing(config, 500)

    expect(call(0)).toEqual({ path: "/api/v3/wanted/missing", query: { sortKey: "physicalRelease", page: "1", pageSize: "50" } })
    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(result.success && result.data).toMatchObject({ totalRecords: 900 })
    expect(result.success && result.data.records).toHaveLength(150)
  })

  it("reads the calendar for the range", async () => {
    mockFetch.mockResolvedValue(respond([]))

    await getRadarrCalendar(config, "2027-01-14")

    expect(call(0)).toEqual({ path: "/api/v3/calendar", query: { start: "2027-01-14" } })
  })
})
