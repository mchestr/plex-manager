/** @jest-environment node */
/** The arr match by external id (TS 7.4 steps 1 to 4): none, one, two, ambiguous, and never by title or year. */

import { idText, indexArr, matchToArr, radarrIndex, sonarrIndex, withArrIds } from "@/lib/cleanup/identity/match"
import { type RadarrMovie, radarrMovieSchema, type SonarrSeries, sonarrSeriesSchema } from "@/lib/cleanup/schema/upstream"

const movie = (overrides: Partial<RadarrMovie>): RadarrMovie => radarrMovieSchema.parse({
  id: 1, title: "Invented", year: 2010, titleSlug: "invented", tmdbId: 100, imdbId: null, path: "/data/movies/Invented (2010)",
  rootFolderPath: "/data/movies", monitored: true, hasFile: true, added: "2024-01-01T00:00:00Z", ...overrides,
})
const series = (overrides: Partial<SonarrSeries>): SonarrSeries => sonarrSeriesSchema.parse({
  id: 1, title: "Invented Show", titleSlug: "invented-show", tvdbId: 700, tmdbId: null, imdbId: null, path: "/data/tv/Invented Show",
  status: "ended", monitored: true, added: "2024-01-01T00:00:00Z", ...overrides,
})

describe("matchToArr with Radarr", () => {
  const a = movie({ id: 1, tmdbId: 100, imdbId: "tt0000100" })
  const b = movie({ id: 2, tmdbId: 200, imdbId: "tt0000200" })

  it("matches one record by TMDB id", () => {
    expect(matchToArr({ tmdb: 100 }, false, radarrIndex([a, b]))).toEqual({ state: "matched", by: "tmdb", record: a })
  })

  it("matches by IMDb id when Plex has no TMDB id, in any case", () => {
    expect(matchToArr({ imdb: "TT0000200" }, false, radarrIndex([a, b]))).toEqual({ state: "matched", by: "imdb", record: b })
  })

  it("names the first id kind that matched when both point to one record", () => {
    expect(matchToArr({ imdb: "tt0000100", tmdb: 100 }, false, radarrIndex([a]))).toMatchObject({ state: "matched", by: "tmdb" })
  })

  it("is unmatched with no candidate", () => {
    expect(matchToArr({ tmdb: 999 }, false, radarrIndex([a, b]))).toEqual({ state: "unmatched", cause: "noArrRecord" })
  })

  it("is unmatched with no external id", () => {
    expect(matchToArr({ plex: "plex://movie/x" }, false, radarrIndex([a]))).toEqual({ state: "unmatched", cause: "noIds" })
  })

  it("is conflicted when two ids point to two records", () => {
    expect(matchToArr({ tmdb: 100, imdb: "tt0000200" }, false, radarrIndex([a, b]))).toEqual({ state: "conflicted", cause: "twoArrRecords" })
  })

  it("is conflicted when two records share the id", () => {
    const twin = movie({ id: 3, tmdbId: 100 })
    expect(matchToArr({ tmdb: 100 }, false, radarrIndex([a, twin]))).toEqual({ state: "conflicted", cause: "twoArrRecords" })
  })

  it("is conflicted when the item's own ids conflict", () => {
    expect(matchToArr({ tmdb: 100 }, true, radarrIndex([a]))).toEqual({ state: "conflicted", cause: "conflictingIds" })
  })

  it("is conflicted when one candidate holds another value of a second id", () => {
    expect(matchToArr({ tmdb: 100, imdb: "tt0000999" }, false, radarrIndex([a]))).toEqual({ state: "conflicted", cause: "conflictingIds" })
  })

  it("ignores an id that the record does not hold", () => {
    const noImdb = movie({ id: 4, tmdbId: 400, imdbId: null })
    expect(matchToArr({ tmdb: 400, imdb: "tt0000400" }, false, radarrIndex([noImdb]))).toMatchObject({ state: "matched", record: noImdb })
  })

  it("never matches by title or year", () => {
    const sameName = movie({ id: 5, tmdbId: 500, title: "Invented", year: 2010 })
    expect(matchToArr({ tmdb: 501 }, false, radarrIndex([sameName]))).toEqual({ state: "unmatched", cause: "noArrRecord" })
  })
})

describe("matchToArr with Sonarr", () => {
  it("prefers the TVDB id, then TMDB, then IMDb", () => {
    const show = series({ id: 7, tvdbId: 700, tmdbId: 800, imdbId: "tt0000900" })
    const index = sonarrIndex([show])
    expect(matchToArr({ tvdb: 700, tmdb: 800, imdb: "tt0000900" }, false, index)).toMatchObject({ by: "tvdb" })
    expect(matchToArr({ tmdb: 800 }, false, index)).toMatchObject({ by: "tmdb" })
    expect(matchToArr({ imdb: "tt0000900" }, false, index)).toMatchObject({ by: "imdb" })
  })

  it("is conflicted on a second id: TVDB matches and TMDB differs", () => {
    const show = series({ tvdbId: 700, tmdbId: 800 })
    expect(matchToArr({ tvdb: 700, tmdb: 801 }, false, sonarrIndex([show]))).toEqual({ state: "conflicted", cause: "conflictingIds" })
  })
})

describe("helpers", () => {
  it("writes ids as compared text", () => {
    expect([idText(1), idText("TT1"), idText(0), idText(""), idText(null), idText(undefined)]).toEqual(["1", "tt1", null, null, null, null])
  })

  it("indexes only the kinds asked for", () => {
    const index = indexArr([{ id: "x", tmdb: 1, imdb: "tt1" }], ["tmdb"], (r) => ({ tmdb: r.tmdb, imdb: r.imdb }))
    expect([...index.byId.keys()]).toEqual(["tmdb"])
  })

  it("adds the record's ids where Plex has none and keeps every Plex id", () => {
    const show = series({ tvdbId: 700, tmdbId: 800, imdbId: "tt0000900" })
    expect(withArrIds({ imdb: "tt0000900", plex: "plex://show/x" }, show, sonarrIndex([show]))).toEqual({
      tvdb: 700, tmdb: 800, imdb: "tt0000900", plex: "plex://show/x",
    })
    expect(withArrIds({ tmdb: 1 }, movie({ tmdbId: 2, imdbId: "tt0000002" }), radarrIndex([]))).toEqual({ tmdb: 1, imdb: "tt0000002" })
  })
})
