/**
 * @jest-environment node
 */

/**
 * The calendar page's facts (P2.7, design 7.7).
 */

import { computeCalendar } from "@/lib/wrapped/stats/calendar"

import { play, statsContext, ZONES } from "./build-events"

describe.each(ZONES)("computeCalendar in %s", (zone) => {
  const ctx = statsContext(zone)
  const at = (wall: string, extra: Partial<Parameters<typeof play>[0]> = {}) => play({ at: wall, zone, film: "f", ...extra })

  it("keeps 23:30 on 31 December on 31 December", () => {
    const calendar = computeCalendar([at("2026-12-31T23:30", { seconds: 3600 })], statsContext(zone, { finalCut: true }))
    expect(calendar.minutes).toHaveLength(365)
    expect(calendar.minutes.at(-1)).toEqual({ date: "2026-12-31", minutes: 60 })
    expect(calendar.biggest).toEqual({ date: "2026-12-31", minutes: 60 })
  })

  it("covers 334 days when the window ends on 30 November", () => {
    const calendar = computeCalendar([], ctx)
    expect(calendar.minutes).toHaveLength(334)
    expect(calendar.minutes.at(-1)!.date).toBe("2026-11-30")
    expect(calendar).toMatchObject({ active: 0, biggest: null, streak: null, longestGap: null, topTitle: [] })
  })

  it("lets a streak cross a month boundary", () => {
    const events = ["2026-03-30", "2026-03-31", "2026-04-01", "2026-04-02", "2026-04-05"].map((d) => at(`${d}T20:00`))
    const calendar = computeCalendar(events, ctx)
    expect(calendar.streak).toEqual({ days: 4, from: "2026-03-30", to: "2026-04-02" })
    expect(calendar.active).toBe(5)
  })

  it("finds the longest gap between active days, with its month", () => {
    const events = ["2026-04-28", "2026-05-03", "2026-05-13", "2026-05-14"].map((d) => at(`${d}T20:00`))
    expect(computeCalendar(events, ctx).longestGap).toEqual({ days: 9, from: "2026-05-04", to: "2026-05-12", month: 5 })
  })

  it("does not count a day with only an uncounted play as active", () => {
    const calendar = computeCalendar([at("2026-02-01T20:00", { seconds: 70, percent: 30 })], ctx)
    expect(calendar.active).toBe(0)
    expect(calendar.minutes[31]).toEqual({ date: "2026-02-01", minutes: 1 })
  })

  it("names each active day's top listed title and the biggest day", () => {
    const calendar = computeCalendar(
      [
        at("2026-07-04T10:00", { film: "a", seconds: 3600 }),
        at("2026-07-04T13:00", { film: "b", seconds: 7200 }),
        at("2026-07-05T20:00", { film: "a", seconds: 600 }),
        at("2026-07-05T21:00", { film: "hidden", seconds: 6000 }),
      ],
      statsContext(zone, { hidden: ["hidden"] })
    )
    expect(calendar.biggest).toEqual({ date: "2026-07-04", minutes: 180 })
    expect(calendar.topTitle).toEqual([
      { date: "2026-07-04", key: "film:b", title: "Film b", minutes: 120 },
      { date: "2026-07-05", key: "film:a", title: "Film a", minutes: 10 },
    ])
  })
})
