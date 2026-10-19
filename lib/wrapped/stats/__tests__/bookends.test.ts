/**
 * @jest-environment node
 */

/**
 * The bookends page's facts (P2.7).
 */

import { computeBookends } from "@/lib/wrapped/stats/bookends"

import { play, statsContext, ZONES } from "./build-events"

describe.each(ZONES)("computeBookends in %s", (zone) => {
  const ctx = statsContext(zone)

  it("opens and closes the year with the first and last counted, listed plays", () => {
    const events = [
      play({ at: "2026-11-29T23:45", zone, film: "last" }),
      play({ at: "2026-01-01T00:05", zone, film: "sample", seconds: 60, percent: 10 }),
      play({ at: "2026-01-01T00:30", zone, film: "hidden" }),
      play({ at: "2026-01-01T19:15", zone, series: "s", title: "Severance" }),
    ]
    const bookends = computeBookends(events, statsContext(zone, { hidden: ["hidden"] }))
    expect(bookends.first).toEqual({ key: "series:s", title: "Severance", date: "2026-01-01", hour: 19, minute: 15 })
    expect(bookends.last).toEqual({ key: "film:last", title: "Film last", date: "2026-11-29", hour: 23, minute: 45 })
    expect(bookends.sameTitleSameDay).toBe(false)
  })

  it("flags the same title on the same day", () => {
    const events = [play({ at: "2026-05-01T18:00", zone, film: "a" }), play({ at: "2026-05-01T21:00", zone, film: "a" })]
    expect(computeBookends(events, ctx).sameTitleSameDay).toBe(true)
  })

  it("reads the member's first day and lifetime hours from the lifetime plays", () => {
    const events = [play({ at: "2026-05-01T18:00", zone, film: "a", seconds: 5400 })]
    const lifetime = [
      play({ at: "2023-02-11T21:00", zone, film: "first", seconds: 3600 * 10 }),
      play({ at: "2024-06-01T21:00", zone, film: "track", seconds: 3600 * 99, mediaType: "track" }),
      ...events,
    ]
    expect(computeBookends(events, ctx, lifetime).member).toEqual({ since: "2023-02-11", lifetimeHours: 11 })
  })

  it("leaves the member facts null without the lifetime pass, and the bookends null without plays", () => {
    expect(computeBookends([], ctx)).toEqual({
      first: null,
      last: null,
      sameTitleSameDay: false,
      member: { since: null, lifetimeHours: null },
    })
  })
})
