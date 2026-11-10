/**
 * @jest-environment node
 */

/**
 * The Sonarr writes of Media cleanup (TS 8.9): the exact request of each
 * call, the JSON content type on every body, the loose series body sent back
 * unchanged, the bulk file delete in batches of 50, and no season pass call.
 */

import { readFileSync } from "node:fs"
import path from "node:path"

import {
  deleteSonarrEpisodeFiles,
  deleteSonarrSeries,
  putSonarrSeries,
  unmonitorSonarrEpisodes,
} from "@/lib/connections/sonarr-write"

const config = { url: "http://sonarr.example.com:8989", apiKey: "sonarr-key" }

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
    return new Response("", { status: statuses[Math.min(requests.length - 1, statuses.length - 1)] })
  })
})

afterEach(() => jest.restoreAllMocks())

const sent = () => requests.map(({ method, url }) => `${method} ${url.pathname}${url.search}`)
const bodies = () => requests.map(({ body }) => JSON.parse(body ?? "null"))

/** A full series as `getSonarrSeriesFull` gives it, with fields this code never names. */
const series = {
  id: 12,
  title: "Example Show",
  path: "/data/tv/Example Show",
  monitored: false,
  qualityProfileId: 4,
  seasonFolder: true,
  monitorNewItems: "none",
  tags: [3, 9],
  alternateTitles: [{ title: "Example Show (2009)", seasonNumber: -1 }],
  seasons: [
    { seasonNumber: 0, monitored: false, statistics: { episodeFileCount: 0, sizeOnDisk: 0 } },
    { seasonNumber: 1, monitored: false, statistics: { episodeFileCount: 10, sizeOnDisk: 12_000_000_000 } },
  ],
  addOptions: null,
}

describe("putSonarrSeries", () => {
  it("sends PUT /api/v3/series/{id} with the whole body unchanged and the JSON content type", async () => {
    statuses = [202]

    expect(await putSonarrSeries(config, series)).toEqual({ ok: true, data: null })
    expect(sent()).toEqual(["PUT /api/v3/series/12"])
    expect(requests[0].headers).toMatchObject({ "content-type": "application/json", "x-api-key": "sonarr-key" })
    expect(bodies()[0]).toEqual(series)
    expect(requests[0].body).toBe(JSON.stringify(series))
    expect(requests[0].timeoutMs).toBe(60_000)
  })

  it.each([401, 404, 405, 415, 500])("passes HTTP %i on, sent once", async (status) => {
    statuses = [status]

    expect(await putSonarrSeries(config, series)).toEqual({ ok: false, code: "HTTP", status })
    expect(requests).toHaveLength(1)
  })
})

describe("deleteSonarrSeries", () => {
  it("sends DELETE /api/v3/series/{id} with deleteFiles=true and the exclusion flag", async () => {
    expect(await deleteSonarrSeries(config, 12, { importListExclusion: true })).toEqual({ ok: true, data: null })
    expect(sent()).toEqual(["DELETE /api/v3/series/12?deleteFiles=true&addImportListExclusion=true"])
    expect(requests[0].body).toBeUndefined()
    expect(requests[0].headers.accept).toBeUndefined()
    expect(requests[0].timeoutMs).toBe(60_000)
  })

  it("sends addImportListExclusion=false when the rule adds no exclusion", async () => {
    await deleteSonarrSeries(config, 12, { importListExclusion: false })

    expect(requests[0].url.search).toBe("?deleteFiles=true&addImportListExclusion=false")
  })

  it.each([401, 404, 405, 500])("passes HTTP %i on for the caller's gone check, sent once", async (status) => {
    statuses = [status]

    expect(await deleteSonarrSeries(config, 12, { importListExclusion: false })).toEqual({ ok: false, code: "HTTP", status })
    expect(requests).toHaveLength(1)
  })
})

describe("unmonitorSonarrEpisodes", () => {
  it("sends PUT /api/v3/episode/monitor with the ids, monitored false and a 30 s budget", async () => {
    statuses = [202]

    expect(await unmonitorSonarrEpisodes(config, [501, 502, 502, 503])).toEqual({ ok: true, data: null })
    expect(sent()).toEqual(["PUT /api/v3/episode/monitor"])
    expect(requests[0].headers["content-type"]).toBe("application/json")
    expect(bodies()[0]).toEqual({ episodeIds: [501, 502, 503], monitored: false })
    expect(requests[0].timeoutMs).toBe(30_000)
  })

  it("sends nothing for an empty list", async () => {
    expect(await unmonitorSonarrEpisodes(config, [])).toEqual({ ok: true, data: null })
    expect(requests).toHaveLength(0)
  })

  it.each([401, 404, 405])("passes HTTP %i on, sent once", async (status) => {
    statuses = [status]

    expect(await unmonitorSonarrEpisodes(config, [501])).toEqual({ ok: false, code: "HTTP", status })
    expect(requests).toHaveLength(1)
  })
})

describe("deleteSonarrEpisodeFiles", () => {
  const ids = Array.from({ length: 120 }, (_, index) => 9000 + index)

  it("throws before any request on an empty list", async () => {
    await expect(deleteSonarrEpisodeFiles(config, [])).rejects.toThrow("at least one episode file id")
    expect(requests).toHaveLength(0)
  })

  it("sends DELETE /api/v3/episodefile/bulk with at most 50 ids per call and 300 s each", async () => {
    expect(await deleteSonarrEpisodeFiles(config, ids)).toEqual({ ok: true, data: { deleted: 120 } })

    expect(sent()).toEqual(Array(3).fill("DELETE /api/v3/episodefile/bulk"))
    expect(bodies()).toEqual([
      { episodeFileIds: ids.slice(0, 50) },
      { episodeFileIds: ids.slice(50, 100) },
      { episodeFileIds: ids.slice(100) },
    ])
    expect(requests.map(({ timeoutMs }) => timeoutMs)).toEqual([300_000, 300_000, 300_000])
    expect(requests.every(({ headers }) => headers["content-type"] === "application/json")).toBe(true)
  })

  it("sends a repeated id once", async () => {
    await deleteSonarrEpisodeFiles(config, [9000, 9001, 9000])

    expect(bodies()).toEqual([{ episodeFileIds: [9000, 9001] }])
  })

  it("stops at the first failed call", async () => {
    statuses = [200, 500]

    expect(await deleteSonarrEpisodeFiles(config, ids)).toEqual({ ok: false, code: "HTTP", status: 500 })
    expect(requests).toHaveLength(2)
  })

  it("gives TIMEOUT on a slow call and sends no later batch", async () => {
    timeoutNow = true

    expect(await deleteSonarrEpisodeFiles(config, ids)).toEqual({ ok: false, code: "TIMEOUT" })
    expect(requests).toHaveLength(1)
  })

  it.each([401, 404, 405])("passes HTTP %i on, sent once", async (status) => {
    statuses = [status]

    expect(await deleteSonarrEpisodeFiles(config, [9000])).toEqual({ ok: false, code: "HTTP", status })
    expect(requests).toHaveLength(1)
  })
})

const everyCall: [string, (signal?: AbortSignal) => Promise<{ ok: boolean }>][] = [
  ["putSonarrSeries", (signal) => putSonarrSeries(config, series, { signal })],
  ["deleteSonarrSeries", (signal) => deleteSonarrSeries(config, 12, { importListExclusion: false, signal })],
  ["unmonitorSonarrEpisodes", (signal) => unmonitorSonarrEpisodes(config, [501], { signal })],
  ["deleteSonarrEpisodeFiles", (signal) => deleteSonarrEpisodeFiles(config, [9000], { signal })],
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
    statuses = [503]

    expect(await call()).toEqual({ ok: false, code: "HTTP", status: 503 })
    expect(requests).toHaveLength(1)
  })

  it.each([0, -3, 2.5, Number.NaN])("refuses the id %p before any request", async (id) => {
    const calls: Record<string, () => Promise<{ ok: boolean }>> = {
      putSonarrSeries: () => putSonarrSeries(config, { ...series, id }),
      deleteSonarrSeries: () => deleteSonarrSeries(config, id, { importListExclusion: false }),
      unmonitorSonarrEpisodes: () => unmonitorSonarrEpisodes(config, [501, id]),
      deleteSonarrEpisodeFiles: () => deleteSonarrEpisodeFiles(config, [9000, id]),
    }

    expect(await calls[name]()).toEqual({ ok: false, code: "INVALID_ID" })
    expect(requests).toHaveLength(0)
  })
})

describe("every Sonarr write", () => {
  it("sends the JSON content type on each call with a body", async () => {
    for (const [, call] of everyCall) await call()

    const withBody = requests.filter(({ body }) => body !== undefined)
    expect(withBody).toHaveLength(3)
    for (const request of withBody) expect(request.headers["content-type"]).toBe("application/json")
  })

  it("never called the season pass route in any test of this file", () => {
    expect(everyRequest.length).toBeGreaterThan(20)
    expect(everyRequest.filter(({ url }) => /seasonpass/i.test(url.pathname))).toHaveLength(0)
  })

  it("names no retry helper and no season pass route in the module source", () => {
    const source = readFileSync(path.join(__dirname, "..", "sonarr-write.ts"), "utf8")

    expect(source).not.toMatch(/withRetry|seasonpass/i)
  })
})
