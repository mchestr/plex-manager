/**
 * @jest-environment node
 */

/**
 * Tests for the Overseerr request source (P2.4: RWP-06).
 */

import {
  fetchMemberRequests,
  fetchServerRequests,
  findOverseerrUser,
  type GenreCache,
} from "@/lib/wrapped/sources/overseerr-requests"
import { clearOverseerrUserIndexCache } from "@/lib/connections/overseerr"
import { directLimiter } from "@/lib/wrapped/sources/watch-history-source"
import { yearWindow } from "@/lib/wrapped/time/zone"

import movieDetail from "./fixtures/overseerr-movie-detail.json"
import memberRequests from "./fixtures/overseerr-member-requests.json"
import usersPage1 from "./fixtures/overseerr-users-page-1.json"
import usersPage2 from "./fixtures/overseerr-users-page-2.json"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const config = { url: "http://overseerr.local:5055/", apiKey: "overseerr-key" }
const ctx = { limiter: directLimiter }
const window2026 = yearWindow(2026, "UTC")
const mockFetch = jest.fn()

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const requestedUrls = () => mockFetch.mock.calls.map(([url]) => new URL(String(url)))

function route(url: string): Response {
  const { pathname, searchParams } = new URL(url)
  if (pathname === "/api/v1/user") return json(searchParams.get("skip") === "0" ? usersPage1 : usersPage2)
  if (pathname === "/api/v1/request") return json(memberRequests)
  if (/^\/api\/v1\/(movie|tv)\/\d+$/.test(pathname)) return json(movieDetail)
  return json({}, 404)
}

beforeEach(() => {
  mockFetch.mockReset()
  clearOverseerrUserIndexCache()
  mockFetch.mockImplementation(async (url: string) => route(url))
  global.fetch = mockFetch as unknown as typeof fetch
})

describe("findOverseerrUser", () => {
  it("finds the member on page 2 by plexId", async () => {
    const result = await findOverseerrUser(config, "100001", ctx)

    expect(result).toEqual({ ok: true, data: 101 })
    expect(requestedUrls().map((url) => url.search)).toEqual(["?take=100&skip=0", "?take=100&skip=100"])
    expect(mockFetch.mock.calls[0][1].headers).toMatchObject({ "X-Api-Key": "overseerr-key" })
  })

  it("returns null without an email fallback when no plexId matches", async () => {
    expect(await findOverseerrUser(config, "424242", ctx)).toEqual({ ok: true, data: null })
    expect(await findOverseerrUser(config, "", ctx)).toEqual({ ok: true, data: null })
  })
})

describe("fetchMemberRequests", () => {
  it("pages by requestedBy with filter=all and maps statuses", async () => {
    const result = await fetchMemberRequests(config, 101, window2026, new Map(), ctx)

    if (!result.ok) throw new Error(result.code)
    const [requests] = requestedUrls()
    expect(requests.pathname).toBe("/api/v1/request")
    expect(Object.fromEntries(requests.searchParams)).toEqual({
      take: "100",
      skip: "0",
      sort: "added",
      filter: "all",
      requestedBy: "101",
    })
    const byId = Object.fromEntries(result.data.map((r) => [r.id, [r.status, r.approved, r.available]]))
    expect(byId).toEqual({
      7: ["pending", false, false],
      6: ["approved", true, true], // TV, partially available
      5: ["completed", true, true],
      4: ["approved", true, true], // 4K: read from status4k
      3: ["declined", false, false],
      2: ["completed", true, false], // Seerr's 7 (deleted) is never available
    })
    expect(result.data.every((r) => r.requestedById === 101)).toBe(true)
  })

  it("keeps only requests created inside the window", async () => {
    const result = await fetchMemberRequests(config, 101, window2026, new Map(), ctx)

    expect(result.ok && result.data.map((r) => r.id)).not.toContain(1)
  })

  it("fetches genres once per tmdbId, across members in the batch", async () => {
    const genres: GenreCache = new Map()

    const result = await fetchMemberRequests(config, 101, window2026, genres, ctx)
    await fetchMemberRequests(config, 101, window2026, genres, ctx)

    const detailPaths = requestedUrls()
      .map((url) => url.pathname)
      .filter((path) => /\/(movie|tv)\//.test(path))
    expect(detailPaths.sort()).toEqual([
      "/api/v1/movie/1001",
      "/api/v1/movie/1002",
      "/api/v1/movie/1003",
      "/api/v1/movie/1004",
      "/api/v1/tv/2001",
    ])
    expect(result.ok && result.data.find((r) => r.id === 7)?.genres).toEqual(["Science Fiction", "Adventure"])
  })

  it("returns the HTTP failure of a request page", async () => {
    mockFetch.mockImplementation(async () => json({}, 503))

    const result = await fetchMemberRequests(config, 101, window2026, new Map(), ctx)

    expect(result).toMatchObject({ ok: false, code: "HTTP", status: 503 })
  })
})

describe("fetchServerRequests", () => {
  it("pages every requester's requests without genres", async () => {
    const result = await fetchServerRequests(config, window2026, ctx)

    expect(requestedUrls()[0].searchParams.has("requestedBy")).toBe(false)
    expect(result.ok && result.data).toHaveLength(6)
    expect(result.ok && result.data.every((r) => r.genres.length === 0)).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
