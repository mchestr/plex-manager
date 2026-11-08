/**
 * @jest-environment node
 */

/**
 * Tests for lib/connections/plex-playing.ts: what plays now, for the last
 * pre-delete check (TS 8.8 row 7), against the sessions fixture.
 */

import sessions from "@/lib/cleanup/__tests__/fixtures/plex-sessions.json"
import { readPlayingKeys } from "@/lib/connections/plex-playing"

const CONFIG = { url: "http://plex.invalid:32400", token: "owner-token" }

let fetchSpy: jest.SpyInstance
let timeouts: jest.SpyInstance

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

beforeEach(() => {
  fetchSpy = jest.spyOn(global, "fetch")
  timeouts = jest.spyOn(AbortSignal, "timeout")
})

afterEach(() => jest.restoreAllMocks())

describe("readPlayingKeys", () => {
  it("reads /status/sessions with the token in a header and a 10 s budget", async () => {
    fetchSpy.mockResolvedValue(json(sessions))

    await readPlayingKeys(CONFIG)

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("http://plex.invalid:32400/status/sessions")
    expect(init.method).toBe("GET")
    expect(init.headers).toEqual({ Accept: "application/json", "X-Plex-Token": "owner-token" })
    expect(timeouts).toHaveBeenCalledWith(10_000)
  })

  it("gives every item, season and show key that plays, and no key that is not digits", async () => {
    fetchSpy.mockResolvedValue(json(sessions))

    const result = await readPlayingKeys(CONFIG)

    expect(result).toEqual({ ok: true, data: new Set(["101", "402", "301", "201"]) })
  })

  it("gives an empty set when nothing plays", async () => {
    fetchSpy.mockResolvedValue(json({ MediaContainer: { size: 0 } }))

    expect(await readPlayingKeys(CONFIG)).toEqual({ ok: true, data: new Set() })
  })

  it("fails on an answer of another shape, so the caller defers", async () => {
    fetchSpy.mockResolvedValue(json({ MediaContainer: { Metadata: [{ ratingKey: { nested: true } }] } }))

    expect(await readPlayingKeys(CONFIG)).toEqual({ ok: false, code: "INVALID_RESPONSE" })
  })

  it("returns an HTTP failure, after the retries of a 5xx", async () => {
    fetchSpy.mockImplementation(async () => json({}, 502))

    expect(await readPlayingKeys(CONFIG, { attempts: 2 })).toEqual({ ok: false, code: "HTTP", status: 502 })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it("passes the caller's signal and budget, inside the caller's run", async () => {
    fetchSpy.mockImplementation(async (_url: string, init: RequestInit) => {
      if (init.signal?.aborted) throw new DOMException("This operation was aborted", "AbortError")
      return json(sessions)
    })
    const controller = new AbortController()
    let wrapped = 0
    const run = <R>(call: () => Promise<R>): Promise<R> => {
      wrapped += 1
      return call()
    }

    controller.abort()
    expect(await readPlayingKeys(CONFIG, { signal: controller.signal, run, timeoutMs: 2000 })).toEqual({ ok: false, code: "ABORTED" })
    expect(wrapped).toBe(1)
    expect(timeouts).toHaveBeenCalledWith(2000)
  })
})
