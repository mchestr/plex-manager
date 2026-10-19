/**
 * Tests for the Sonarr/Radarr helpers on serviceFetch (P2.3).
 */

import { arrGet, testArrConnection } from "@/lib/connections/arr-client"
import { getRadarrHistory } from "@/lib/connections/radarr"
import { getSonarrQueue, testSonarrConnection } from "@/lib/connections/sonarr"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const config = { url: "http://sonarr.local:8989", apiKey: "arr-key" }
const mockFetch = jest.fn()

function respond(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

beforeEach(() => {
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
})

describe("arrGet", () => {
  it("sends the key as a header and returns the JSON", async () => {
    mockFetch.mockResolvedValue(respond(200, [{ id: 1 }]))

    expect(await getSonarrQueue({ ...config, name: "Sonarr", publicUrl: undefined })).toEqual({
      success: true,
      data: [{ id: 1 }],
    })
    expect(mockFetch).toHaveBeenCalledWith(
      "http://sonarr.local:8989/api/v3/queue",
      expect.objectContaining({ headers: expect.objectContaining({ "X-Api-Key": "arr-key" }) })
    )
  })

  it("names the service in a fixed error message", async () => {
    mockFetch.mockResolvedValue(respond(503))

    expect(await arrGet("Radarr", config, "/api/v3/movie")).toEqual({ success: false, error: "Radarr returned HTTP 503" })
  })

  it("builds the Radarr history query", async () => {
    mockFetch.mockResolvedValue(respond(200, { records: [] }))

    await getRadarrHistory({ ...config, name: "Radarr", publicUrl: undefined }, 5, 9)

    expect(String(mockFetch.mock.calls[0][0])).toBe(
      "http://sonarr.local:8989/api/v3/history?pageSize=5&sortKey=date&sortDir=desc&movieId=9"
    )
  })
})

describe("testArrConnection", () => {
  beforeEach(() => {
    jest.replaceProperty(process.env, "NODE_ENV", "production")
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("passes for an object from system/status", async () => {
    mockFetch.mockResolvedValue(respond(200, { version: "4.0" }))

    expect(await testArrConnection("Sonarr", config)).toEqual({ success: true })
    expect(String(mockFetch.mock.calls[0][0])).toBe("http://sonarr.local:8989/api/v3/system/status")
  })

  it("maps 401 and 404 to the setup form's messages", async () => {
    mockFetch.mockResolvedValueOnce(respond(401)).mockResolvedValueOnce(respond(404))

    expect(await testSonarrConnection({ ...config, name: "Sonarr", publicUrl: undefined })).toEqual({
      success: false,
      error: "Invalid API key",
    })
    expect(await testArrConnection("Radarr", config)).toEqual({
      success: false,
      error: "Radarr server not found at this address",
    })
  })
})
