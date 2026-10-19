/**
 * @jest-environment node
 */

/**
 * The people page's facts (P2.8).
 */

import { computePeople } from "@/lib/wrapped/stats/people"

import { lookupFor, meta } from "./build-lookups"
import { play, statsContext, ZONES } from "./build-events"

describe.each(ZONES)("computePeople in %s", (zone) => {
  const ctx = statsContext(zone)
  const hour = 3600

  it("weights actors by minutes, counts series cast through the series, and takes directors from films only", () => {
    const events = [
      play({ at: "2026-02-01T20:00", zone, series: "77", seconds: 2 * hour }),
      play({ at: "2026-02-02T20:00", zone, series: "77", seconds: 2 * hour }),
      play({ at: "2026-03-01T20:00", zone, film: "101", seconds: 3 * hour }),
      play({ at: "2026-03-02T20:00", zone, film: "102", seconds: 1 * hour }),
    ]
    const lookup = lookupFor(events, {
      "77": meta({ actors: ["Adam Scott", "Britt Lower"], directors: ["Ben Stiller"] }),
      "101": meta({ actors: ["Timothée Chalamet", "Zendaya"], directors: ["Denis Villeneuve"] }),
      "102": meta({ actors: ["Zendaya"], directors: ["Luca Guadagnino"] }),
    })
    const people = computePeople(events, ctx, lookup)
    if (!people.eligible) throw new Error("expected People")
    expect(people.actors).toEqual([
      { name: "Adam Scott", minutes: 240 },
      { name: "Britt Lower", minutes: 240 },
      { name: "Zendaya", minutes: 240 },
      { name: "Timothée Chalamet", minutes: 180 },
    ])
    expect(people.directors).toEqual([
      { name: "Denis Villeneuve", minutes: 180 },
      { name: "Luca Guadagnino", minutes: 60 },
    ])
  })

  it("keeps the top five actors and top three directors", () => {
    const events = Array.from({ length: 7 }, (_, i) => play({ at: `2026-04-0${i + 1}T20:00`, zone, film: `${i + 1}`, seconds: (i + 1) * 600 }))
    const rows = Object.fromEntries(events.map((e, i) => [e.ratingKey, meta({ actors: [`Actor ${i}`], directors: [`Director ${i}`] })]))
    const people = computePeople(events, ctx, lookupFor(events, rows))
    expect(people.eligible && people.actors.map((a) => a.name)).toEqual(["Actor 6", "Actor 5", "Actor 4", "Actor 3", "Actor 2"])
    expect(people.eligible && people.directors.map((d) => d.name)).toEqual(["Director 6", "Director 5", "Director 4"])
  })

  it("is ineligible below 70% coverage", () => {
    const covered = play({ at: "2026-03-01T20:00", zone, film: "1", seconds: 69 * 60 })
    const bare = play({ at: "2026-03-02T20:00", zone, film: "2", seconds: 31 * 60 })
    const lookup = lookupFor([covered, bare], { "1": meta({ actors: ["Zendaya"] }), "2": meta({ genres: ["Drama"] }) })
    expect(computePeople([covered, bare], ctx, lookup)).toEqual({ eligible: false, coverage: 0.69 })
    expect(computePeople([{ ...covered, playSeconds: 70 * 60 }, { ...bare, playSeconds: 30 * 60 }], ctx, lookup).eligible).toBe(true)
  })

  it("does not count a series' director as cover for its episodes", () => {
    const events = [play({ at: "2026-02-01T20:00", zone, series: "77" })]
    expect(computePeople(events, ctx, lookupFor(events, { "77": meta({ directors: ["Ben Stiller"] }) })).eligible).toBe(false)
  })

  it("leaves hidden titles out", () => {
    const events = [play({ at: "2026-02-01T20:00", zone, film: "1" }), play({ at: "2026-02-02T20:00", zone, film: "2", seconds: 9000 })]
    const lookup = lookupFor(events, { "1": meta({ actors: ["Shown"] }), "2": meta({ actors: ["Hidden"] }) })
    const people = computePeople(events, statsContext(zone, { hidden: ["2"] }), lookup)
    expect(people.eligible && people.actors.map((a) => a.name)).toEqual(["Shown"])
  })
})
