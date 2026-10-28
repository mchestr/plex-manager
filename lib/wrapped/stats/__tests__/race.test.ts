/**
 * @jest-environment node
 */

/**
 * The race page's facts (P2.7).
 */

import { computeRace } from "@/lib/wrapped/stats/race"

import { play, statsContext, ZONES } from "./build-events"

describe.each(ZONES)("computeRace in %s", (zone) => {
  const ctx = statsContext(zone)
  const watch = (series: string, month: number, minutes: number) =>
    play({ at: `2026-${String(month).padStart(2, "0")}-15T20:00`, zone, series, title: series.toUpperCase(), seconds: minutes * 60 })

  it("tracks lead changes, the overtake month and the closest gap", () => {
    const race = computeRace(
      [watch("a", 1, 600), watch("c", 2, 100), watch("b", 3, 300), watch("b", 4, 400), watch("a", 6, 200)],
      ctx
    )
    if (!race.eligible) throw new Error("expected an eligible race")
    expect(race.series).toEqual([
      { key: "series:a", title: "A" },
      { key: "series:b", title: "B" },
      { key: "series:c", title: "C" },
    ])
    expect(race.months).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(race.frames[0]).toEqual([600, 0, 0])
    expect(race.frames[3]).toEqual([600, 700, 100])
    expect(race.frames[10]).toEqual([800, 700, 100])
    expect(race.leader.slice(0, 7)).toEqual(["series:a", "series:a", "series:a", "series:b", "series:b", "series:a", "series:a"])
    expect(race).toMatchObject({ leadChanges: 2, overtakeMonth: 6, closestGapMinutes: 100 })
  })

  it("has no lead change when one series leads all year", () => {
    const race = computeRace([watch("a", 1, 900), watch("b", 5, 120), watch("c", 9, 90)], ctx)
    expect(race).toMatchObject({ eligible: true, leadChanges: 0, overtakeMonth: null })
  })

  it("keeps the leader on a tie", () => {
    const race = computeRace([watch("b", 1, 100), watch("a", 2, 100), watch("c", 3, 60), watch("a", 4, 50)], ctx)
    if (!race.eligible) throw new Error("expected an eligible race")
    expect(race.leader.slice(0, 4)).toEqual(["series:b", "series:b", "series:b", "series:a"])
  })

  it("is ineligible with only 2 series of an hour or more", () => {
    expect(computeRace([watch("a", 1, 600), watch("b", 3, 300), watch("c", 5, 59)], ctx)).toEqual({ eligible: false })
  })

  it("is ineligible across fewer than 3 active months", () => {
    expect(computeRace([watch("a", 1, 600), watch("b", 2, 300), watch("c", 2, 90)], ctx)).toEqual({ eligible: false })
  })

  it("leaves a hidden series out of the race", () => {
    const events = [watch("a", 1, 600), watch("b", 3, 300), watch("c", 5, 90)]
    expect(computeRace(events, statsContext(zone, { hidden: ["c"] }))).toEqual({ eligible: false })
  })

  it("runs December in a whole-year issue", () => {
    const race = computeRace([watch("a", 1, 600), watch("b", 3, 300), watch("c", 12, 90)], statsContext(zone, { finalCut: true }))
    expect(race.eligible && race.months.length).toBe(12)
  })
})
