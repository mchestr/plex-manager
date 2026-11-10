/**
 * @jest-environment node
 */

/**
 * Tests for lib/connections/tautulli-history-all.ts: the whole history read
 * (TS 7.2.2 T1) and the pre-delete read (TS 8.8 row 4) against the
 * get_history fixture.
 */

import historyPage from "@/lib/cleanup/__tests__/fixtures/tautulli-history-page.json"
import type { HistoryRow, RecentHistoryRow } from "@/lib/cleanup/schema/upstream"
import { forEachHistoryRow } from "@/lib/connections/tautulli-history-all"

const CONFIG = { url: "http://tautulli.invalid:8181/", apiKey: "tautulli-key" }
const FIXTURE_ROWS = historyPage.response.data.data
const [MOVIE_ROW] = FIXTURE_ROWS

let fetchSpy: jest.SpyInstance
let timeouts: jest.SpyInstance

function envelope(data: unknown, result = "success"): Response {
  return new Response(JSON.stringify({ response: { result, message: null, data } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

/** `count` rows from row id `first`, as a datatables page out of `total`. */
function rows(first: number, count: number) {
  return Array.from({ length: count }, (_, i) => ({ ...MOVIE_ROW, row_id: first + i, reference_id: first + i }))
}

function params(call = -1): URLSearchParams {
  const [url] = fetchSpy.mock.calls.at(call) as [string]
  return new URL(url).searchParams
}

/** Answers each page from `answer(start, length)`. */
function serve(answer: (start: number, length: number) => unknown) {
  fetchSpy.mockImplementation(async (url: string) => {
    const query = new URL(url).searchParams
    return envelope(answer(Number(query.get("start")), Number(query.get("length"))))
  })
}

beforeEach(() => {
  fetchSpy = jest.spyOn(global, "fetch")
  timeouts = jest.spyOn(AbortSignal, "timeout")
})

afterEach(() => jest.restoreAllMocks())

describe("forEachHistoryRow, the library read (T1)", () => {
  it("sends the T1 parameters, 20 s a page, with the key in the query only", async () => {
    serve(() => historyPage.response.data)
    const seen: HistoryRow[] = []

    const result = await forEachHistoryRow(CONFIG, {}, (page) => {
      seen.push(...page)
    })

    expect(result).toEqual({ ok: true, data: { rows: 3, pages: 1, complete: true } })
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(new URL(url).pathname).toBe("/api/v2")
    expect(Object.fromEntries(params(0))).toEqual({
      apikey: "tautulli-key",
      cmd: "get_history",
      grouping: "1",
      include_archived: "1",
      include_activity: "0",
      order_column: "started",
      order_dir: "asc",
      start: "0",
      length: "1000",
    })
    expect(init.method).toBe("GET")
    expect(timeouts).toHaveBeenCalledWith(20_000)
    expect(seen.map((row) => row.row_id)).toEqual(["9001", "9002", "9003"])
  })

  it("drops the user, player and address of every row", async () => {
    serve(() => historyPage.response.data)
    const seen: HistoryRow[] = []

    await forEachHistoryRow(CONFIG, {}, (page) => {
      seen.push(...page)
    })

    expect(JSON.stringify(seen)).not.toMatch(/viewer-one|viewer-two|192\.0\.2\.|Living room|invented-player/)
  })

  it("pages with start until recordsFiltered, and drops a row repeated at a page edge", async () => {
    serve((start) => ({ recordsFiltered: 2500, recordsTotal: 2500, data: rows(start === 0 ? 1 : start, start === 2000 ? 500 : 1000) }))
    let count = 0

    const result = await forEachHistoryRow(CONFIG, {}, (page) => {
      count += page.length
    })

    expect(fetchSpy.mock.calls.map((_, i) => params(i).get("start"))).toEqual(["0", "1000", "2000"])
    // Page 2 starts at row id 1000, which page 1 already held.
    expect(result).toEqual({ ok: true, data: { rows: 2499, pages: 3, complete: true } })
    expect(count).toBe(2499)
  })

  it("ends at a short page of a flat array", async () => {
    serve(() => rows(1, 2))

    expect(await forEachHistoryRow(CONFIG, {}, () => undefined)).toEqual({ ok: true, data: { rows: 2, pages: 1, complete: true } })
  })

  it("ends at an empty page", async () => {
    serve(() => ({ recordsFiltered: 99999, data: [] }))

    expect(await forEachHistoryRow(CONFIG, {}, () => undefined)).toEqual({ ok: true, data: { rows: 0, pages: 1, complete: true } })
  })

  it("fails above 1 % bad rows", async () => {
    jest.replaceProperty(process.env, "NODE_ENV", "production")
    serve(() => ({ recordsFiltered: 100, data: [...rows(1, 98), { ...MOVIE_ROW, row_id: 99, started: "soon" }, { ...MOVIE_ROW, row_id: 100, stopped: "" }] }))

    expect(await forEachHistoryRow(CONFIG, {}, () => undefined)).toEqual({ ok: false, code: "ROWS_INVALID" })
  })

  it("fails on one bad row that names a title, and keeps going past a bad row that names none (correctness review C-08)", async () => {
    jest.replaceProperty(process.env, "NODE_ENV", "production")
    serve(() => ({ recordsFiltered: 301, data: [...rows(1, 300), { ...MOVIE_ROW, row_id: 301, started: "soon" }] }))
    expect(await forEachHistoryRow(CONFIG, {}, () => undefined)).toEqual({ ok: false, code: "ROWS_INVALID" })
    const nameless = { ...MOVIE_ROW, row_id: 301, rating_key: null, parent_rating_key: null, grandparent_rating_key: null, guid: "" }
    serve(() => ({ recordsFiltered: 301, data: [...rows(1, 300), nameless] }))
    expect(await forEachHistoryRow(CONFIG, {}, () => undefined)).toEqual({ ok: true, data: { rows: 300, pages: 1, complete: true } })
  })

  it("stops after 200 pages with PAGE_LIMIT", async () => {
    serve((start, length) => ({ recordsFiltered: 10_000_000, data: rows(start + 1, length) }))

    expect(await forEachHistoryRow(CONFIG, {}, () => undefined)).toEqual({ ok: false, code: "PAGE_LIMIT" })
    expect(fetchSpy).toHaveBeenCalledTimes(200)
  })

  it("reads the signal between pages", async () => {
    serve((start) => ({ recordsFiltered: 5000, data: rows(start + 1, 1000) }))
    const controller = new AbortController()

    const result = await forEachHistoryRow(CONFIG, {}, () => controller.abort(), { signal: controller.signal })

    expect(result).toEqual({ ok: false, code: "ABORTED" })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("returns TAUTULLI_ERROR when Tautulli answers with an error result", async () => {
    fetchSpy.mockImplementation(async () => envelope(null, "error"))

    expect(await forEachHistoryRow(CONFIG, {}, () => undefined, { attempts: 1 })).toEqual({ ok: false, code: "TAUTULLI_ERROR" })
  })
})

describe("forEachHistoryRow, the pre-delete read (TS 8.8 row 4)", () => {
  const query = { after: "2026-11-01", ratingKeys: { column: "rating_key", keys: ["101", "103"] } } as const

  it("sends include_activity=1, newest first by date, 25 rows from start 0, and the key filter", async () => {
    serve(() => ({ recordsFiltered: 3, data: FIXTURE_ROWS }))

    const result = await forEachHistoryRow(CONFIG, query, () => undefined)

    expect(result).toEqual({ ok: true, data: { rows: 3, pages: 1, complete: true } })
    expect(Object.fromEntries(params(0))).toEqual({
      apikey: "tautulli-key",
      cmd: "get_history",
      grouping: "1",
      include_archived: "1",
      include_activity: "1",
      order_column: "date",
      order_dir: "desc",
      after: "2026-11-01",
      rating_key: "101,103",
      start: "0",
      length: "25",
    })
    expect(timeouts).toHaveBeenCalledWith(10_000)
  })

  it.each(["parent_rating_key", "grandparent_rating_key"] as const)("filters by %s", async (column) => {
    serve(() => [])

    await forEachHistoryRow(CONFIG, { after: "2026-11-01", ratingKeys: { column, keys: ["201"] } }, () => undefined)

    expect(params(0).get(column)).toBe("201")
    expect(params(0).has("rating_key")).toBe(false)
  })

  it("keeps a live session row, whose row_id and stopped are null", async () => {
    const live = { ...MOVIE_ROW, row_id: null, reference_id: null, stopped: null, state: "playing", session_key: 21 }
    serve(() => ({ recordsFiltered: 1, data: [live] }))
    const seen: RecentHistoryRow[] = []

    await forEachHistoryRow(CONFIG, query, (page) => {
      seen.push(...page)
    })

    expect(seen).toEqual([expect.objectContaining({ row_id: null, stopped: null, rating_key: "101" })])
  })

  it("reads the next page while a page is full, whatever recordsFiltered says", async () => {
    serve((start) => ({ recordsFiltered: 25, data: start === 0 ? rows(1, 25) : rows(26, 3) }))

    const result = await forEachHistoryRow(CONFIG, query, () => undefined)

    expect(fetchSpy.mock.calls.map((_, i) => params(i).get("start"))).toEqual(["0", "25"])
    expect(result).toEqual({ ok: true, data: { rows: 28, pages: 2, complete: true } })
  })

  it("stops after 8 full pages with complete: false, and never asks for start=200", async () => {
    serve((start) => ({ recordsFiltered: 10_000, data: rows(start + 1, 25) }))

    const result = await forEachHistoryRow(CONFIG, query, () => undefined)

    expect(result).toEqual({ ok: true, data: { rows: 200, pages: 8, complete: false } })
    const starts = fetchSpy.mock.calls.map((_, i) => params(i).get("start"))
    expect(starts).toEqual(["0", "25", "50", "75", "100", "125", "150", "175"])
  })

  it("stops when onRows returns false", async () => {
    serve((start) => ({ recordsFiltered: 10_000, data: rows(start + 1, 25) }))

    expect(await forEachHistoryRow(CONFIG, query, () => false)).toEqual({ ok: true, data: { rows: 25, pages: 1, complete: true } })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("fails on one bad row, before the caller sees the page", async () => {
    jest.replaceProperty(process.env, "NODE_ENV", "production")
    serve(() => ({ recordsFiltered: 2, data: [MOVIE_ROW, { ...MOVIE_ROW, row_id: 2, user_id: "someone" }] }))
    const onRows = jest.fn()

    expect(await forEachHistoryRow(CONFIG, query, onRows)).toEqual({ ok: false, code: "ROWS_INVALID" })
    expect(onRows).not.toHaveBeenCalled()
  })

  it.each([
    ["no keys", { after: "2026-11-01", ratingKeys: { column: "rating_key" as const, keys: [] } }],
    ["a key that is not digits", { after: "2026-11-01", ratingKeys: { column: "rating_key" as const, keys: ["101", "1,2"] } }],
    ["a day that is not a day key", { after: "1 Nov", ratingKeys: { column: "rating_key" as const, keys: ["101"] } }],
  ])("refuses %s before any request, so it never reads every title", async (_label, bad) => {
    expect(await forEachHistoryRow(CONFIG, bad, () => undefined)).toEqual({ ok: false, code: "INVALID_KEY" })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("wraps each page call in the caller's run, with the caller's budget", async () => {
    serve((start) => ({ recordsFiltered: 30, data: start === 0 ? rows(1, 25) : rows(26, 5) }))
    let wrapped = 0
    const run = <R>(call: () => Promise<R>): Promise<R> => {
      wrapped += 1
      return call()
    }

    await forEachHistoryRow(CONFIG, query, () => undefined, { run, timeoutMs: 5000 })

    expect(wrapped).toBe(2)
    expect(timeouts).toHaveBeenCalledWith(5000)
  })
})
