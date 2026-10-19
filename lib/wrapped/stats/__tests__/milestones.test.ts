/**
 * @jest-environment node
 */

/**
 * The milestone ladder (P2.7).
 */

import { addDays } from "@/lib/wrapped/stats/days"
import { computeMilestones } from "@/lib/wrapped/stats/milestones"

import { play, ZONES } from "./build-events"

describe.each(ZONES)("computeMilestones in %s", (zone) => {
  // `count` one-hour plays, four a day from 1 January at 18:00, 19:00, 20:00 and 21:00.
  const hours = (count: number) =>
    Array.from({ length: count }, (_, i) =>
      play({ at: `${addDays("2026-01-01", Math.floor(i / 4))}T${18 + (i % 4)}:00`, zone, film: `f${i}`, seconds: 3600 })
    )

  it("climbs 250, 500, 750 and 1,000 at 1,307 hours, dated by the crossing play", () => {
    expect(computeMilestones(hours(1307), { zone })).toEqual([
      { hours: 250, date: addDays("2026-01-01", 62) },
      { hours: 500, date: addDays("2026-01-01", 124) },
      { hours: 750, date: addDays("2026-01-01", 187) },
      { hours: 1000, date: addDays("2026-01-01", 249) },
    ])
  })

  it("climbs 10, 25 and 50 at 60 hours", () => {
    expect(computeMilestones(hours(60), { zone }).map((m) => m.hours)).toEqual([10, 25, 50])
  })

  it("has no ladder under 10 hours", () => {
    expect(computeMilestones(hours(9), { zone })).toEqual([])
  })

  it("crosses several rungs on one long play", () => {
    const [long] = hours(1)
    expect(computeMilestones([{ ...long, playSeconds: 30 * 3600 }], { zone })).toEqual([
      { hours: 10, date: "2026-01-01" },
      { hours: 25, date: "2026-01-01" },
    ])
  })
})
