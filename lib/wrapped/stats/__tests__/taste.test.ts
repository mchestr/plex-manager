/**
 * @jest-environment node
 */

/**
 * The taste page's facts (P2.8: RWP-18).
 */

import { computeTaste } from "@/lib/wrapped/stats/taste"
import type { PlayEvent } from "@/lib/wrapped/sources/watch-history-source"

import { lookupFor, meta } from "./build-lookups"
import { play, statsContext, ZONES } from "./build-events"

describe.each(ZONES)("computeTaste in %s", (zone) => {
  const ctx = statsContext(zone)
  const hour = 3600

  it("gives episodes their series' genres and ranks genres by minutes", () => {
    const events = [
      play({ at: "2026-02-01T20:00", zone, series: "77", seconds: 3 * hour }),
      play({ at: "2026-02-02T20:00", zone, series: "77", seconds: hour }),
      play({ at: "2026-05-03T20:00", zone, film: "101", seconds: 2 * hour }),
    ]
    const lookup = lookupFor(events, { "77": meta({ genres: ["Drama"] }), "101": meta({ genres: ["Comedy", "Drama"] }) })
    const taste = computeTaste(events, ctx, lookup)
    if (!taste.eligible) throw new Error("expected Taste")
    expect(taste.genres).toEqual([
      { name: "Drama", minutes: 300, share: 5 / 6 },
      { name: "Comedy", minutes: 60, share: 1 / 6 },
    ])
    // May is a tie of an hour each, which the name breaks
    expect(taste.genreByMonth.slice(0, 5).map((m) => m.genre)).toEqual([null, "Drama", null, null, "Comedy"])
    expect(taste.genreByMonth.map((m) => m.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it("is ineligible at 55% genre coverage and eligible at 60%", () => {
    const covered = play({ at: "2026-03-01T20:00", zone, film: "1", seconds: 55 * 60 })
    const bare = play({ at: "2026-03-02T20:00", zone, film: "2", seconds: 45 * 60 })
    const lookup = lookupFor([covered, bare], { "1": meta({ genres: ["Drama"] }) })
    expect(computeTaste([covered, bare], ctx, lookup)).toEqual({ eligible: false, coverage: 0.55 })
    expect(computeTaste([{ ...covered, playSeconds: 60 * 60 }, { ...bare, playSeconds: 40 * 60 }], ctx, lookup).eligible).toBe(true)
  })

  it("is ineligible without any metadata", () => {
    const events = [play({ at: "2026-03-01T20:00", zone, film: "1" })]
    expect(computeTaste(events, ctx, () => undefined)).toEqual({ eligible: false, coverage: 0 })
  })

  it("leaves hidden and rating-excluded titles out of the genres", () => {
    const events: PlayEvent[] = [
      play({ at: "2026-03-01T20:00", zone, film: "1", seconds: hour }),
      play({ at: "2026-03-02T20:00", zone, film: "2", seconds: 5 * hour }),
      { ...play({ at: "2026-03-03T20:00", zone, film: "3", seconds: 5 * hour }), excludedFromLists: true },
    ]
    const lookup = lookupFor(events, {
      "1": meta({ genres: ["Drama"] }),
      "2": meta({ genres: ["Horror"] }),
      "3": meta({ genres: ["Thriller"] }),
    })
    const taste = computeTaste(events, statsContext(zone, { hidden: ["2"] }), lookup)
    expect(taste.eligible && taste.genres.map((g) => g.name)).toEqual(["Drama"])
  })

  it("puts plays 13 and 15 days after release on either side of the fresh cut-off", () => {
    const fresh = { ...play({ at: "2026-03-14T20:00", zone, film: "1" }), originallyAvailableAt: "2026-03-01" }
    const stale = { ...play({ at: "2026-03-16T20:00", zone, film: "2" }), originallyAvailableAt: "2026-03-01" }
    const unknown = play({ at: "2026-03-16T20:00", zone, film: "3" })
    const lookup = lookupFor([fresh, stale, unknown], { "1": meta({ genres: ["Drama"] }), "2": meta({ genres: ["Drama"] }), "3": meta({ genres: ["Drama"] }) })
    const taste = computeTaste([fresh, stale, unknown], ctx, lookup)
    expect(taste.eligible && taste.freshShare).toBe(0.5)
  })

  it("reads a film's release date from the cache when the play has none", () => {
    const film = play({ at: "2026-03-10T20:00", zone, film: "1" })
    const lookup = lookupFor([film], { "1": meta({ genres: ["Drama"], originallyAvailableAt: "2026-03-05" }) })
    const taste = computeTaste([film], ctx, lookup)
    expect(taste.eligible && taste.freshShare).toBe(1)
  })

  it("takes the median release year per title, the decades and the oldest title", () => {
    const events = [
      play({ at: "2026-01-05T20:00", zone, film: "1", title: "Dune", year: 1984 }),
      play({ at: "2026-01-06T20:00", zone, film: "1", title: "Dune", year: 1984 }),
      play({ at: "2026-01-07T20:00", zone, film: "2", title: "Dune", year: 2021 }),
      play({ at: "2026-01-08T20:00", zone, film: "3", title: "Arrival", year: 2016 }),
      play({ at: "2026-01-09T20:00", zone, series: "77", seconds: 7200 }),
    ]
    const lookup = lookupFor(events, {
      "1": meta({ genres: ["Sci-Fi"] }),
      "2": meta({ genres: ["Sci-Fi"] }),
      "3": meta({ genres: ["Sci-Fi"] }),
      "77": meta({ genres: ["Drama"], year: 2022 }),
    })
    const taste = computeTaste(events, ctx, lookup)
    if (!taste.eligible) throw new Error("expected Taste")
    expect(taste.medianYear).toBe(2016)
    expect(taste.decades).toEqual([
      { decade: 1980, titles: 1 },
      { decade: 2010, titles: 1 },
      { decade: 2020, titles: 2 },
    ])
    expect(taste.oldest).toEqual({ key: "film:1", title: "Dune (1984)", year: 1984 })
  })
})
