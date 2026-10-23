/**
 * @jest-environment node
 */

/**
 * Contract tests for the watchlist sync (P11.28, GAP-02, GAP-03): the real
 * Plex discover client, Overseerr client and `serviceFetch` run against
 * recorded responses in `./fixtures/`, behind a fake `fetch`. Only Prisma
 * (an in-memory history) and the access check are stubbed.
 *
 * Fixtures: `watchlist-p1.json` and `watchlist-p2.json` (`totalSize: 140`,
 * one collection that is never requested), `metadata-<ratingKey>.json` for a
 * film, a show and a film Plex cannot match, and Overseerr's replies to
 * `POST /api/v1/request` (201, 202, 403, 409, 500). Tokens are removed. The
 * discover API is undocumented: re-record them if Plex changes the shape.
 */

import { readFileSync } from "node:fs"
import path from "node:path"
import { mockReset } from "jest-mock-extended"

import { buildConfig } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getAccessLevel } from "@/lib/access"
import { clearOverseerrUserIndexCache } from "@/lib/connections/overseerr"
import { syncUserWatchlist } from "@/lib/watchlist/sync-service"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/access", () => ({ ...jest.requireActual("@/lib/access"), getAccessLevel: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const fixture = <T = unknown>(name: string): T =>
  JSON.parse(readFileSync(path.join(__dirname, "fixtures", name), "utf8")) as T

interface Listed {
  ratingKey: string
  type: string
  title: string
}
type Page = { MediaContainer: { Metadata: Listed[] } }

const PAGE_1 = fixture<Page>("watchlist-p1.json")
const PAGE_2 = fixture<Page>("watchlist-p2.json")
const LISTED = [...PAGE_1.MediaContainer.Metadata, ...PAGE_2.MediaContainer.Metadata]
const KEY = LISTED.map((item) => item.ratingKey)
const FILM_603 = KEY[0] // metadata fixture: tmdb://603
const SHOW_1396 = KEY[2] // metadata fixture: tmdb://1396, tvdb://81189
const UNMATCHED = KEY[3] // metadata fixture: no Guid
const ETAG = 'W/"watchlist-1"'

type Reply = { status: number; body?: unknown; headers?: Record<string, string> }
const reply = ({ status, body, headers }: Reply) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  })
const overseerrReply = (status: 201 | 202 | 403 | 409 | 500): Reply => ({
  status,
  body: fixture(`overseerr-request-${status}.json`),
})

interface Call {
  url: URL
  method: string
  headers: Record<string, string>
  body?: unknown
}
let calls: Call[] = []
/** Overseerr's answer to a POST, by TMDB id; 201 by default. */
let postReply: (tmdbId: number) => Reply
/** Overseerr's media status for a TMDB id; 404 (unknown) by default. */
let mediaReply: (tmdbId: number) => Reply

/** TMDB ids for the items without a metadata fixture. */
function syntheticMetadata(ratingKey: string) {
  return { MediaContainer: { size: 1, Metadata: [{ ratingKey, Guid: [{ id: `tmdb://${10_000 + KEY.indexOf(ratingKey)}` }] }] } }
}

function route(call: Call): Reply {
  const { url, method, headers } = call
  if (url.host === "plex.tv") return { status: 200, body: { id: 1 } }
  if (url.host === "discover.provider.plex.tv") {
    if (url.pathname === "/library/sections/watchlist/all") {
      if (headers["If-None-Match"] === ETAG) return { status: 304 }
      const page = headers["X-Plex-Container-Start"] === "0" ? PAGE_1 : PAGE_2
      return { status: 200, body: page, headers: { ETag: ETAG } }
    }
    const key = url.pathname.replace("/library/metadata/", "")
    try {
      return { status: 200, body: fixture(`metadata-${key}.json`) }
    } catch {
      return { status: 200, body: syntheticMetadata(key) }
    }
  }
  if (url.pathname === "/api/v1/user") {
    return { status: 200, body: { pageInfo: { page: 1, pages: 1 }, results: [{ id: 7, plexId: 4815162 }] } }
  }
  if (method === "POST") return postReply((call.body as { mediaId: number }).mediaId)
  return mediaReply(Number(url.pathname.split("/").pop()))
}

type HistoryRow = Record<string, unknown> & { plexRatingKey: string; status: string }
let history: Map<string, HistoryRow>
let settings: { watchlistEtag: string | null; lastSyncStatus?: string; lastSyncError?: string | null }

const definedOnly = (data: object) => Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))

beforeAll(() => {
  process.env.PLEX_CLIENT_IDENTIFIER = "test-client"
})

beforeEach(() => {
  mockReset(prismaMock)
  clearOverseerrUserIndexCache()
  calls = []
  history = new Map()
  settings = { watchlistEtag: null }
  let nextId = 500
  postReply = () => ({ status: 201, body: { ...fixture<object>("overseerr-request-201.json"), id: nextId++ } })
  mediaReply = () => ({ status: 404, body: { message: "Unable to retrieve movie." } })

  global.fetch = jest.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const call: Call = {
      url: new URL(String(input)),
      method: init.method ?? "GET",
      headers: { ...(init.headers as Record<string, string>) },
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    }
    calls.push(call)
    return reply(route(call))
  }) as typeof fetch

  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ watchlistSyncEnabled: true }))
  prismaMock.user.findUnique.mockResolvedValue({
    id: "member-1",
    plexUserId: "4815162",
    plexAuthToken: "plex-token",
    watchlistSyncSettings: { syncEnabled: true },
  } as never)
  prismaMock.overseerr.findFirst.mockResolvedValue({ url: "http://overseerr.local", apiKey: "key" } as never)
  jest.mocked(getAccessLevel).mockResolvedValue("full")

  prismaMock.watchlistSyncSettings.findUnique.mockImplementation((async () => ({ ...settings })) as never)
  prismaMock.watchlistSyncSettings.upsert.mockImplementation((async ({ update }: { update: object }) => {
    Object.assign(settings, definedOnly(update))
    return {}
  }) as never)
  prismaMock.watchlistSyncHistory.findMany.mockImplementation((async () =>
    [...history.values()].map((row) => ({ tmdbId: null, tvdbId: null, imdbId: null, ...row }))) as never)
  prismaMock.watchlistSyncHistory.upsert.mockImplementation((async ({
    create,
    update,
  }: {
    create: HistoryRow
    update: object
  }) => {
    const existing = history.get(create.plexRatingKey)
    const row = existing ? { ...existing, ...definedOnly(update) } : (definedOnly(create) as HistoryRow)
    history.set(create.plexRatingKey, row)
    return row
  }) as never)
  // markRemovedItems (P11.14): rows whose key is missing from a complete read
  prismaMock.watchlistSyncHistory.updateMany.mockImplementation((async ({
    where,
    data,
  }: {
    where: { plexRatingKey: { notIn: string[] } }
    data: { status: HistoryRow["status"] }
  }) => {
    let count = 0
    for (const row of history.values()) {
      if (where.plexRatingKey.notIn.includes(row.plexRatingKey) || row.status === data.status) continue
      row.status = data.status
      count += 1
    }
    return { count }
  }) as never)
})

/** Mark every item but `keys` as handled by an earlier run. */
function onlyNew(keys: string[]) {
  for (const [index, key] of KEY.entries()) {
    if (keys.includes(key)) continue
    history.set(key, { plexRatingKey: key, status: "ALREADY_AVAILABLE", tmdbId: 10_000 + index })
  }
}

const discoverCalls = () => calls.filter((call) => call.url.host === "discover.provider.plex.tv")
const listingCalls = () => discoverCalls().filter((call) => call.url.pathname.endsWith("/watchlist/all"))
const metadataCalls = () => discoverCalls().filter((call) => call.url.pathname.startsWith("/library/metadata/"))
const posts = () => calls.filter((call) => call.method === "POST")

describe("watchlist sync against recorded responses", () => {
  it("reads both pages, looks up each new item once and requests only new items", async () => {
    const fresh = KEY.slice(0, 10) // includes the collection at index 7
    onlyNew(fresh)

    const result = await syncUserWatchlist("member-1")

    expect(listingCalls().map((call) => call.headers["X-Plex-Container-Start"])).toEqual(["0", "100"])
    expect(listingCalls()[0].headers["X-Plex-Container-Size"]).toBe("100")
    expect(listingCalls()[0].url.search).toBe("?includeCollections=1&includeExternalMedia=1")
    expect(metadataCalls()).toHaveLength(9)
    expect(posts()).toHaveLength(8)
    expect(result).toMatchObject({ success: true, data: { itemsRequested: 8, itemsSkipped: 1, itemsFailed: 0 } })
    expect(history.get(UNMATCHED)).toMatchObject({ status: "SKIPPED_NO_EXTERNAL_ID", tmdbId: null })
    expect(history.get(SHOW_1396)).toMatchObject({ status: "REQUESTED", tmdbId: 1396, tvdbId: 81189 })
    expect(history.has(KEY[7])).toBe(false)
    expect(settings).toMatchObject({ lastSyncStatus: "success", watchlistEtag: ETAG })
  })

  it("sends seasons: 'all' with a TV request, and none with a film", async () => {
    onlyNew([FILM_603, SHOW_1396])

    await syncUserWatchlist("member-1")

    expect(posts().map((call) => call.body)).toEqual([
      { mediaType: "movie", mediaId: 603 },
      { mediaType: "tv", mediaId: 1396, seasons: "all" },
    ])
    expect(posts()[0].headers["X-Api-User"]).toBe("7")
  })

  it("uses the stored IDs on a second run and makes no metadata calls", async () => {
    onlyNew([FILM_603, KEY[1], SHOW_1396])
    postReply = () => overseerrReply(500)
    await syncUserWatchlist("member-1")
    expect([...history.values()].filter((row) => row.status === "FAILED")).toHaveLength(3)
    expect(settings.watchlistEtag).toBeNull()

    calls = []
    postReply = () => ({ status: 201, body: fixture("overseerr-request-201.json") })
    const second = await syncUserWatchlist("member-1")

    expect(metadataCalls()).toHaveLength(0)
    expect(posts()).toHaveLength(3)
    expect(second).toMatchObject({ data: { itemsRequested: 3, itemsFailed: 0 } })
  })

  it("makes one request when the watchlist answers 304", async () => {
    onlyNew([FILM_603])
    await syncUserWatchlist("member-1")
    expect(settings.watchlistEtag).toBe(ETAG)

    calls = []
    const second = await syncUserWatchlist("member-1")

    expect(discoverCalls()).toHaveLength(1)
    expect(discoverCalls()[0].headers["If-None-Match"]).toBe(ETAG)
    expect(posts()).toHaveLength(0)
    expect(second).toMatchObject({ success: true, data: { notModified: true, itemsRequested: 0 } })
  })

  it("stores no request id for a 202, and records it as already requested", async () => {
    onlyNew([SHOW_1396])
    postReply = () => overseerrReply(202)

    await syncUserWatchlist("member-1")

    const row = history.get(SHOW_1396)
    expect(row).toMatchObject({ status: "ALREADY_REQUESTED" })
    expect(row?.overseerrRequestId).toBeUndefined()
  })

  it("treats a 409 as already requested", async () => {
    onlyNew([FILM_603])
    postReply = () => overseerrReply(409)

    await syncUserWatchlist("member-1")

    expect(history.get(FILM_603)).toMatchObject({ status: "ALREADY_REQUESTED" })
  })

  it("keeps a 403 terminal with Overseerr's message, and never retries it", async () => {
    onlyNew([FILM_603])
    postReply = () => overseerrReply(403)

    const first = await syncUserWatchlist("member-1")
    expect(history.get(FILM_603)).toMatchObject({ status: "NOT_PERMITTED" })
    expect(first).toMatchObject({ data: { itemsNotPermitted: 1, itemsFailed: 0 } })
    expect(settings.lastSyncError).toBe("Film 000: You do not have permission to request this media. Movie Quota Exceeded")

    settings.watchlistEtag = null // a changed watchlist: the list is read again
    calls = []
    await syncUserWatchlist("member-1")

    expect(listingCalls()).toHaveLength(2)
    expect(posts()).toHaveLength(0)
  })

  it("retries a 500 on the next run, with a fixed message", async () => {
    onlyNew([FILM_603])
    postReply = () => overseerrReply(500)

    await syncUserWatchlist("member-1")
    expect(history.get(FILM_603)).toMatchObject({ status: "FAILED" })
    expect(settings).toMatchObject({ lastSyncStatus: "failed", lastSyncError: "Film 000: Overseerr returned HTTP 500" })

    calls = []
    postReply = () => ({ status: 201, body: fixture("overseerr-request-201.json") })
    await syncUserWatchlist("member-1")

    expect(posts()).toHaveLength(1)
    expect(history.get(FILM_603)).toMatchObject({ status: "REQUESTED", overseerrRequestId: 412 })
  })

  it("never posts a title Overseerr already has", async () => {
    onlyNew([FILM_603])
    mediaReply = () => ({ status: 200, body: { mediaInfo: { status: 5, status4k: 1, requests: [] } } })

    await syncUserWatchlist("member-1")

    expect(posts()).toHaveLength(0)
    expect(history.get(FILM_603)).toMatchObject({ status: "ALREADY_AVAILABLE" })
  })

  it("records a title gone from the watchlist as REMOVED_FROM_WATCHLIST (P11.14)", async () => {
    onlyNew([])
    history.set("gone-1", { plexRatingKey: "gone-1", status: "REQUESTED" })

    await syncUserWatchlist("member-1")

    expect(history.get("gone-1")).toMatchObject({ status: "REMOVED_FROM_WATCHLIST" })
    expect(history.get(FILM_603)).toMatchObject({ status: "ALREADY_AVAILABLE" })
  })

  it("files at most 50 requests a run and leaves the rest, without storing the ETag", async () => {
    const result = await syncUserWatchlist("member-1")

    expect(posts()).toHaveLength(50)
    expect(result).toMatchObject({ data: { itemsRequested: 50 } })
    expect(result.data?.itemsDeferred).toBeGreaterThan(0)
    expect(metadataCalls().length).toBeLessThan(60)
    expect(settings.watchlistEtag).toBeNull()

    calls = []
    await syncUserWatchlist("member-1")
    expect(posts()).toHaveLength(50)
  })

  it("calls a run in which every new item had no TMDB match partial, with the reason", async () => {
    onlyNew([UNMATCHED])

    await syncUserWatchlist("member-1")

    expect(posts()).toHaveLength(0)
    expect(settings).toMatchObject({
      lastSyncStatus: "partial",
      lastSyncError: "Nothing could be requested: 1 new item has no TMDB match.",
    })
  })
})
