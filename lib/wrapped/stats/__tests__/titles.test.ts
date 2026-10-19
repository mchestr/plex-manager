/**
 * The list-page title facts, completion, rewatching and the quiz (D7).
 */

import { computeTitles } from "../titles"
import { lookupFor, meta } from "./build-lookups"
import { play, statsContext, ZONES } from "./build-events"

const none = () => undefined

describe.each(ZONES)("computeTitles in %s", (zone) => {
  const ctx = statsContext(zone)
  const ep = (day: number, series: string, episode: number, seconds = 1800) =>
    play({ at: `2026-03-${String(day).padStart(2, "0")}T20:00`, zone, series, season: 1, episode, seconds })

  describe("the quiz", () => {
    // Series 1 has 1,000 minutes; series 2 has 1,000 - gap.
    const race = (gap: number) => [
      ep(1, "1", 1, 1000 * 60),
      ep(2, "2", 1, (1000 - gap) * 60),
      ep(3, "3", 1, 100 * 60),
      ep(4, "4", 1, 50 * 60),
      ep(5, "5", 1, 40 * 60),
    ]

    it("is off when No. 1 leads No. 2 by 2% or less, and on above it", () => {
      expect(computeTitles(race(20), ctx, none).quiz).toBeNull()
      expect(computeTitles(race(21), ctx, none).quiz).toEqual({
        kind: "series",
        options: ["series:1", "series:2", "series:3", "series:4"],
        gapMinutes: 21,
      })
    })

    it("asks about films and series together with fewer than 3 series, and needs 3 candidates", () => {
      const two = [ep(1, "1", 1, 3000), ep(2, "2", 1, 1000)]
      const film = play({ at: "2026-03-09T20:00", zone, film: "77", seconds: 7200 })

      expect(computeTitles([...two, film], ctx, none).quiz).toEqual({
        kind: "mixed",
        options: ["film:77", "series:1", "series:2"],
        gapMinutes: 70,
      })
      expect(computeTitles(two, ctx, none).quiz).toBeNull()
    })
  })

  it("counts episodes, seasons, active months and times over for each series", () => {
    const events = [1, 2, 3].flatMap((round) => [1, 2].map((e) => ep(round * 2 + e, "9", e)))
    const [series] = computeTitles([...events, play({ at: "2026-05-01T20:00", zone, series: "9", season: 2, episode: 1 })], ctx, none).series

    expect(series).toMatchObject({ key: "series:9", episodes: 3, seasons: 2, monthsActive: 2, rewatched: 2 })
  })

  it("ranks films by plays, then minutes", () => {
    const long = play({ at: "2026-03-01T20:00", zone, film: "1", seconds: 3 * 3600 })
    const twice = [2, 3].map((day) => play({ at: `2026-03-0${day}T20:00`, zone, film: "2", seconds: 3600 }))

    expect(computeTitles([long, ...twice], ctx, none).films.map((f) => [f.key, f.plays])).toEqual([
      ["film:2", 2],
      ["film:1", 1],
    ])
  })

  it("shares finished films and episodes out of those started, from 5 started", () => {
    const films = [1, 2, 3, 4].map((n) => play({ at: `2026-03-0${n}T20:00`, zone, film: `${n}`, percent: n === 1 ? 40 : 100, seconds: 3000 }))
    const titles = computeTitles([...films, ep(9, "7", 1)], ctx, none)

    expect(titles.completion).toEqual({ started: 5, finished: 4, share: 0.8 })
    expect(titles.filmsFinished).toEqual({ started: 4, finished: 3, share: 0.75 })
    expect(computeTitles(films, ctx, none).completion).toBeNull()
  })

  it("counts only titles played 3 times or more as rewatching habits", () => {
    const once = (n: number) => play({ at: `2026-04-0${n}T20:00`, zone, film: "10" })
    const thrice = [1, 2, 3].map((n) => play({ at: `2026-05-0${n}T20:00`, zone, film: "11" }))
    const resumed = [play({ at: "2026-06-01T20:00", zone, film: "12" }), play({ at: "2026-06-02T20:00", zone, film: "12" })]
    const titles = computeTitles([once(1), ...thrice, ...resumed], ctx, none)

    expect(titles.rewatchShare).toBe(3 / 6)
    expect(titles.rewatchedTitles).toBe(2)
    expect(titles.distinctTitles).toBe(3)
  })

  it("finds the longest film from the cache's runtime, and the top three series' share of series minutes", () => {
    const films = [play({ at: "2026-03-01T20:00", zone, film: "1" }), play({ at: "2026-03-02T20:00", zone, film: "2" })]
    const series = [ep(3, "5", 1, 600), ep(4, "6", 1, 600), ep(5, "7", 1, 600), ep(6, "8", 1, 600)]
    const lookup = lookupFor(films, { "1": meta({ runtimeSec: 5400 }), "2": meta({ runtimeSec: 10_800 }) })
    const titles = computeTitles([...films, ...series], ctx, lookup)

    expect(titles.longestFilm).toEqual({ key: "film:2", title: "Film 2", minutes: 180 })
    expect(titles.top3SeriesShare).toBe(0.75)
    expect(computeTitles(films, ctx, none)).toMatchObject({ longestFilm: null, top3SeriesShare: null })
  })

  it("lists only titles with a counted play (design 7.2), so a sample alone makes no list or quiz (P2.16)", () => {
    const sample = play({ at: "2026-03-01T18:00", zone, series: "3", season: 1, episode: 1, seconds: 110, percent: 5 })
    const films = [1, 2].map((n) => play({ at: `2026-03-0${n}T14:00`, zone, film: "1", seconds: 170, percent: 3 }))
    const titles = computeTitles([sample, ...films], ctx, none)

    expect(titles.series).toEqual([])
    expect(titles.films.map((f) => f.key)).toEqual(["film:1"])
    expect(titles.top3SeriesShare).toBe(0)
    expect(titles.quiz).toBeNull()
  })

  it("keeps hidden titles out of the lists but in completion", () => {
    const hidden = statsContext(zone, { hidden: ["1"] })
    const films = [1, 2, 3, 4, 5].map((n) => play({ at: `2026-03-0${n}T20:00`, zone, film: `${n}` }))
    const titles = computeTitles(films, hidden, none)

    expect(titles.films.map((f) => f.key)).not.toContain("film:1")
    expect(titles.completion?.started).toBe(5)
  })
})
