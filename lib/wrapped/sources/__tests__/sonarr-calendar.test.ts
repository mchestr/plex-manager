/**
 * @jest-environment node
 */

/**
 * Sonarr's season premieres for Next year's returning part (P7.2): the
 * recorded calendar, the tvdb match to the member's series, and the failures
 * that leave the part out (NFR-3).
 */

import { fetchSeasonPremieres, returningRange, type SeasonPremiere } from "@/lib/wrapped/sources/sonarr-calendar"
import { play, statsContext } from "@/lib/wrapped/stats/__tests__/build-events"
import { lookupFor, meta } from "@/lib/wrapped/stats/__tests__/build-lookups"
import { computeNextYear } from "@/lib/wrapped/stats/next-year"

import calendar from "./fixtures/sonarr-calendar.json"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const config = { name: "Sonarr", url: "http://sonarr.local:8989", apiKey: "sonarr-key", publicUrl: null }
const range = { from: "2026-12-01", to: "2027-03-31" }
const mockFetch = jest.fn()

beforeEach(() => {
  mockFetch.mockReset()
  mockFetch.mockImplementation(async () => new Response(JSON.stringify(calendar), { status: 200 }))
  global.fetch = mockFetch as unknown as typeof fetch
})

afterEach(() => jest.restoreAllMocks())

describe("fetchSeasonPremieres", () => {
  it("reads the calendar with its series, from the generation day to 31 March", async () => {
    expect(returningRange(new Date("2026-12-02T09:00:00Z"), 2026)).toEqual({ from: "2026-12-02", to: "2027-03-31" })
    await fetchSeasonPremieres(config, range)
    const [url, init] = mockFetch.mock.calls[0]
    const { pathname, searchParams } = new URL(String(url))
    expect(pathname).toBe("/api/v3/calendar")
    expect(Object.fromEntries(searchParams)).toEqual({ start: "2026-12-01", end: "2027-03-31", includeSeries: "true" })
    expect(init.headers).toMatchObject({ "X-Api-Key": "sonarr-key" })
  })

  it("keeps each series' first numbered-season premiere, soonest first", async () => {
    expect(await fetchSeasonPremieres(config, range)).toEqual([
      { tvdbId: 371980, tmdbId: 95396, title: "Severance", season: 3, airDate: "2027-01-16" },
      { tvdbId: 361014, tmdbId: 95480, title: "Slow Horses", season: 6, airDate: "2027-02-04" },
    ])
  })

  it("omits the part when the call times out", async () => {
    jest.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort(new DOMException("timed out", "TimeoutError")))
    mockFetch.mockImplementation(async (_url: string, init: RequestInit) => {
      throw init.signal?.reason
    })
    expect(await fetchSeasonPremieres(config, range)).toBeNull()
  })

  it("rejects a malformed body with its schema", async () => {
    mockFetch.mockImplementation(async () => new Response(JSON.stringify([{ seasonNumber: "3", episodeNumber: 1, series: { title: "Severance" } }]), { status: 200 }))
    expect(await fetchSeasonPremieres(config, range)).toBeNull()
    mockFetch.mockImplementation(async () => new Response("<html>login</html>", { status: 200 }))
    expect(await fetchSeasonPremieres(config, range)).toBeNull()
  })

  it("omits the part on an HTTP error", async () => {
    mockFetch.mockImplementation(async () => new Response("unauthorised", { status: 401 }))
    expect(await fetchSeasonPremieres(config, range)).toBeNull()
  })
})

describe("returning series in computeNextYear", () => {
  const ctx = statsContext("UTC")
  const premieres: SeasonPremiere[] = [
    { tvdbId: 371980, tmdbId: 95396, title: "Severance", season: 3, airDate: "2027-01-16" },
    { tvdbId: 361014, tmdbId: 95480, title: "Slow Horses", season: 6, airDate: "2027-02-04" },
  ]
  const events = [
    play({ at: "2026-03-01T20:00", zone: "UTC", series: "77", episode: 1, title: "Severance", seconds: 3600 }),
    play({ at: "2026-03-02T20:00", zone: "UTC", series: "88", episode: 1, title: "Slow Horses", seconds: 1800 }),
  ]
  const input = { taste: { eligible: false as const, coverage: 0 }, people: { eligible: false as const, coverage: 0 }, library: null, excludedContentRatings: [] }

  it("matches the member's series by their cached tvdb:// guid", () => {
    const lookup = lookupFor(events, { "77": meta({ guids: ["imdb://tt11280740", "tvdb://371980"] }), "88": meta({ guids: ["tmdb://95480"] }) })
    const next = computeNextYear(events, ctx, lookup, { ...input, premieres })
    expect(next.returning).toEqual([{ key: "series:77", title: "Severance", season: 3, date: "2027-01-16", tmdbId: 95396 }])
    expect(next.eligible).toBe(true)
  })

  it("has no returning part without Sonarr", () => {
    const lookup = lookupFor(events, { "77": meta({ guids: ["tvdb://371980"] }) })
    expect(computeNextYear(events, ctx, lookup, { ...input, premieres: null }).returning).toBeNull()
    expect(computeNextYear(events, ctx, lookup, input).returning).toBeNull()
  })
})
