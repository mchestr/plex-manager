/**
 * @jest-environment node
 */

/**
 * The ranking order (P2.7, design 4.9): minutes, plays, the latest watch, then the title.
 */

import { rankTitles } from "@/lib/wrapped/stats/rank"

import { play, statsContext } from "./build-events"

const zone = "UTC"
const ctx = statsContext(zone)

describe("rankTitles", () => {
  it("ranks by minutes first", () => {
    const ranked = rankTitles(
      [
        play({ at: "2026-02-01T20:00", zone, film: "a", seconds: 600 }),
        play({ at: "2026-02-01T21:00", zone, film: "b", seconds: 1200 }),
      ],
      ctx
    )
    expect(ranked.map((t) => t.key)).toEqual(["film:b", "film:a"])
    expect(ranked[0]).toMatchObject({ kind: "film", minutes: 20, plays: 1 })
  })

  it("breaks a minutes tie by counted plays", () => {
    const ranked = rankTitles(
      [
        play({ at: "2026-02-01T20:00", zone, film: "a", seconds: 1200 }),
        play({ at: "2026-02-02T20:00", zone, film: "b", seconds: 600 }),
        play({ at: "2026-02-03T20:00", zone, film: "b", seconds: 600 }),
      ],
      ctx
    )
    expect(ranked.map((t) => t.key)).toEqual(["film:b", "film:a"])
  })

  it("then by the most recent watch, then by title", () => {
    const recent = rankTitles(
      [
        play({ at: "2026-02-01T20:00", zone, film: "a", title: "Alpha" }),
        play({ at: "2026-03-01T20:00", zone, film: "b", title: "Beta" }),
      ],
      ctx
    )
    expect(recent.map((t) => t.title)).toEqual(["Beta", "Alpha"])

    const sameTime = rankTitles(
      [
        play({ at: "2026-02-01T20:00", zone, film: "b", title: "Beta" }),
        play({ at: "2026-02-01T20:00", zone, film: "a", title: "Alpha" }),
      ],
      ctx
    )
    expect(sameTime.map((t) => t.title)).toEqual(["Alpha", "Beta"])
  })

  it("keeps the two Dunes apart and names them by year", () => {
    const ranked = rankTitles(
      [
        play({ at: "2026-02-01T20:00", zone, film: "84", title: "Dune", year: 1984, seconds: 1200 }),
        play({ at: "2026-02-02T20:00", zone, film: "21", title: "Dune", year: 2021, seconds: 600 }),
      ],
      ctx
    )
    expect(ranked.map((t) => t.title)).toEqual(["Dune (1984)", "Dune (2021)"])
  })

  it("names a title the same way in a list of one kind as in the full list", () => {
    const events = [
      play({ at: "2026-02-01T20:00", zone, film: "96", title: "Fargo", year: 1996 }),
      play({ at: "2026-02-02T20:00", zone, series: "14", title: "Fargo", year: 2014 }),
    ]
    expect(rankTitles(events, ctx, "series").map((t) => t.title)).toEqual(["Fargo (2014)"])
    expect(rankTitles(events, ctx, "film").map((t) => t.title)).toEqual(["Fargo (1996)"])
  })

  it("groups episodes under their series, leaves hidden titles out and filters by kind", () => {
    const events = [
      play({ at: "2026-02-01T20:00", zone, series: "77", title: "Severance" }),
      play({ at: "2026-02-01T21:00", zone, series: "77", title: "Severance" }),
      play({ at: "2026-02-02T20:00", zone, series: "78" }),
      play({ at: "2026-02-03T20:00", zone, film: "101" }),
    ]
    const ranked = rankTitles(events, statsContext(zone, { hidden: ["78"] }))
    expect(ranked.map((t) => [t.key, t.title, t.plays])).toEqual([
      ["series:77", "Severance", 2],
      ["film:101", "Film 101", 1],
    ])
    expect(rankTitles(events, ctx, "series").map((t) => t.key)).toEqual(["series:77", "series:78"])
  })

  it("counts only counted plays as plays (FR-46)", () => {
    const [film] = rankTitles([play({ at: "2026-02-01T20:00", zone, film: "a", seconds: 70, percent: 30 })], ctx)
    expect(film).toMatchObject({ minutes: 1, plays: 0 })
  })
})
