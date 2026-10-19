/**
 * @jest-environment node
 */

/**
 * The number page's totals (P2.7: RWP-07, RWP-03).
 */

import { computeTotals } from "@/lib/wrapped/stats/totals"

import { play, statsContext, ZONES } from "./build-events"

describe.each(ZONES)("computeTotals in %s", (zone) => {
  const ctx = statsContext(zone)

  it("keeps the two Dunes as two films", () => {
    const totals = computeTotals(
      [
        play({ at: "2026-02-01T20:00", zone, film: "84", title: "Dune", year: 1984 }),
        play({ at: "2026-02-02T20:00", zone, film: "21", title: "Dune", year: 2021 }),
      ],
      ctx
    )
    expect(totals.counts.films).toBe(2)
  })

  it("makes three 50 s rows 2 minutes, not 0", () => {
    const rows = [1, 2, 3].map((d) => play({ at: `2026-02-0${d}T20:00`, zone, film: `f${d}`, seconds: 50 }))
    expect(computeTotals(rows, ctx).totalMinutes).toBe(2)
  })

  it("adds a 70 s sample at 30% to the minutes but not to the counts", () => {
    const totals = computeTotals([play({ at: "2026-02-01T20:00", zone, film: "a", seconds: 70, percent: 30 })], ctx)
    expect(totals.totalMinutes).toBe(1)
    expect(totals.counts).toEqual({ episodes: 0, series: 0, films: 0, seasons: 0 })
  })

  it("keeps a hidden title in the totals and counts", () => {
    const events = [play({ at: "2026-02-01T20:00", zone, film: "a", seconds: 3600 })]
    const totals = computeTotals(events, statsContext(zone, { hidden: ["a"] }))
    expect(totals.totalMinutes).toBe(60)
    expect(totals.counts.films).toBe(1)
  })

  it("splits series and films and counts episodes, series and seasons", () => {
    const events = [
      play({ at: "2026-02-01T20:00", zone, series: "s1", season: 1, episode: 1, seconds: 2700 }),
      play({ at: "2026-02-01T21:00", zone, series: "s1", season: 1, episode: 1, seconds: 2700 }),
      play({ at: "2026-02-02T20:00", zone, series: "s1", season: 2, episode: 1, seconds: 2700 }),
      play({ at: "2026-02-03T20:00", zone, series: "s2", season: 1, episode: 1, seconds: 2700 }),
      play({ at: "2026-02-04T20:00", zone, film: "f", seconds: 3600, live: true }),
      play({ at: "2026-02-05T20:00", zone, film: "t", seconds: 9999, mediaType: "track" }),
    ]
    const totals = computeTotals(events, ctx)
    expect(totals).toMatchObject({
      totalMinutes: 240,
      seriesMinutes: 180,
      filmMinutes: 60,
      seriesShare: 0.75,
      filmShare: 0.25,
      liveMinutes: 60,
      counts: { episodes: 3, series: 2, films: 1, seasons: 3 },
    })
  })

  it("averages over the elapsed days and splits the total into days and hours", () => {
    // 1,307 hours, as in the heavy fixture.
    const events = Array.from({ length: 1307 }, (_, i) =>
      play({ at: `2026-${String(1 + (i % 11)).padStart(2, "0")}-10T20:00`, zone, film: `f${i}`, seconds: 3600 })
    )
    const totals = computeTotals(events, ctx)
    expect(totals.totalMinutes).toBe(78420)
    expect(totals.daysHours).toEqual({ days: 54, hours: 11 })
    expect(totals.perDay).toBe(Math.floor(78420 / 334))
    expect(computeTotals(events, statsContext(zone, { finalCut: true })).perDay).toBe(Math.floor(78420 / 365))
  })

  it("compares with the same window of 2025, recomputed from the lifetime plays", () => {
    const events = [play({ at: "2026-03-01T20:00", zone, film: "a", seconds: 7080 })]
    const lifetime = [
      play({ at: "2024-03-01T20:00", zone, film: "old", seconds: 99_999 }),
      play({ at: "2025-03-01T20:00", zone, film: "b", seconds: 3000 }),
      play({ at: "2025-03-01T22:00", zone, film: "c", seconds: 3000 }),
      play({ at: "2025-12-15T20:00", zone, film: "december", seconds: 99_999 }),
      ...events,
    ]
    const totals = computeTotals(events, ctx, lifetime)
    expect(totals.vsLastYear).toBeCloseTo(18 / 100)
    expect(totals.minutes2025).toHaveLength(334)
    expect(totals.minutes2025!.reduce((a, b) => a + b, 0)).toBe(100)
    expect(totals.minutes2025![59]).toBe(100) // 1 March 2025
  })

  it("has no comparison without last year's plays", () => {
    const totals = computeTotals([play({ at: "2026-03-01T20:00", zone, film: "a" })], ctx, [])
    expect([totals.vsLastYear, totals.minutes2025]).toEqual([null, null])
    expect(computeTotals([], ctx)).toMatchObject({ totalMinutes: 0, seriesShare: 0, filmShare: 0, vsLastYear: null })
  })
})
