/** @jest-environment node */
/** Requests on items (TS 7.6): the user index, declined and repeated requests, movies, shows and the season filter. */

import { buildMovieItem, buildSeasonItem, buildShowItem } from "@/lib/cleanup/__tests__/helpers/builders"
import requestPage from "@/lib/cleanup/__tests__/fixtures/seerr-request-page.json"
import { type SeerrRequest, seerrRequestSchema } from "@/lib/cleanup/schema/upstream"
import { createRequestLog, DECLINED_STATUS, indexRequests, invertUserIndex } from "@/lib/cleanup/snapshot/requests"

const request = (overrides: Record<string, unknown>): SeerrRequest => seerrRequestSchema.parse({
  id: 1, status: 2, type: "movie", is4k: false, createdAt: "2024-03-01T10:00:00.000Z", requestedBy: { id: 2 }, media: { tmdbId: 1001 }, ...overrides,
})

// O1 as `buildOverseerrUserIndex` gives it: plex.tv id to Overseerr user id.
const USERS = invertUserIndex(new Map([[9400000, 1], [9400001, 2], [9400002, 3]]))
const AT = (iso: string) => Date.parse(iso) / 1000
const FALLBACK = 1_800_000_000

function index(rows: SeerrRequest[], shows = [buildShowItem()]) {
  const log = createRequestLog()
  log.add(rows)
  return indexRequests(log.pending(), USERS, FALLBACK, shows)
}

describe("createRequestLog", () => {
  it("drops a repeated request id and declined requests, across pages", () => {
    const log = createRequestLog()
    log.add([request({ id: 1 }), request({ id: 2, status: DECLINED_STATUS })])
    log.add([request({ id: 1, media: { tmdbId: 9 } }), request({ id: 3, type: "tv", media: { tvdbId: 7 }, seasons: [{ seasonNumber: 2 }] })])
    expect(log.pending()).toEqual([
      { type: "movie", tmdb: 1001, tvdb: null, requester: 2, at: AT("2024-03-01T10:00:00.000Z"), fact: { status: 2, is4k: false, seasons: null } },
      { type: "tv", tmdb: null, tvdb: 7, requester: 2, at: AT("2024-03-01T10:00:00.000Z"), fact: { status: 2, is4k: false, seasons: [2] } },
    ])
  })

  it("reads the fixture page", () => {
    const log = createRequestLog()
    log.add(requestPage.results.map((raw) => seerrRequestSchema.parse(raw)))
    expect(log.pending().map((r) => [r.type, r.tmdb, r.tvdb, r.requester, r.fact.seasons])).toEqual([
      ["movie", 990101, null, 2, null],
      ["tv", 880201, 770201, 3, [2]],
    ])
  })
})

describe("invertUserIndex", () => {
  it("maps Overseerr user ids to plex.tv ids and leaves out ids that are not whole", () => {
    expect(invertUserIndex(new Map([[9400001, 2], [-1, 5], [1.5, 6]]))).toEqual(new Map([[2, "9400001"]]))
  })
})

describe("indexRequests", () => {
  it("attaches a movie request by TMDB id, 4K requests too, with the requester's plex.tv id", () => {
    const requests = index([request({ id: 1 }), request({ id: 2, is4k: true, requestedBy: { id: 3 }, createdAt: "2024-01-01T00:00:00.000Z" })])
    expect(requests.forItem(buildMovieItem())).toEqual([
      { at: AT("2024-01-01T00:00:00.000Z"), by: "9400002", status: 2, is4k: true, seasons: null },
      { at: AT("2024-03-01T10:00:00.000Z"), by: "9400001", status: 2, is4k: false, seasons: null },
    ])
    expect(requests.forItem(buildMovieItem({ ids: { imdb: "tt1" } }))).toEqual([])
    expect(requests.requesters).toEqual(new Set(["9400001", "9400002"]))
  })

  it("gives by null for a user with no Plex id, or no requester", () => {
    const requests = index([request({ id: 1, requestedBy: { id: 99 } }), request({ id: 2, requestedBy: null })])
    expect(requests.forItem(buildMovieItem()).map((r) => r.by)).toEqual([null, null])
    expect(requests.requesters.size).toBe(0)
  })

  it("attaches a TV request by TVDB id, else by TMDB id", () => {
    const show = buildShowItem()
    const requests = index([
      request({ id: 1, type: "tv", media: { tvdbId: 2002 } }),
      request({ id: 2, type: "tv", media: { tmdbId: 3003 } }),
      request({ id: 3, type: "tv", media: { tvdbId: 4004, tmdbId: 3003 } }),
      request({ id: 4, type: "tv", media: {} }),
    ])
    expect(requests.forItem(show)).toHaveLength(2)
  })

  it("attaches by TMDB id to a show without a TVDB id, even when the request has one", () => {
    const show = buildShowItem({ ids: { tmdb: 3003 }, key: "show:tmdb:3003" })
    expect(index([request({ type: "tv", media: { tvdbId: 4004, tmdbId: 3003 } })], [show]).forItem(show)).toHaveLength(1)
  })

  it("gives a season its show's requests that name it or name no season", () => {
    const show = buildShowItem()
    const requests = index([
      request({ id: 1, type: "tv", media: { tvdbId: 2002 }, seasons: [{ seasonNumber: 2 }] }),
      request({ id: 2, type: "tv", media: { tvdbId: 2002 } }),
      request({ id: 3, type: "tv", media: { tvdbId: 2002 }, seasons: [{ seasonNumber: 1 }, { seasonNumber: 3 }] }),
    ])
    expect(requests.forItem(buildSeasonItem(show, 1)).map((r) => r.seasons)).toEqual([null, [1, 3]])
    expect(requests.forItem(buildSeasonItem(show, 2)).map((r) => r.seasons)).toEqual([[2], null])
    expect(requests.forItem(buildSeasonItem(show, 2, { seasonNumber: null }))).toEqual([{ at: expect.any(Number), by: "9400001", status: 2, is4k: false,
      seasons: null }])
    expect(requests.forItem(buildSeasonItem(show, 1, { showKey: null }))).toEqual([])
  })

  it("takes the read's start for a createdAt that does not parse", () => {
    expect(index([request({ createdAt: "not a date" })]).forItem(buildMovieItem())[0].at).toBe(FALLBACK)
  })
})
