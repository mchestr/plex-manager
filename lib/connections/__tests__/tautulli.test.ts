/**
 * Tests for tautulliCommand, the one Tautulli client (P2.3: RWP-10, DUP-03).
 */

import { z } from "zod"

import { tautulliCommand, testTautulliConnection } from "@/lib/connections/tautulli"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const config = { url: "http://tautulli.local:8181/", apiKey: "secret key&cmd=x" }
const mockFetch = jest.fn()

function respond(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

beforeEach(() => {
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
})

describe("tautulliCommand", () => {
  it("builds the URL with URLSearchParams and returns the parsed data", async () => {
    mockFetch.mockResolvedValue(respond(200, { response: { result: "success", message: null, data: [{ user_id: 1 }] } }))

    const result = await tautulliCommand(config, "get_history", { user_id: 7, start: undefined, length: 1 }, z.array(z.unknown()))

    expect(result).toEqual({ ok: true, data: [{ user_id: 1 }] })
    const url = new URL(String(mockFetch.mock.calls[0][0]))
    expect(`${url.origin}${url.pathname}`).toBe("http://tautulli.local:8181/api/v2")
    expect(Object.fromEntries(url.searchParams)).toEqual({
      apikey: "secret key&cmd=x",
      cmd: "get_history",
      user_id: "7",
      length: "1",
    })
  })

  it("retries an HTTP 200 with result 'error' 3 times, then returns TAUTULLI_ERROR", async () => {
    mockFetch.mockResolvedValue(respond(200, { response: { result: "error", message: "Invalid apikey", data: {} } }))

    const result = await tautulliCommand(config, "get_home_stats", { stat_id: "top_users" }, z.unknown())

    expect(result).toEqual({ ok: false, code: "TAUTULLI_ERROR" })
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it("returns HTTP without retrying the 400 Tautulli sends for an unknown command", async () => {
    mockFetch.mockResolvedValue(respond(400, { response: { result: "error", message: "Unknown command" } }))

    const result = await tautulliCommand(config, "get_users", {}, z.unknown())

    expect(result).toEqual({ ok: false, code: "HTTP", status: 400 })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("recovers when a retry succeeds", async () => {
    mockFetch
      .mockResolvedValueOnce(respond(503, {}))
      .mockResolvedValueOnce(respond(200, { response: { result: "success", data: 5 } }))

    expect(await tautulliCommand(config, "get_users", {}, z.number())).toEqual({ ok: true, data: 5 })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it("returns INVALID_RESPONSE when data fails the schema", async () => {
    mockFetch.mockResolvedValue(respond(200, { response: { result: "success", data: { users: [] } } }))

    expect(await tautulliCommand(config, "get_users", {}, z.array(z.unknown()))).toEqual({
      ok: false,
      code: "INVALID_RESPONSE",
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})

describe("testTautulliConnection", () => {
  beforeEach(() => {
    jest.replaceProperty(process.env, "NODE_ENV", "production")
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("asks get_server_info once and reports a fixed message", async () => {
    mockFetch.mockResolvedValue(respond(200, { response: { result: "error", message: "Invalid apikey" } }))

    expect(await testTautulliConnection(config)).toEqual({ success: false, error: "Tautulli reported an error" })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(String(mockFetch.mock.calls[0][0])).toContain("cmd=get_server_info")
  })

  it("reports an invalid key from HTTP 401", async () => {
    mockFetch.mockResolvedValue(respond(401, {}))

    expect(await testTautulliConnection(config)).toEqual({ success: false, error: "Invalid API key" })
  })
})
