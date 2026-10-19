/**
 * @jest-environment node
 */

/**
 * The next-year page's facts (P2.8).
 */

import { computeNextYear, type LibraryTitle, type NextYearInput } from "@/lib/wrapped/stats/next-year"
import type { PeopleStats } from "@/lib/wrapped/stats/people"
import type { TasteStats } from "@/lib/wrapped/stats/taste"

import { lookupFor, meta } from "./build-lookups"
import { play, statsContext, ZONES } from "./build-events"

const taste: TasteStats = {
  eligible: true,
  coverage: 1,
  genres: [
    { name: "Drama", minutes: 600, share: 0.6 },
    { name: "Thriller", minutes: 400, share: 0.4 },
  ],
  genreByMonth: [],
  medianYear: 2020,
  decades: [],
  oldest: null,
  freshShare: null,
}
const people: PeopleStats = {
  eligible: true,
  coverage: 1,
  actors: [{ name: "Adam Scott", minutes: 300 }],
  directors: [{ name: "Denis Villeneuve", minutes: 200 }],
}

function title(ratingKey: string, fields: Partial<LibraryTitle> = {}): LibraryTitle {
  return {
    ratingKey,
    type: "movie",
    title: `Title ${ratingKey}`,
    year: 2024,
    addedAt: Date.parse("2026-01-01T00:00:00Z"),
    contentRating: "PG-13",
    genres: ["Drama"],
    directors: [],
    actors: [],
    ...fields,
  }
}

const input = (fields: Partial<NextYearInput> = {}): NextYearInput => ({
  taste,
  people,
  library: [],
  excludedContentRatings: [],
  ...fields,
})

describe.each(ZONES)("computeNextYear in %s", (zone) => {
  const ctx = statsContext(zone)
  const episode = (series: string, at: string, season: number, ep: number) =>
    play({ at, zone, series, season, episode: ep, title: `Series ${series}` })

  it("finds series left short of their final episode for 30 days, watched in the last 120", () => {
    const events = [
      episode("77", "2026-08-30T20:00", 2, 4),
      episode("77", "2026-09-01T20:00", 2, 5),
      episode("77", "2026-03-01T20:00", 1, 10),
      episode("78", "2026-09-01T20:00", 1, 10), // finished
      episode("79", "2026-11-20T20:00", 1, 2), // still watching
      episode("80", "2026-06-01T20:00", 1, 2), // too long ago
      episode("81", "2026-09-01T20:00", 1, 2), // no season counts
    ]
    const counts = { "1": 10, "2": 8 }
    const lookup = lookupFor(events, {
      "77": meta({ seasonEpisodeCounts: { "0": 3, ...counts } }),
      "78": meta({ seasonEpisodeCounts: { "1": 10 } }),
      "79": meta({ seasonEpisodeCounts: counts }),
      "80": meta({ seasonEpisodeCounts: counts }),
    })
    const next = computeNextYear(events, ctx, lookup, input())
    expect(next.leftForLater).toEqual([{ key: "series:77", title: "Series 77", season: 2, episode: 5, lastWatched: "2026-09-01" }])
    expect(next).toMatchObject({ eligible: true, picks: [], returning: null })
  })

  it("picks unwatched, unhidden titles of the top genre, deterministically", () => {
    const events = [play({ at: "2026-03-01T20:00", zone, film: "1" }), play({ at: "2026-03-02T20:00", zone, series: "2" })]
    const library = [
      title("1", { actors: ["Adam Scott"] }), // watched film
      title("2", { type: "show", actors: ["Adam Scott"] }), // watched series
      title("3", { actors: ["Adam Scott"], genres: ["Drama", "Thriller"] }), // hidden
      title("4", { genres: ["Comedy"], actors: ["Adam Scott"] }), // not the top genre
      title("5"),
      title("6", { addedAt: Date.parse("2026-06-01T00:00:00Z") }),
      title("7", { type: "show", directors: ["Denis Villeneuve"] }),
      title("8", { genres: ["Drama", "Thriller"] }),
      title("9", { type: "artist", genres: ["Drama"] }),
    ]
    const run = () => computeNextYear(events, statsContext(zone, { hidden: ["3"] }), () => undefined, input({ library }))
    expect(run().picks).toEqual([
      { ratingKey: "7", kind: "series", title: "Title 7", year: 2024, genre: "Drama", person: "Denis Villeneuve" },
      { ratingKey: "8", kind: "film", title: "Title 8", year: 2024, genre: "Drama", person: null },
      { ratingKey: "6", kind: "film", title: "Title 6", year: 2024, genre: "Drama", person: null },
    ])
    expect(computeNextYear(events, statsContext(zone, { hidden: ["3"] }), () => undefined, input({ library: [...library].reverse() })).picks).toEqual(
      run().picks
    )
  })

  it("never picks a title whose rating is excluded or unknown when exclusions are set", () => {
    const library = [title("5", { contentRating: "X" }), title("6", { contentRating: null }), title("7", { contentRating: "pg-13" })]
    const next = computeNextYear([], ctx, () => undefined, input({ library, excludedContentRatings: ["X"] }))
    expect(next.picks.map((p) => p.ratingKey)).toEqual(["7"])
  })

  it("has no picks without Taste or the library, and is ineligible with nothing to show", () => {
    const library = [title("5")]
    expect(computeNextYear([], ctx, () => undefined, input({ library, taste: { eligible: false, coverage: 0.2 } }))).toEqual({
      eligible: false,
      leftForLater: [],
      picks: [],
      returning: null,
    })
    expect(computeNextYear([], ctx, () => undefined, input({ library: null })).picks).toEqual([])
  })
})
