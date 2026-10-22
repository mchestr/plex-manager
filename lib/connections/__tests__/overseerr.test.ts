/**
 * Tests for lib/connections/overseerr.ts on serviceFetch (P2.3): the chatbot
 * reads, the connection test and request submission.
 */

import {
  getAllOverseerrRequests,
  getOverseerrDiscoverMovies,
  getOverseerrDiscoverTV,
  getOverseerrMediaDetails,
  getOverseerrRequests,
  getOverseerrStatus,
  getOverseerrUsers,
  submitOverseerrRequest,
  testOverseerrConnection,
} from "@/lib/connections/overseerr"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const config = { url: "http://overseerr.local:5055", apiKey: "overseerr-key" }
const mockFetch = jest.fn()

function respond(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function calledUrls(): string[] {
  return mockFetch.mock.calls.map(([url]) => String(url))
}

beforeEach(() => {
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
})

describe("chatbot reads", () => {
  it("send the key as a header and return the JSON", async () => {
    mockFetch.mockResolvedValue(respond(200, { results: [] }))

    const results = await Promise.all([
      getOverseerrStatus(config),
      getOverseerrRequests(config, 5),
      getOverseerrDiscoverMovies(config, 2, "popularity.desc&take=999"),
      getOverseerrDiscoverTV(config),
      getOverseerrMediaDetails(config, 603, "movie"),
      getOverseerrUsers(config),
      getAllOverseerrRequests(config, 10),
    ])

    for (const result of results) expect(result).toEqual({ success: true, data: { results: [] } })
    expect(calledUrls()).toEqual([
      "http://overseerr.local:5055/api/v1/settings/about",
      "http://overseerr.local:5055/api/v1/request?take=5&sort=added&filter=processing",
      "http://overseerr.local:5055/api/v1/discover/movies?page=2&sortBy=popularity.desc%26take%3D999",
      "http://overseerr.local:5055/api/v1/discover/tv?page=1&sortBy=popularity.desc",
      "http://overseerr.local:5055/api/v1/movie/603",
      "http://overseerr.local:5055/api/v1/user?take=100&skip=0",
      "http://overseerr.local:5055/api/v1/request?take=10&sort=added",
    ])
    for (const [, init] of mockFetch.mock.calls) {
      expect(init).toEqual(expect.objectContaining({ headers: expect.objectContaining({ "X-Api-Key": "overseerr-key" }) }))
    }
  })

  it("return a fixed message instead of throwing on failure", async () => {
    mockFetch.mockResolvedValue(respond(500))

    expect(await getOverseerrStatus(config)).toEqual({ success: false, error: "Overseerr returned HTTP 500" })
  })
})

describe("testOverseerrConnection", () => {
  beforeEach(() => {
    jest.replaceProperty(process.env, "NODE_ENV", "production")
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("passes for a user body and fails for an error body or HTTP 401", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, { id: 1 }))
    expect(await testOverseerrConnection(config)).toEqual({ success: true })

    mockFetch.mockResolvedValueOnce(respond(200, { statusCode: 500, message: "boom" }))
    expect(await testOverseerrConnection(config)).toEqual({
      success: false,
      error: "Overseerr sent an unexpected response",
    })

    mockFetch.mockResolvedValueOnce(respond(401))
    expect(await testOverseerrConnection(config)).toEqual({ success: false, error: "Invalid API key" })
  })
})

describe("submitOverseerrRequest", () => {
  const payload = { mediaType: "movie" as const, mediaId: 603 }
  const member = { overseerrUserId: 7 }

  it("reports a title that is already available without posting", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, { mediaInfo: { status: 5, requests: [] } }))

    expect(await submitOverseerrRequest(config, payload, member)).toEqual({ success: true, status: "already_available" })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("reports a pending title as already requested, with its request id", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, { mediaInfo: { status: 2, requests: [{ id: 42 }] } }))

    expect(await submitOverseerrRequest(config, payload, member)).toEqual({
      success: true,
      requestId: 42,
      status: "already_requested",
    })
  })

  it("posts a request for a title Overseerr does not know", async () => {
    mockFetch.mockResolvedValueOnce(respond(404)).mockResolvedValueOnce(respond(201, { id: 77 }))

    const result = await submitOverseerrRequest(config, { ...payload, mediaType: "tv", seasons: [1, 2], is4k: false }, member)

    expect(result).toEqual({ success: true, requestId: 77, status: "created" })
    const [url, init] = mockFetch.mock.calls[1]
    expect(url).toBe("http://overseerr.local:5055/api/v1/request")
    expect(init).toEqual(
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ mediaType: "tv", mediaId: 603, seasons: [1, 2], is4k: false }),
        headers: expect.objectContaining({ "Content-Type": "application/json", "X-Api-Key": "overseerr-key" }),
      })
    )
  })

  it("asks for every season of a show when no list is given (GAP-03)", async () => {
    mockFetch.mockResolvedValueOnce(respond(404)).mockResolvedValueOnce(respond(201, { id: 78, status: 1 }))

    await submitOverseerrRequest(config, { mediaType: "tv", mediaId: 1396 }, member)

    expect(mockFetch.mock.calls[1][1].body).toBe(JSON.stringify({ mediaType: "tv", mediaId: 1396, seasons: "all" }))
  })

  it("reads the 4K status for a 4K request", async () => {
    const mediaInfo = { mediaInfo: { status: 5, status4k: 1, requests: [] } }
    mockFetch.mockResolvedValueOnce(respond(200, mediaInfo)).mockResolvedValueOnce(respond(201, { id: 79 }))

    expect(await submitOverseerrRequest(config, { ...payload, is4k: true }, member)).toEqual({
      success: true,
      requestId: 79,
      status: "created",
    })

    mockFetch.mockResolvedValueOnce(respond(200, mediaInfo))
    expect(await submitOverseerrRequest(config, payload, member)).toEqual({ success: true, status: "already_available" })
  })

  it("maps a 202 to already requested without an id, and a 403 to not permitted with the message", async () => {
    mockFetch
      .mockResolvedValueOnce(respond(404))
      .mockResolvedValueOnce(respond(202, { message: "No seasons available to request" }))
    expect(await submitOverseerrRequest(config, payload, member)).toEqual({ success: true, status: "already_requested" })

    mockFetch.mockResolvedValueOnce(respond(404)).mockResolvedValueOnce(respond(403, { message: "Movie Quota Exceeded" }))
    expect(await submitOverseerrRequest(config, payload, member)).toEqual({
      success: false,
      status: "not_permitted",
      error: "Movie Quota Exceeded",
    })
  })

  it("fails a 201 whose body is not a MediaRequest", async () => {
    mockFetch.mockResolvedValueOnce(respond(404)).mockResolvedValueOnce(respond(201, { message: "ok" }))

    expect(await submitOverseerrRequest(config, payload, member)).toEqual({
      success: false,
      error: "Overseerr sent an unexpected response",
      status: "failed",
    })
  })

  it("treats HTTP 409 as already requested", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, { mediaInfo: null })).mockResolvedValueOnce(respond(409))

    expect(await submitOverseerrRequest(config, payload, member)).toEqual({ success: true, status: "already_requested" })
  })

  it("fails with a fixed message, never the upstream body", async () => {
    mockFetch
      .mockResolvedValueOnce(respond(404))
      .mockResolvedValueOnce(respond(500, { message: "database at postgres://secret failed" }))

    expect(await submitOverseerrRequest(config, payload, member)).toEqual({
      success: false,
      error: "Overseerr returned HTTP 500",
      status: "failed",
    })
  })
})
