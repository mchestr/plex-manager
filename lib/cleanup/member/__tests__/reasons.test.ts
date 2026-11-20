/**
 * `memberReason` (UX 9.2.3, TS 13.3 step 4): the first reason that applies,
 * from the member's own facts only, with its date; the watchlist reason only
 * while G8 is off (the caller passes no watchlist then); a season matches
 * the watchlist by its show's ids. The reason lines and dated facts.
 */

import { buildMovieItem, buildSeasonItem, buildShowItem, daysAgo } from "@/lib/cleanup/__tests__/helpers/builders"
import { memberReason, REASON_LINES, reasonFact, type WatchlistEntry, watchlistIndex } from "@/lib/cleanup/member/reasons"
import type { RequestFact, Viewer } from "@/lib/cleanup/schema/snapshot"

const ME = "900101"
const OTHER = "900202"
const iso = (seconds: number) => new Date(seconds * 1000).toISOString()

const request = (patch: Partial<RequestFact> = {}): RequestFact => ({ at: daysAgo(400), by: ME, status: 2, is4k: false, seasons: null, ...patch })
const viewer = (patch: Partial<Viewer> = {}): Viewer => ({
  user: ME, lastCountedAt: daysAgo(300), lastCountedFinished: true, counted: 2, finished: true, finishedEpisodes: 4, ...patch,
})
const plays = (viewers: Viewer[]) => ({ lastCountedAt: daysAgo(300), countedAt: [daysAgo(300)], viewers })
const watch = (patch: Partial<WatchlistEntry> = {}): WatchlistEntry => ({
  mediaType: "MOVIE", tmdbId: 1001, tvdbId: null, imdbId: null, syncedAt: new Date("2026-06-03T10:00:00.000Z"), ...patch,
})
const NONE = watchlistIndex([])

describe("memberReason", () => {
  it("gives requested first, dated by the member's newest request", () => {
    const item = buildMovieItem({
      requests: [request({ at: daysAgo(500) }), request({ at: daysAgo(450) }), request({ by: OTHER, at: daysAgo(10) })],
      plays: plays([viewer({ lastCountedFinished: false })]),
    })
    expect(memberReason(item, ME, watchlistIndex([watch()]))).toEqual({ reason: "requested", reasonAt: iso(daysAgo(450)) })
  })

  it("leaves out a declined request and another member's request", () => {
    const item = buildMovieItem({ requests: [request({ status: 3 }), request({ by: OTHER }), request({ by: null })], plays: plays([]) })
    expect(memberReason(item, ME, null)).toBeNull()
  })

  it("counts a season request only for its own season, or with no season list", () => {
    const show = buildShowItem({ plays: plays([]) })
    const season = (n: number, requests: RequestFact[]) => buildSeasonItem(show, n, { requests })
    expect(memberReason(season(2, [request({ seasons: [1] })]), ME, null)).toBeNull()
    expect(memberReason(season(2, [request({ seasons: [1, 2] })]), ME, null)?.reason).toBe("requested")
    expect(memberReason(season(2, [request({ seasons: null })]), ME, null)?.reason).toBe("requested")
  })

  it("gives started for a movie whose newest counted play is not finished", () => {
    const item = buildMovieItem({ plays: plays([viewer({ user: OTHER }), viewer({ lastCountedFinished: false, lastCountedAt: daysAgo(700) })]) })
    expect(memberReason(item, ME, NONE)).toEqual({ reason: "started", reasonAt: iso(daysAgo(700)) })
  })

  it("gives started for a show with episodes left, and played when every episode is finished", () => {
    expect(memberReason(buildShowItem({ plays: plays([viewer({ finishedEpisodes: 1 })]) }), ME, NONE)?.reason).toBe("started")
    expect(memberReason(buildShowItem({ plays: plays([viewer({ finishedEpisodes: 4 })]) }), ME, NONE)?.reason).toBe("played")
  })

  it("reads the finished flag when a show has no episode count", () => {
    const item = buildShowItem({ episodeCount: null, plays: plays([viewer({ finished: false, finishedEpisodes: 9 })]) })
    expect(memberReason(item, ME, NONE)?.reason).toBe("started")
  })

  it("gives played for a finished counted play, dated by the last one", () => {
    const item = buildMovieItem({ plays: plays([viewer({ lastCountedAt: daysAgo(390) })]) })
    expect(memberReason(item, ME, NONE)).toEqual({ reason: "played", reasonAt: iso(daysAgo(390)) })
  })

  it("needs a counted play: a viewer row with none gives no play reason", () => {
    const item = buildMovieItem({ plays: plays([viewer({ counted: 0, lastCountedAt: null, lastCountedFinished: false })]) })
    expect(memberReason(item, ME, NONE)).toBeNull()
    expect(memberReason(buildMovieItem({ plays: plays([viewer({ lastCountedAt: null })]) }), ME, NONE)).toBeNull()
  })

  it("reads no play reason while Tautulli failed, and no request reason while Overseerr failed", () => {
    expect(memberReason(buildMovieItem({ plays: null, requests: null }), ME, NONE)).toBeNull()
  })

  it("gives watchlist last, dated by the sync, only with a watchlist (G8 off)", () => {
    const item = buildMovieItem({ plays: plays([viewer({ user: OTHER })]) })
    const list = watchlistIndex([watch()])
    expect(memberReason(item, ME, list)).toEqual({ reason: "watchlist", reasonAt: "2026-06-03T10:00:00.000Z" })
    expect(memberReason(item, ME, null)).toBeNull()
  })

  it("matches a movie by its imdb id and a show by tvdb, never a movie row against a show", () => {
    const movie = buildMovieItem({ plays: plays([]) })
    const show = buildShowItem({ plays: plays([]) })
    expect(memberReason(movie, ME, watchlistIndex([watch({ tmdbId: null, imdbId: "tt0000001" })]))?.reason).toBe("watchlist")
    expect(memberReason(show, ME, watchlistIndex([watch({ mediaType: "TV_SERIES", tmdbId: null, tvdbId: 2002 })]))?.reason).toBe("watchlist")
    expect(memberReason(show, ME, watchlistIndex([watch({ tmdbId: 3003 })]))).toBeNull()
    expect(memberReason(movie, ME, watchlistIndex([watch({ mediaType: "EPISODE" })]))).toBeNull()
  })

  it("matches a season by its show's ids", () => {
    const season = buildSeasonItem(buildShowItem({ plays: plays([]) }), 2)
    const list = watchlistIndex([watch({ mediaType: "TV_SERIES", tmdbId: 3003 })])
    expect(memberReason(season, ME, list)?.reason).toBe("watchlist")
  })

  it("dates a title that two watchlist rows hold by the newest sync", () => {
    const list = watchlistIndex([
      watch({ syncedAt: new Date("2026-02-01T00:00:00.000Z") }),
      watch({ tmdbId: null, imdbId: "tt0000001", syncedAt: new Date("2026-05-01T00:00:00.000Z") }),
      watch({ syncedAt: new Date("2026-01-01T00:00:00.000Z") }),
    ])
    expect(memberReason(buildMovieItem({ plays: plays([]) }), ME, list)?.reasonAt).toBe("2026-05-01T00:00:00.000Z")
  })
})

describe("reason words", () => {
  const settings = { timeZone: "UTC", locale: "en-US" }

  it("names each reason as UX 9.2.3 does", () => {
    expect(REASON_LINES).toEqual({
      requested: "You requested this",
      started: "You started this",
      played: "You played this before",
      watchlist: "On your watchlist",
    })
  })

  it("dates each fact by month and year", () => {
    expect(reasonFact("requested", "2025-03-14T12:00:00.000Z", settings)).toBe("Your request was in Mar 2025.")
    expect(reasonFact("started", "2023-03-02T12:00:00.000Z", settings)).toBe("You stopped part-way in Mar 2023.")
    expect(reasonFact("played", "2023-10-20T12:00:00.000Z", settings)).toBe("Your last play was Oct 2023.")
    expect(reasonFact("watchlist", "2026-06-03T12:00:00.000Z", settings)).toBe("You added it in Jun 2026.")
  })
})
