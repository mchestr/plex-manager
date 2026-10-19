/**
 * @jest-environment node
 */

/**
 * The Overseerr user index (P4.13): `/user` paged with `take=100&skip=n`, a
 * map from the numeric `plexId` to the Overseerr user id, matched against a
 * member's string `plexUserId`, and cached in process for 10 minutes.
 */

import {
  buildOverseerrUserIndex,
  clearOverseerrUserIndexCache,
  findOverseerrUserId,
} from "@/lib/connections/overseerr"

import usersPage1 from "./fixtures/overseerr-users-page-1.json"
import usersPage2 from "./fixtures/overseerr-users-page-2.json"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const config = { url: "http://overseerr.local:5055/", apiKey: "overseerr-key" }
const mockFetch = jest.fn()

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const requested = () => mockFetch.mock.calls.map(([url]) => new URL(String(url)))

beforeEach(() => {
  jest.useRealTimers()
  clearOverseerrUserIndexCache()
  mockFetch.mockReset()
  mockFetch.mockImplementation(async (url: string) =>
    json(new URL(url).searchParams.get("skip") === "0" ? usersPage1 : usersPage2)
  )
  global.fetch = mockFetch as unknown as typeof fetch
})

async function built() {
  const result = await buildOverseerrUserIndex(config)
  if (!result.ok) throw new Error(result.code)
  return result.data
}

describe("buildOverseerrUserIndex", () => {
  it("reads two pages into a map from plexId to the Overseerr user id", async () => {
    const index = await built()

    expect([...index]).toEqual([
      [1001, 1],
      [4815162, 7],
    ])
    expect(requested().map((url) => `${url.pathname}${url.search}`)).toEqual([
      "/api/v1/user?take=100&skip=0",
      "/api/v1/user?take=100&skip=100",
    ])
    expect(mockFetch.mock.calls[0][1].headers).toMatchObject({ "X-Api-Key": "overseerr-key" })
  })

  it("matches a member's string plexUserId against the numeric plexId", async () => {
    const index = await built()

    expect(findOverseerrUserId(index, "4815162")).toBe(7)
    expect(findOverseerrUserId(index, "424242")).toBeNull()
    expect(findOverseerrUserId(index, "")).toBeNull()
    expect(findOverseerrUserId(index, " 4815162")).toBeNull()
    expect(findOverseerrUserId(index, "4815162.0")).toBeNull()
  })

  it("is built once per 10 minutes", async () => {
    jest.useFakeTimers({ now: new Date("2026-12-02T10:00:00Z") })
    await built()
    await built()
    expect(mockFetch).toHaveBeenCalledTimes(2)

    jest.setSystemTime(new Date("2026-12-02T10:10:01Z"))
    await built()
    expect(mockFetch).toHaveBeenCalledTimes(4)
  })

  it("returns the failure and caches nothing when a page fails", async () => {
    mockFetch.mockImplementationOnce(async () => json({}, 503))

    expect(await buildOverseerrUserIndex(config)).toMatchObject({ ok: false, code: "HTTP", status: 503 })
    await built()
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it("stops at 50 pages with PAGE_LIMIT instead of a partial index", async () => {
    mockFetch.mockImplementation(async () => json({ ...usersPage1, pageInfo: { ...usersPage1.pageInfo, pages: 99 } }))

    expect(await buildOverseerrUserIndex(config)).toEqual({ ok: false, code: "PAGE_LIMIT" })
    expect(mockFetch).toHaveBeenCalledTimes(50)
  })
})
