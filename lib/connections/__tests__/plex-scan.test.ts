/**
 * @jest-environment node
 */

/**
 * The folder scan after a deletion (TS 8.11 item 1): `GET` with `path`, one
 * `POST` on a 405, the refusals before any request, and no `DELETE`.
 */

import { readFileSync } from "node:fs"
import path from "node:path"

import { refreshPlexPath } from "@/lib/connections/plex-scan"

const config = { url: "https://plex.example.com:32400", token: "plex-token" }
const folder = "/data/movies/Example Movie (2001) & Friends"

interface Recorded {
  method: string
  url: URL
  headers: Record<string, string>
  body: string | undefined
  timeoutMs: number | undefined
}

const everyRequest: Recorded[] = []
let requests: Recorded[] = []
let timeouts: number[] = []
let timeoutNow = false
let statuses: number[] = []

beforeEach(() => {
  requests = []
  timeouts = []
  timeoutNow = false
  statuses = [200]
  jest.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
    timeouts.push(ms)
    return timeoutNow ? AbortSignal.abort(new DOMException("The operation timed out.", "TimeoutError")) : new AbortController().signal
  })
  jest.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request: Recorded = {
      method: init?.method ?? "GET",
      url: new URL(String(input)),
      headers: Object.fromEntries(new Headers(init?.headers)),
      body: typeof init?.body === "string" ? init.body : undefined,
      timeoutMs: timeouts.at(-1),
    }
    requests.push(request)
    everyRequest.push(request)
    if (init?.signal?.aborted) throw init.signal.reason
    const status = statuses[Math.min(requests.length - 1, statuses.length - 1)]
    return new Response(status === 200 ? "<MediaContainer size=\"0\" />" : "", { status })
  })
})

afterEach(() => jest.restoreAllMocks())

describe("refreshPlexPath", () => {
  it("sends GET /library/sections/{id}/refresh with the encoded folder, the token header and a 15 s budget", async () => {
    expect(await refreshPlexPath(config, "1", folder)).toEqual({ ok: true, data: null })

    expect(requests).toHaveLength(1)
    const [request] = requests
    expect(request.method).toBe("GET")
    expect(request.url.origin).toBe("https://plex.example.com:32400")
    expect(request.url.pathname).toBe("/library/sections/1/refresh")
    expect(request.url.search).toBe(`?path=${encodeURIComponent(folder)}`)
    expect(request.url.searchParams.get("path")).toBe(folder)
    expect(request.headers["x-plex-token"]).toBe("plex-token")
    expect(request.body).toBeUndefined()
    expect(request.timeoutMs).toBe(15_000)
  })

  it("sends POST exactly once when the GET answers 405", async () => {
    statuses = [405, 200]

    expect(await refreshPlexPath(config, "1", folder)).toEqual({ ok: true, data: null })
    expect(requests.map(({ method, url }) => `${method} ${url.pathname}${url.search}`)).toEqual([
      `GET /library/sections/1/refresh?path=${encodeURIComponent(folder)}`,
      `POST /library/sections/1/refresh?path=${encodeURIComponent(folder)}`,
    ])
  })

  it("stops after the one POST when it answers 405 too", async () => {
    statuses = [405]

    expect(await refreshPlexPath(config, "1", folder)).toEqual({ ok: false, code: "HTTP", status: 405 })
    expect(requests).toHaveLength(2)
  })

  it.each([401, 404, 500])("passes HTTP %i on with no second request", async (status) => {
    statuses = [status]

    expect(await refreshPlexPath(config, "1", folder)).toEqual({ ok: false, code: "HTTP", status })
    expect(requests).toHaveLength(1)
  })

  it("gives TIMEOUT when the budget runs out, with no fallback", async () => {
    timeoutNow = true

    expect(await refreshPlexPath(config, "1", folder)).toEqual({ ok: false, code: "TIMEOUT" })
    expect(requests).toHaveLength(1)
  })

  it("gives ABORTED when the job's signal aborts", async () => {
    const controller = new AbortController()
    controller.abort()

    expect(await refreshPlexPath(config, "1", folder, { signal: controller.signal })).toEqual({ ok: false, code: "ABORTED" })
  })

  it.each(["", "1/../2", "1?x=1", "one"])("refuses the section id %p before any request", async (sectionId) => {
    expect(await refreshPlexPath(config, sectionId, folder)).toEqual({ ok: false, code: "INVALID_KEY" })
    expect(requests).toHaveLength(0)
  })

  it.each(["", "   "])("refuses an empty folder %p, which would scan the whole section", async (empty) => {
    expect(await refreshPlexPath(config, "1", empty)).toEqual({ ok: false, code: "INVALID_PATH" })
    expect(requests).toHaveLength(0)
  })

  it("sent no DELETE and no trash route in any test of this file", () => {
    expect(everyRequest.length).toBeGreaterThan(5)
    expect(everyRequest.filter(({ method }) => method === "DELETE")).toHaveLength(0)
    expect(everyRequest.every(({ url }) => url.pathname.endsWith("/refresh"))).toBe(true)
  })

  it("names no retry helper and no trash route in the module source", () => {
    const source = readFileSync(path.join(__dirname, "..", "plex-scan.ts"), "utf8")

    expect(source).not.toMatch(/withRetry|emptyTrash/)
  })
})
