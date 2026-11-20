/**
 * @jest-environment node
 */

/**
 * The Radarr writes of Media cleanup (TS 8.9): the exact request of each
 * call, the JSON content type on every body, the empty 200 body of a delete,
 * 404 as gone, and no retry or method fallback.
 */

import { readFileSync } from "node:fs"
import path from "node:path"

import { deleteRadarrMovie, deleteRadarrMovieFile, unmonitorRadarrMovie } from "@/lib/connections/radarr-write"

const config = { url: "http://radarr.example.com:7878", apiKey: "radarr-key" }

interface Recorded {
  method: string
  url: URL
  headers: Record<string, string>
  body: string | undefined
  timeoutMs: number | undefined
}

let requests: Recorded[] = []
let timeouts: number[] = []
let timeoutNow = false
let reply: () => Response = () => new Response("", { status: 200 })

beforeEach(() => {
  requests = []
  timeouts = []
  timeoutNow = false
  reply = () => new Response("", { status: 200 })
  jest.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
    timeouts.push(ms)
    return timeoutNow ? AbortSignal.abort(new DOMException("The operation timed out.", "TimeoutError")) : new AbortController().signal
  })
  jest.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    requests.push({
      method: init?.method ?? "GET",
      url: new URL(String(input)),
      headers: Object.fromEntries(new Headers(init?.headers)),
      body: typeof init?.body === "string" ? init.body : undefined,
      timeoutMs: timeouts.at(-1),
    })
    if (init?.signal?.aborted) throw init.signal.reason
    return reply()
  })
})

afterEach(() => jest.restoreAllMocks())

const status = (code: number) => () => new Response("", { status: code })

describe("deleteRadarrMovie", () => {
  it("sends DELETE /api/v3/movie/{id} with deleteFiles=true and the exclusion flag, and reads the empty 200 body", async () => {
    const result = await deleteRadarrMovie(config, 42, { importListExclusion: true })

    expect(result).toEqual({ ok: true, data: { gone: false } })
    expect(requests).toHaveLength(1)
    const [request] = requests
    expect(request.method).toBe("DELETE")
    expect(`${request.url.origin}${request.url.pathname}${request.url.search}`).toBe(
      "http://radarr.example.com:7878/api/v3/movie/42?deleteFiles=true&addImportExclusion=true"
    )
    expect(request.headers["x-api-key"]).toBe("radarr-key")
    expect(request.headers.accept).toBeUndefined()
    expect(request.body).toBeUndefined()
    expect(request.timeoutMs).toBe(60_000)
  })

  it("sends addImportExclusion=false when the rule adds no exclusion", async () => {
    await deleteRadarrMovie(config, 42, { importListExclusion: false })

    expect(requests[0].url.search).toBe("?deleteFiles=true&addImportExclusion=false")
  })

  it("gives gone on a 404 (a gone movie)", async () => {
    reply = status(404)

    expect(await deleteRadarrMovie(config, 42, { importListExclusion: false })).toEqual({ ok: true, data: { gone: true } })
  })

  it.each([401, 405, 500])("passes HTTP %i on, sent once", async (code) => {
    reply = status(code)

    expect(await deleteRadarrMovie(config, 42, { importListExclusion: false })).toEqual({ ok: false, code: "HTTP", status: code })
    expect(requests).toHaveLength(1)
  })
})

describe("unmonitorRadarrMovie", () => {
  it("sends PUT /api/v3/movie/editor with the JSON body and content type", async () => {
    reply = () => new Response(JSON.stringify([{ id: 42, monitored: false }]), { status: 200 })

    expect(await unmonitorRadarrMovie(config, 42)).toEqual({ ok: true, data: null })
    const [request] = requests
    expect(request.method).toBe("PUT")
    expect(request.url.pathname).toBe("/api/v3/movie/editor")
    expect(request.url.search).toBe("")
    expect(request.headers["content-type"]).toBe("application/json")
    expect(request.headers["x-api-key"]).toBe("radarr-key")
    expect(JSON.parse(request.body ?? "null")).toEqual({ movieIds: [42], monitored: false })
    expect(request.timeoutMs).toBe(60_000)
  })

  it.each([401, 404, 405, 415])("passes HTTP %i on, sent once", async (code) => {
    reply = status(code)

    expect(await unmonitorRadarrMovie(config, 42)).toEqual({ ok: false, code: "HTTP", status: code })
    expect(requests).toHaveLength(1)
  })
})

describe("deleteRadarrMovieFile", () => {
  it("sends DELETE /api/v3/moviefile/{id} and keeps the movie", async () => {
    expect(await deleteRadarrMovieFile(config, 7001)).toEqual({ ok: true, data: { gone: false } })
    expect(requests.map(({ method, url }) => `${method} ${url.pathname}${url.search}`)).toEqual(["DELETE /api/v3/moviefile/7001"])
    expect(requests[0].timeoutMs).toBe(60_000)
    expect(requests[0].body).toBeUndefined()
  })

  it("gives gone on a 404 (the file is gone)", async () => {
    reply = status(404)

    expect(await deleteRadarrMovieFile(config, 7001)).toEqual({ ok: true, data: { gone: true } })
  })

  it.each([401, 405])("passes HTTP %i on, sent once", async (code) => {
    reply = status(code)

    expect(await deleteRadarrMovieFile(config, 7001)).toEqual({ ok: false, code: "HTTP", status: code })
    expect(requests).toHaveLength(1)
  })
})

const everyCall: [string, (signal?: AbortSignal) => Promise<{ ok: boolean }>][] = [
  ["deleteRadarrMovie", (signal) => deleteRadarrMovie(config, 42, { importListExclusion: true, signal })],
  ["unmonitorRadarrMovie", (signal) => unmonitorRadarrMovie(config, 42, { signal })],
  ["deleteRadarrMovieFile", (signal) => deleteRadarrMovieFile(config, 7001, { signal })],
]

describe.each(everyCall)("%s", (name, call) => {
  it("gives TIMEOUT when the budget runs out, sent once", async () => {
    timeoutNow = true

    expect(await call()).toEqual({ ok: false, code: "TIMEOUT" })
    expect(requests).toHaveLength(1)
  })

  it("gives ABORTED when the job's signal aborts", async () => {
    const controller = new AbortController()
    controller.abort()

    expect(await call(controller.signal)).toEqual({ ok: false, code: "ABORTED" })
  })

  it("sends no retry after a 503", async () => {
    reply = status(503)

    expect(await call()).toEqual({ ok: false, code: "HTTP", status: 503 })
    expect(requests).toHaveLength(1)
  })

  it.each([0, -1, 1.5, Number.NaN])("refuses the id %p before any request", async (id) => {
    const calls: Record<string, () => Promise<{ ok: boolean }>> = {
      deleteRadarrMovie: () => deleteRadarrMovie(config, id, { importListExclusion: false }),
      unmonitorRadarrMovie: () => unmonitorRadarrMovie(config, id),
      deleteRadarrMovieFile: () => deleteRadarrMovieFile(config, id),
    }

    expect(await calls[name]()).toEqual({ ok: false, code: "INVALID_ID" })
    expect(requests).toHaveLength(0)
  })
})

it("sends the JSON content type on every call with a body", async () => {
  for (const [, call] of everyCall) await call()

  const withBody = requests.filter(({ body }) => body !== undefined)
  expect(withBody.length).toBeGreaterThan(0)
  for (const request of withBody) expect(request.headers["content-type"]).toBe("application/json")
})

it("names no retry helper in the module source", () => {
  const source = readFileSync(path.join(__dirname, "..", "radarr-write.ts"), "utf8")

  expect(source).not.toMatch(/withRetry/)
})
