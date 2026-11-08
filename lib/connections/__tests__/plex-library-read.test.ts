/**
 * @jest-environment node
 */

/**
 * Tests for lib/connections/plex-library-read.ts: the Plex reads of media
 * cleanup (TS 7.2.2 P1, P3 to P8, A1, TS 8.8 row 3) against the fixtures of
 * lib/cleanup/__tests__/fixtures.
 */

import { z } from "zod"

import collectionItems from "@/lib/cleanup/__tests__/fixtures/plex-collection-items.json"
import collections from "@/lib/cleanup/__tests__/fixtures/plex-collections.json"
import metadata from "@/lib/cleanup/__tests__/fixtures/plex-metadata.json"
import moviesPage from "@/lib/cleanup/__tests__/fixtures/plex-movies-page.json"
import seasonChildren from "@/lib/cleanup/__tests__/fixtures/plex-season-children.json"
import sections from "@/lib/cleanup/__tests__/fixtures/plex-sections.json"
import { plexMovieRow, plexSeasonRow, type PlexMovieRow } from "@/lib/cleanup/schema/upstream"
import {
  forEachPlexRow,
  getPlexMetadata,
  listPlexCollectionItems,
  listPlexCollections,
  listPlexSeasonFiles,
  listPlexSections,
  PLEX_TYPE,
} from "@/lib/connections/plex-library-read"

const mockLog = jest.fn()
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => {
    const log = (...args: unknown[]) => mockLog(...args)
    return { debug: log, info: log, warn: log, error: log }
  },
}))

const CONFIG = { url: "http://plex.invalid:32400/", token: "owner-token" }
const ROW = z.object({ ratingKey: z.string() })

let fetchSpy: jest.SpyInstance
let timeouts: jest.SpyInstance

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

/** Answers every request with `answer(url, start)`, where `start` is the container start header. */
function serve(answer: (url: string, start: number) => Response | Promise<Response>) {
  fetchSpy.mockImplementation(async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>
    return answer(String(url), Number(headers["X-Plex-Container-Start"] ?? 0))
  })
}

function requests(): { url: string; method: string; headers: Record<string, string> }[] {
  return fetchSpy.mock.calls.map(([url, init]: [string, RequestInit]) => ({
    url: String(url),
    method: String(init.method),
    headers: init.headers as Record<string, string>,
  }))
}

/** A listing page of `count` synthetic rows from `start`, out of `total`. */
function page(start: number, count: number, total?: number) {
  const Metadata = Array.from({ length: count }, (_, i) => ({ ratingKey: String(start + i + 1), title: "Invented" }))
  return { MediaContainer: { size: count, ...(total === undefined ? {} : { totalSize: total }), Metadata } }
}

beforeEach(() => {
  fetchSpy = jest.spyOn(global, "fetch")
  timeouts = jest.spyOn(AbortSignal, "timeout")
  mockLog.mockReset()
})

afterEach(() => jest.restoreAllMocks())

describe("listPlexSections", () => {
  it("asks for the sections with the token in a header and a 15 s budget", async () => {
    serve(() => json(sections))

    const result = await listPlexSections(CONFIG)

    expect(result.ok && result.data.map((s) => s.key)).toEqual(["1", "2", "3", "4"])
    expect(requests()).toEqual([
      {
        url: "http://plex.invalid:32400/library/sections",
        method: "GET",
        headers: { Accept: "application/json", "X-Plex-Token": "owner-token" },
      },
    ])
    expect(timeouts).toHaveBeenCalledWith(15_000)
  })

  it("fails the read when a section row is bad (above 1 %)", async () => {
    jest.replaceProperty(process.env, "NODE_ENV", "production")
    const broken = structuredClone(sections)
    broken.MediaContainer.Directory[1].key = "not-digits"
    serve(() => json(broken))

    expect(await listPlexSections(CONFIG)).toEqual({ ok: false, code: "ROWS_INVALID" })
  })

  it("returns the failure of the request, with host and path only in the log", async () => {
    serve(() => json({}, 401))

    expect(await listPlexSections(CONFIG)).toEqual({ ok: false, code: "HTTP", status: 401 })
    expect(JSON.stringify(mockLog.mock.calls)).toContain("plex.invalid:32400/library/sections")
    expect(JSON.stringify(mockLog.mock.calls)).not.toContain("owner-token")
  })
})

describe("forEachPlexRow", () => {
  it("reads movies with their guids, a page of 500 at a time, 30 s a page", async () => {
    serve(() => json(moviesPage))
    const seen: PlexMovieRow[] = []

    const result = await forEachPlexRow(CONFIG, "1", PLEX_TYPE.movie, plexMovieRow, (rows) => {
      seen.push(...rows)
    })

    expect(result).toEqual({ ok: true, data: { rows: 3, pages: 1 } })
    expect(requests()[0]).toMatchObject({
      url: "http://plex.invalid:32400/library/sections/1/all?type=1&includeGuids=1",
      method: "GET",
      headers: { "X-Plex-Token": "owner-token", "X-Plex-Container-Start": "0", "X-Plex-Container-Size": "500" },
    })
    expect(timeouts).toHaveBeenCalledWith(30_000)
    expect(seen.map((row) => row.ratingKey)).toEqual(["101", "102", "103"])
    expect(seen[0]).not.toHaveProperty("summary")
    expect(JSON.stringify(seen)).not.toMatch(/Invented Actor|Invented Director/)
  })

  it.each([
    [PLEX_TYPE.show, "type=2&includeGuids=1", 30_000],
    [PLEX_TYPE.season, "type=3", 30_000],
    [PLEX_TYPE.episode, "type=4", 30_000],
    [PLEX_TYPE.collection, "type=18", 15_000],
  ])("asks type %s as %s with a %s ms budget", async (type, query, timeoutMs) => {
    serve(() => json(page(0, 0, 0)))

    await forEachPlexRow(CONFIG, "2", type, ROW, () => undefined)

    expect(requests()[0].url).toBe(`http://plex.invalid:32400/library/sections/2/all?${query}`)
    expect(timeouts).toHaveBeenCalledWith(timeoutMs)
  })

  it("pages with the container start until totalSize", async () => {
    serve((_url, start) => json(page(start, Math.min(500, 1200 - start), 1200)))
    const counts: number[] = []

    const result = await forEachPlexRow(CONFIG, "1", PLEX_TYPE.episode, ROW, (rows) => {
      counts.push(rows.length)
    })

    expect(result).toEqual({ ok: true, data: { rows: 1200, pages: 3 } })
    expect(counts).toEqual([500, 500, 200])
    expect(requests().map((r) => r.headers["X-Plex-Container-Start"])).toEqual(["0", "500", "1000"])
  })

  it("ends at a short page when Plex sends no totalSize", async () => {
    serve((_url, start) => json(page(start, start === 0 ? 500 : 20)))

    expect(await forEachPlexRow(CONFIG, "1", PLEX_TYPE.season, ROW, () => undefined)).toEqual({ ok: true, data: { rows: 520, pages: 2 } })
  })

  it("ends at an empty page", async () => {
    serve((_url, start) => json(page(start, start === 0 ? 500 : 0, 9999)))

    expect(await forEachPlexRow(CONFIG, "1", PLEX_TYPE.season, ROW, () => undefined)).toEqual({ ok: true, data: { rows: 500, pages: 2 } })
  })

  it("reads Directory rows when a listing has no Metadata", async () => {
    serve(() => json({ MediaContainer: { size: 1, totalSize: 1, Directory: [{ ratingKey: "9" }] } }))
    const seen: string[] = []

    await forEachPlexRow(CONFIG, "1", PLEX_TYPE.collection, ROW, (rows) => {
      seen.push(...rows.map((r) => r.ratingKey))
    })

    expect(seen).toEqual(["9"])
  })

  it("stops after 200 pages with PAGE_LIMIT", async () => {
    serve((_url, start) => json(page(start, 500, 10_000_000)))

    expect(await forEachPlexRow(CONFIG, "1", PLEX_TYPE.episode, ROW, () => undefined)).toEqual({ ok: false, code: "PAGE_LIMIT" })
    expect(fetchSpy).toHaveBeenCalledTimes(200)
  })

  it("reads the signal between pages and stops when it is aborted", async () => {
    serve((_url, start) => json(page(start, 500, 2000)))
    const controller = new AbortController()

    const result = await forEachPlexRow(CONFIG, "1", PLEX_TYPE.episode, ROW, () => controller.abort(), { signal: controller.signal })

    expect(result).toEqual({ ok: false, code: "ABORTED" })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("stops when onRows returns false", async () => {
    serve((_url, start) => json(page(start, 500, 2000)))

    expect(await forEachPlexRow(CONFIG, "1", PLEX_TYPE.episode, ROW, () => false)).toEqual({ ok: true, data: { rows: 500, pages: 1 } })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("drops one bad row in a hundred, and fails above 1 %", async () => {
    jest.replaceProperty(process.env, "NODE_ENV", "production")
    const withBad = (bad: number) => {
      const body = page(0, 100, 100)
      for (let i = 0; i < bad; i++) body.MediaContainer.Metadata[i].ratingKey = "bad key"
      return body
    }

    serve(() => json(withBad(1)))
    expect(await forEachPlexRow(CONFIG, "1", PLEX_TYPE.season, plexSeasonRow.pick({ ratingKey: true }), () => undefined)).toEqual({
      ok: true,
      data: { rows: 99, pages: 1 },
    })

    serve(() => json(withBad(2)))
    expect(await forEachPlexRow(CONFIG, "1", PLEX_TYPE.season, ROW.extend({ ratingKey: z.string().regex(/^\d+$/) }), () => undefined)).toEqual({
      ok: false,
      code: "ROWS_INVALID",
    })
  })

  it("wraps each page call in the caller's run", async () => {
    serve((_url, start) => json(page(start, Math.min(500, 700 - start), 700)))
    let wrapped = 0
    const run = <R>(call: () => Promise<R>): Promise<R> => {
      wrapped += 1
      return call()
    }

    await forEachPlexRow(CONFIG, "1", PLEX_TYPE.episode, ROW, () => undefined, { run })

    expect(wrapped).toBe(2)
  })

  it("retries a 5xx page and then gives up with its status", async () => {
    serve(() => json({}, 503))

    expect(await forEachPlexRow(CONFIG, "1", PLEX_TYPE.movie, ROW, () => undefined)).toEqual({ ok: false, code: "HTTP", status: 503 })
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it("takes one attempt and the given budget when asked", async () => {
    serve(() => json({}, 503))

    await forEachPlexRow(CONFIG, "1", PLEX_TYPE.movie, ROW, () => undefined, { attempts: 1, timeoutMs: 60_000 })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(timeouts).toHaveBeenCalledWith(60_000)
  })

  it.each(["", "1/../2", "1?x=1", "abc"])("refuses the section id %p before any request", async (sectionId) => {
    expect(await forEachPlexRow(CONFIG, sectionId, PLEX_TYPE.movie, ROW, () => undefined)).toEqual({ ok: false, code: "INVALID_KEY" })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe("listPlexCollections", () => {
  it("lists a section's collections, smart ones included", async () => {
    serve(() => json(collections))

    const result = await listPlexCollections(CONFIG, "1")

    expect(result).toEqual({
      ok: true,
      data: [
        { ratingKey: "501", title: "Leaving soon", childCount: 1, smart: false },
        { ratingKey: "502", title: "Recently added", childCount: 12, smart: 1 },
      ],
    })
    expect(requests()[0].url).toBe("http://plex.invalid:32400/library/sections/1/all?type=18")
  })

  it("returns a failed page", async () => {
    serve(() => json({}, 404))

    expect(await listPlexCollections(CONFIG, "1")).toEqual({ ok: false, code: "HTTP", status: 404 })
  })
})

describe("listPlexCollectionItems", () => {
  it("lists every member with the container headers and a 15 s budget", async () => {
    serve(() => json(collectionItems))

    expect(await listPlexCollectionItems(CONFIG, "501")).toEqual({ ok: true, data: [{ ratingKey: "101", type: "movie" }] })
    expect(requests()[0]).toMatchObject({
      url: "http://plex.invalid:32400/library/collections/501/items",
      method: "GET",
      headers: { "X-Plex-Container-Start": "0", "X-Plex-Container-Size": "500" },
    })
    expect(timeouts).toHaveBeenCalledWith(15_000)
  })

  it("refuses a collection id that is not digits", async () => {
    expect(await listPlexCollectionItems(CONFIG, "501/../9")).toEqual({ ok: false, code: "INVALID_KEY" })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe("getPlexMetadata", () => {
  it("reads one item with its section and files, 10 s", async () => {
    serve(() => json(metadata))

    const result = await getPlexMetadata(CONFIG, "101")

    expect(result.ok && result.data).toMatchObject({ ratingKey: "101", type: "movie", librarySectionID: "1", title: "The Lantern Keeper" })
    expect(requests()[0]).toMatchObject({ url: "http://plex.invalid:32400/library/metadata/101", method: "GET" })
    expect(timeouts).toHaveBeenCalledWith(10_000)
  })

  it("reports a missing item as HTTP 404", async () => {
    serve(() => json({}, 404))

    expect(await getPlexMetadata(CONFIG, "101")).toEqual({ ok: false, code: "HTTP", status: 404 })
  })

  it("refuses a rating key that is not digits", async () => {
    expect(await getPlexMetadata(CONFIG, "../library/sections")).toEqual({ ok: false, code: "INVALID_KEY" })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe("listPlexSeasonFiles", () => {
  it("returns the set of the season's episode files (A1)", async () => {
    serve(() => json(seasonChildren))

    const result = await listPlexSeasonFiles(CONFIG, "301")

    expect(result).toEqual({
      ok: true,
      data: new Set([
        "/data/tv/Paper Moon Station/Season 01/Paper Moon Station - S01E01.mkv",
        "/data/tv/Paper Moon Station/Season 01/Paper Moon Station - S01E02.mkv",
      ]),
    })
    expect(requests()[0]).toMatchObject({ url: "http://plex.invalid:32400/library/metadata/301/children", method: "GET" })
    expect(timeouts).toHaveBeenCalledWith(10_000)
  })

  it("fails on any bad episode row, so no file is ever left out", async () => {
    const broken = structuredClone(seasonChildren)
    broken.MediaContainer.Metadata[1].ratingKey = "bad key"
    serve(() => json(broken))

    expect(await listPlexSeasonFiles(CONFIG, "301")).toEqual({ ok: false, code: "INVALID_RESPONSE" })
  })

  it("refuses a season key that is not digits", async () => {
    expect(await listPlexSeasonFiles(CONFIG, "30 1")).toEqual({ ok: false, code: "INVALID_KEY" })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

it("only ever sends GET", async () => {
  serve((url, start) => (url.includes("/library/sections?") || url.endsWith("/library/sections") ? json(sections) : json(page(start, 0, 0))))

  await listPlexSections(CONFIG)
  await forEachPlexRow(CONFIG, "1", PLEX_TYPE.movie, ROW, () => undefined)
  await listPlexCollections(CONFIG, "1")
  await listPlexCollectionItems(CONFIG, "1")

  expect(new Set(requests().map((r) => r.method))).toEqual(new Set(["GET"]))
})
