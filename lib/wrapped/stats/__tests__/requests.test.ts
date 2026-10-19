/**
 * @jest-environment node
 */

/**
 * The requests page's facts (P2.8: RWP-06).
 */

import { toRequestEvent } from "@/lib/wrapped/sources/request-event"
import { overseerrRequestSchema } from "@/lib/wrapped/sources/schemas"
import { computeRequests } from "@/lib/wrapped/stats/requests"

import { lookupFor, meta } from "./build-lookups"
import { play, ZONES } from "./build-events"

let nextId = 1

/** A request as Overseerr sends it, mapped the way the source maps it. */
function request(type: "movie" | "tv", status: number, mediaStatus: number, ids: { tmdbId?: number; tvdbId?: number } = {}, genres: string[] = []) {
  const row = overseerrRequestSchema.parse({
    id: nextId++,
    status,
    type,
    createdAt: "2026-04-01T12:00:00.000Z",
    requestedBy: { id: 7 },
    media: { status: mediaStatus, tmdbId: ids.tmdbId ?? null, tvdbId: ids.tvdbId ?? null },
  })
  return { ...toRequestEvent(row), genres }
}

describe.each(ZONES)("computeRequests in %s", (zone) => {
  it("counts made, approved (2 or 5), pending (1) and declined (3)", () => {
    const requests = [
      request("movie", 1, 2),
      request("movie", 2, 3),
      request("movie", 5, 5),
      request("tv", 3, 1),
      request("tv", 4, 1),
    ]
    expect(computeRequests([], requests, () => undefined)).toMatchObject({
      eligible: true,
      made: 5,
      approved: 2,
      pending: 1,
      declined: 1,
      available: 1,
    })
  })

  it("makes a TV request with media status 4 available, but not a film with 4", () => {
    const tv = computeRequests([], [request("tv", 2, 4)], () => undefined)
    const film = computeRequests([], [request("movie", 2, 4)], () => undefined)
    expect([tv.eligible && tv.available, film.eligible && film.available]).toEqual([1, 0])
  })

  it("counts a film matched by tmdb and a series matched by tvdb as watched", () => {
    const events = [play({ at: "2026-05-01T20:00", zone, film: "101" }), play({ at: "2026-05-02T20:00", zone, series: "77" })]
    const lookup = lookupFor(events, {
      "101": meta({ guids: ["imdb://tt1160419", "tmdb://438631"] }),
      "77": meta({ guids: ["tmdb://95396", "tvdb://371980"] }),
    })
    const requests = [
      request("movie", 5, 5, { tmdbId: 438631 }),
      request("tv", 5, 5, { tmdbId: 1, tvdbId: 371980 }),
      request("movie", 5, 5, { tmdbId: 999 }),
      // A series' tmdb id never matches a film with the same number
      request("tv", 5, 5, { tmdbId: 438631 }),
    ]
    const result = computeRequests(events, requests, lookup)
    expect(result.eligible && result.watched).toBe(2)
  })

  it("ignores plex:// guids, including the history row's own guid", () => {
    const film = { ...play({ at: "2026-05-01T20:00", zone, film: "101" }), guid: "tmdb://438631" }
    const lookup = lookupFor([film], { "101": meta({ guids: ["plex://movie/5d7768ba96b655001fdc0408"] }) })
    const result = computeRequests([film], [request("movie", 5, 5, { tmdbId: 438631 })], lookup)
    expect(result.eligible && result.watched).toBe(0)
  })

  it("does not count a play too short to be watched", () => {
    const film = play({ at: "2026-05-01T20:00", zone, film: "101", seconds: 60, percent: 10 })
    const lookup = lookupFor([film], { "101": meta({ guids: ["tmdb://438631"] }) })
    const result = computeRequests([film], [request("movie", 5, 5, { tmdbId: 438631 })], lookup)
    expect(result.eligible && result.watched).toBe(0)
  })

  it("ranks the request genres", () => {
    const requests = [
      request("movie", 5, 5, {}, ["Drama", "Thriller"]),
      request("movie", 5, 5, {}, ["Drama"]),
      request("tv", 5, 5, {}, ["Comedy"]),
      request("tv", 5, 5, {}, ["Animation"]),
    ]
    const result = computeRequests([], requests, () => undefined)
    expect(result.eligible && result.genres).toEqual([
      { name: "Drama", requests: 2 },
      { name: "Animation", requests: 1 },
      { name: "Comedy", requests: 1 },
    ])
  })

  it("is ineligible without Overseerr or without requests", () => {
    expect(computeRequests([], null, () => undefined)).toEqual({ eligible: false })
    expect(computeRequests([], [], () => undefined)).toEqual({ eligible: false })
  })
})
