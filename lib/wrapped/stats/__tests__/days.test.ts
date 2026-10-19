/**
 * @jest-environment node
 */

/**
 * Day-key arithmetic (P2.7).
 */

import { wallTimeToInstant } from "@/lib/utils/zoned-time"
import { addDays, daysBetween, nightKey, weekStart, windowDays } from "@/lib/wrapped/stats/days"
import { dataWindow } from "@/lib/wrapped/time/zone"

import { ZONES } from "./build-events"

describe("addDays and daysBetween", () => {
  it("step across months, years and 29 February", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01")
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29")
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31")
    expect(daysBetween("2026-03-30", "2026-04-02")).toBe(3)
  })
})

describe.each(ZONES)("in %s", (zone) => {
  it("lists the 334 days of the season window", () => {
    const days = windowDays(dataWindow(2026, zone, { finalCut: false }))
    expect(days).toHaveLength(334)
    expect([days[0], days.at(-1)]).toEqual(["2026-01-01", "2026-11-30"])
  })

  it("puts 01:30 on the night before and 04:00 on its own day", () => {
    expect(nightKey(wallTimeToInstant("2026-03-15T01:30", zone).getTime(), zone)).toBe("2026-03-14")
    expect(nightKey(wallTimeToInstant("2026-03-15T04:00", zone).getTime(), zone)).toBe("2026-03-15")
  })
})

describe("weekStart", () => {
  it("is the Monday of the week", () => {
    expect(weekStart("2026-03-15", 0)).toBe("2026-03-09") // a Sunday
    expect(weekStart("2026-03-09", 1)).toBe("2026-03-09")
  })
})
