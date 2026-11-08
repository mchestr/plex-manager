/**
 * @jest-environment node
 */

/**
 * Tests for lib/connections/overseerr-cleanup.ts: every request (TS 7.2.2
 * O2), the newest requests of the act step (TS 8.8 step 5.4) and the
 * availability sync (TS 8.11 item 2), against the Seerr fixtures.
 */

import requestPage from "@/lib/cleanup/__tests__/fixtures/seerr-request-page.json"
import type { SeerrRequest } from "@/lib/cleanup/schema/upstream"
import { forEachRequest, runOverseerrJob } from "@/lib/connections/overseerr-cleanup"

const CONFIG = { url: "http://seerr.invalid:5055/", apiKey: "seerr-key" }
const [MOVIE_REQUEST] = requestPage.results

let fetchSpy: jest.SpyInstance
let timeouts: jest.SpyInstance

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

/** Requests `first` to `first + count - 1`, each created a day after the one before. */
function requests(first: number, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    ...MOVIE_REQUEST,
    id: first + i,
    createdAt: new Date(Date.UTC(2024, 0, first + i)).toISOString(),
  }))
}

function page(results: unknown[], current: number, pages: number) {
  return { pageInfo: { pages, pageSize: 100, results: pages * 100, page: current }, results }
}

function query(call = -1): URLSearchParams {
  const [url] = fetchSpy.mock.calls.at(call) as [string]
  return new URL(url).searchParams
}

/** Answers each page from `answer(skip)`. */
function serve(answer: (skip: number) => unknown) {
  fetchSpy.mockImplementation(async (url: string) => json(answer(Number(new URL(url).searchParams.get("skip")))))
}

beforeEach(() => {
  fetchSpy = jest.spyOn(global, "fetch")
  timeouts = jest.spyOn(AbortSignal, "timeout")
})

afterEach(() => jest.restoreAllMocks())

describe("forEachRequest (O2)", () => {
  it("asks for every request, oldest first, 100 a page, 20 s a page", async () => {
    serve(() => requestPage)
    const seen: SeerrRequest[] = []

    const result = await forEachRequest(CONFIG, (rows) => {
      seen.push(...rows)
    })

    expect(result).toEqual({ ok: true, data: { rows: 3, pages: 1 } })
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(new URL(url).pathname).toBe("/api/v1/request")
    expect(Object.fromEntries(query(0))).toEqual({ take: "100", skip: "0", sort: "added", sortDirection: "asc", filter: "all" })
    expect(init).toMatchObject({ method: "GET", headers: { Accept: "application/json", "X-Api-Key": "seerr-key" } })
    expect(timeouts).toHaveBeenCalledWith(20_000)
    expect(seen.map((r) => [r.id, r.status])).toEqual([
      [61, 2],
      [62, 2],
      [63, 3],
    ])
    expect(JSON.stringify(seen)).not.toMatch(/example\.test|viewer-one|plexUsername|avatar/)
  })

  it("pages with skip until the last page, and drops a repeated request id", async () => {
    serve((skip) => (skip === 0 ? page(requests(1, 100), 1, 3) : skip === 100 ? page(requests(100, 100), 2, 3) : page(requests(200, 10), 3, 3)))
    let count = 0

    const result = await forEachRequest(CONFIG, (rows) => {
      count += rows.length
    })

    expect(fetchSpy.mock.calls.map((_, i) => query(i).get("skip"))).toEqual(["0", "100", "200"])
    expect(result).toEqual({ ok: true, data: { rows: 209, pages: 3 } })
    expect(count).toBe(209)
  })

  it("ends at an empty page", async () => {
    serve(() => page([], 1, 5))

    expect(await forEachRequest(CONFIG, () => undefined)).toEqual({ ok: true, data: { rows: 0, pages: 1 } })
  })

  it("fails above 1 % bad rows", async () => {
    jest.replaceProperty(process.env, "NODE_ENV", "production")
    serve(() => page([...requests(1, 50), { ...MOVIE_REQUEST, id: 99, type: "music" }], 1, 1))

    expect(await forEachRequest(CONFIG, () => undefined)).toEqual({ ok: false, code: "ROWS_INVALID" })
  })

  it("stops after 200 pages with PAGE_LIMIT", async () => {
    serve((skip) => page(requests(skip + 1, 100), skip / 100 + 1, 100_000))

    expect(await forEachRequest(CONFIG, () => undefined)).toEqual({ ok: false, code: "PAGE_LIMIT" })
    expect(fetchSpy).toHaveBeenCalledTimes(200)
  })

  it("reads the signal between pages", async () => {
    serve((skip) => page(requests(skip + 1, 100), skip / 100 + 1, 9))
    const controller = new AbortController()

    expect(await forEachRequest(CONFIG, () => controller.abort(), { signal: controller.signal })).toEqual({ ok: false, code: "ABORTED" })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("stops when onRows returns false", async () => {
    serve((skip) => page(requests(skip + 1, 100), skip / 100 + 1, 9))

    expect(await forEachRequest(CONFIG, () => false)).toEqual({ ok: true, data: { rows: 100, pages: 1 } })
  })

  it("returns a failed page", async () => {
    fetchSpy.mockImplementation(async () => json({ message: "Unauthorized" }, 403))

    expect(await forEachRequest(CONFIG, () => undefined)).toEqual({ ok: false, code: "HTTP", status: 403 })
  })
})

describe("forEachRequest with until (TS 8.8 step 5.4)", () => {
  it("reads newest first and stops at the first request older than until", async () => {
    // Newest first: ids 300 down to 101 over two pages.
    const newestFirst = requests(101, 200).reverse()
    serve((skip) => page(newestFirst.slice(skip, skip + 100), skip / 100 + 1, 2))
    const until = new Date(Date.UTC(2024, 0, 250))
    const seen: SeerrRequest[] = []

    const result = await forEachRequest(
      CONFIG,
      (rows) => {
        seen.push(...rows)
      },
      { until }
    )

    expect(query(0).get("sortDirection")).toBe("desc")
    expect(query(0).get("sort")).toBe("added")
    expect(seen.map((r) => r.id)).toEqual(Array.from({ length: 51 }, (_, i) => 300 - i))
    expect(result).toEqual({ ok: true, data: { rows: 51, pages: 1 } })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("takes until as epoch milliseconds, and keeps a request whose date does not parse", async () => {
    serve(() => page([{ ...MOVIE_REQUEST, id: 1, createdAt: "sometime" }, ...requests(2, 1)], 1, 1))

    const seen: number[] = []
    const collect = (rows: SeerrRequest[]) => {
      seen.push(...rows.map((r) => r.id))
    }
    await forEachRequest(CONFIG, collect, { until: Date.UTC(2030, 0, 1) })

    expect(seen).toEqual([1])
  })
})

describe("runOverseerrJob", () => {
  it("starts the availability sync with one POST and no body", async () => {
    fetchSpy.mockResolvedValue(json({ id: "availability-sync", name: "Media Availability Sync", running: true }))

    expect(await runOverseerrJob(CONFIG, "availability-sync")).toEqual({ ok: true, data: null })
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("http://seerr.invalid:5055/api/v1/settings/jobs/availability-sync/run")
    expect(init).toMatchObject({ method: "POST", headers: { "X-Api-Key": "seerr-key" } })
    expect(init.body).toBeUndefined()
    expect(timeouts).toHaveBeenCalledWith(15_000)
  })

  it("never retries the POST", async () => {
    fetchSpy.mockImplementation(async () => json({}, 503))

    expect(await runOverseerrJob(CONFIG, "availability-sync")).toEqual({ ok: false, code: "HTTP", status: 503 })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("runs inside the caller's run", async () => {
    fetchSpy.mockResolvedValue(json({}))
    let wrapped = 0
    const run = <R>(call: () => Promise<R>): Promise<R> => {
      wrapped += 1
      return call()
    }

    await runOverseerrJob(CONFIG, "availability-sync", { run })

    expect(wrapped).toBe(1)
  })
})

it("only ever sends GET and POST", async () => {
  fetchSpy.mockImplementation(async () => json(requestPage))

  await forEachRequest(CONFIG, () => undefined)
  await forEachRequest(CONFIG, () => undefined, { until: 0 })
  await runOverseerrJob(CONFIG, "availability-sync")

  const methods = fetchSpy.mock.calls.map(([, init]: [string, RequestInit]) => init.method)
  expect(new Set(methods)).toEqual(new Set(["GET", "POST"]))
})
