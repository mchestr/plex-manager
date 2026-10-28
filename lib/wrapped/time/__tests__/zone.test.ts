/**
 * The Rewind zone and the zone-aware year and data windows (P2.2, design 7.7).
 */

import {
  dataWindow,
  elapsedDays,
  hourOf,
  inWindow,
  monthOf,
  paddedDateRange,
  resolveZone,
  weekdayOf,
  yearWindow,
} from "@/lib/wrapped/time/zone"

const iso = (ms: number) => new Date(ms).toISOString()

describe("resolveZone", () => {
  it("uses the member's zone when set", () => {
    expect(resolveZone({ timezone: "Europe/London" }, "America/Chicago")).toEqual({
      zone: "Europe/London",
      source: "member",
    })
  })

  it("stores an alias under its canonical name", () => {
    expect(resolveZone({ timezone: "US/Pacific" }, "UTC")).toEqual({ zone: "America/Los_Angeles", source: "member" })
  })

  it.each([null, "", "Mars/Base"])("falls back to the server zone for %p", (timezone) => {
    expect(resolveZone({ timezone }, "America/Chicago")).toEqual({ zone: "America/Chicago", source: "server" })
  })
})

describe("yearWindow", () => {
  it.each([
    ["UTC", "2026-01-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z"],
    ["America/Los_Angeles", "2026-01-01T08:00:00.000Z", "2027-01-01T08:00:00.000Z"],
    ["Europe/Berlin", "2025-12-31T23:00:00.000Z", "2026-12-31T23:00:00.000Z"],
    ["Australia/Sydney", "2025-12-31T13:00:00.000Z", "2026-12-31T13:00:00.000Z"],
  ])("is half-open in %s", (zone, start, end) => {
    const window = yearWindow(2026, zone)
    expect([iso(window.start), iso(window.end), window.zone]).toEqual([start, end, zone])
    expect(inWindow(window.start, window)).toBe(true)
    expect(inWindow(window.end, window)).toBe(false)
    expect(inWindow(window.end - 1, window)).toBe(true)
  })

  it("keeps a play that starts at 23:30 on 31 December in that year", () => {
    const window = yearWindow(2026, "America/Los_Angeles")
    const lateStart = Date.parse("2027-01-01T07:30:00Z") // 23:30 PST on 31 December
    expect(inWindow(lateStart, window)).toBe(true)
    expect(inWindow(lateStart, yearWindow(2027, "America/Los_Angeles"))).toBe(false)
  })
})

describe("dataWindow", () => {
  it("ends at the end of 30 November in the zone during the season", () => {
    const window = dataWindow(2026, "Europe/Berlin", { finalCut: false })
    expect(iso(window.start)).toBe("2025-12-31T23:00:00.000Z")
    expect(iso(window.end)).toBe("2026-11-30T23:00:00.000Z")
    expect(inWindow(Date.parse("2026-11-30T22:59:59.999Z"), window)).toBe(true) // 23:59:59.999 CET
    expect(inWindow(Date.parse("2026-11-30T23:00:00Z"), window)).toBe(false)
  })

  it("is the whole year once the year has ended", () => {
    expect(dataWindow(2026, "UTC", { finalCut: true })).toEqual(yearWindow(2026, "UTC"))
  })
})

describe("elapsedDays", () => {
  it.each([
    [2026, false, 334],
    [2028, false, 335],
    [2026, true, 365],
    [2028, true, 366],
  ])("%i with finalCut %p is %i days", (year, finalCut, days) => {
    expect(elapsedDays(year, { finalCut })).toBe(days)
  })

  it("matches the data window's length in days in UTC", () => {
    for (const year of [2026, 2028]) {
      const window = dataWindow(year, "UTC", { finalCut: false })
      expect((window.end - window.start) / 86_400_000).toBe(elapsedDays(year, { finalCut: false }))
    }
  })
})

describe("paddedDateRange", () => {
  it.each(["UTC", "America/Los_Angeles", "Europe/Berlin", "Australia/Sydney"])(
    "adds a day on each side of the year in %s",
    (zone) => {
      expect(paddedDateRange(yearWindow(2026, zone))).toEqual({ after: "2025-12-31", before: "2027-01-01" })
    },
  )

  it("pads the season window to 1 December", () => {
    expect(paddedDateRange(dataWindow(2026, "America/Chicago", { finalCut: false }))).toEqual({
      after: "2025-12-31",
      before: "2026-12-01",
    })
  })
})

describe("buckets", () => {
  // 2026-03-11T05:00Z: Tuesday 22:00 PDT in Los Angeles, Wednesday 16:00 AEDT in Sydney
  const instant = Date.parse("2026-03-11T05:00:00Z")

  it.each([
    ["America/Los_Angeles", 22, 2, 3],
    ["Australia/Sydney", 16, 3, 3],
    ["UTC", 5, 3, 3],
  ])("reads hour, weekday and month in %s", (zone, hour, weekday, month) => {
    expect([hourOf(instant, zone), weekdayOf(instant, zone), monthOf(instant, zone)]).toEqual([hour, weekday, month])
  })

  it("puts the first minute of the year in January, wherever the instant is", () => {
    const start = yearWindow(2027, "Australia/Sydney").start
    expect([monthOf(start, "Australia/Sydney"), monthOf(start, "UTC")]).toEqual([1, 12])
  })
})
