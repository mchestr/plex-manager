/**
 * @jest-environment node
 */

/**
 * The clock page's facts (P2.7, design 7.7, D8).
 */

import { computeTime } from "@/lib/wrapped/stats/time"

import { play, ZONES } from "./build-events"

describe.each(ZONES)("computeTime in %s", (zone) => {
  const ctx = { zone }
  const at = (wall: string, extra: Partial<Parameters<typeof play>[0]> = {}) => play({ at: wall, zone, film: wall, ...extra })

  it("puts 21:00 on 10 March in hour 21 on a Tuesday under every process zone", () => {
    const original = process.env.TZ
    try {
      for (const processZone of ZONES) {
        process.env.TZ = processZone
        const time = computeTime([at("2026-03-10T21:00")], ctx)
        expect(time.histogram[21]).toBe(1)
        expect(time.weekdayShare[2]).toBe(1)
        expect(time.latestStart).toEqual({ hour: 21, minute: 0, date: "2026-03-10", weekday: 2 })
      }
    } finally {
      process.env.TZ = original
    }
  })

  it("holds the after-dark boundaries at 22:00 and 04:00", () => {
    const share = (wall: string) => computeTime([at(wall)], ctx).afterDarkShare
    expect([share("2026-05-05T21:59"), share("2026-05-05T22:00")]).toEqual([0, 1])
    expect([share("2026-05-06T03:59"), share("2026-05-06T04:00")]).toEqual([1, 0])
  })

  it("counts the golden hour as 18:00 to 21:59", () => {
    const share = (wall: string) => computeTime([at(wall)], ctx).goldenShare
    expect([share("2026-05-05T17:59"), share("2026-05-05T18:00"), share("2026-05-05T21:59"), share("2026-05-05T22:00")]).toEqual([0, 1, 1, 0])
  })

  it("does not crash on the spring-forward gap of 8 March 2026", () => {
    const time = computeTime([at("2026-03-08T02:30"), at("2026-03-08T01:30")], ctx)
    expect(time.histogram.reduce((a, b) => a + b, 0)).toBe(2)
  })

  it("treats 02:47 as later than 23:10", () => {
    const time = computeTime([at("2026-06-13T23:10"), at("2026-06-14T02:47"), at("2026-06-15T20:00")], ctx)
    expect(time.latestStart).toEqual({ hour: 2, minute: 47, date: "2026-06-14", weekday: 0 })
  })

  it("takes the median start on the night clock", () => {
    const time = computeTime([at("2026-06-01T20:00"), at("2026-06-02T23:00"), at("2026-06-03T01:00")], ctx)
    expect(time.medianStart).toEqual({ hour: 23, minute: 0 })
    const even = computeTime([at("2026-06-01T23:00"), at("2026-06-02T01:00")], ctx)
    expect(even.medianStart).toEqual({ hour: 0, minute: 0 })
  })

  it("finds the peak and quietest hours and the weekday shares", () => {
    const time = computeTime(
      [
        at("2026-06-06T22:00"), // Saturday
        at("2026-06-07T22:30"), // Sunday
        at("2026-06-08T20:00"), // Monday
        at("2026-06-09T22:15", { seconds: 70, percent: 30 }), // not counted
      ],
      ctx
    )
    expect(time.peak).toBe(22)
    expect(time.quietest).toBe(0)
    expect(time.histogram[22]).toBe(2)
    expect(time.weekendShare).toBeCloseTo(2 / 3)
    expect(time.weekdayShare[1]).toBeCloseTo(1 / 3)
  })

  it("is empty without counted plays", () => {
    expect(computeTime([], ctx)).toMatchObject({ peak: null, quietest: null, medianStart: null, latestStart: null, afterDarkShare: 0 })
  })
})
