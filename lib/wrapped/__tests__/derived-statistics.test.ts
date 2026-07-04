import type { TautulliHistoryItem } from "@/lib/validations/tautulli"
import {
  computeDerivedStatistics,
  computePercentile,
  formatHourLabel,
} from "@/lib/wrapped/derived-statistics"

const YEAR = 2026

/** Build a history item watched at a given local date/hour */
function play(
  dateStr: string,
  hour: number,
  overrides: Partial<TautulliHistoryItem> = {}
): TautulliHistoryItem {
  const when = new Date(`${dateStr}T${String(hour).padStart(2, "0")}:30:00`)
  return {
    date: Math.floor(when.getTime() / 1000),
    duration: 3600,
    viewed_duration: 3600,
    media_type: "movie",
    title: "Test Movie",
    ...overrides,
  }
}

describe("computeDerivedStatistics", () => {
  it("returns empty results for empty history", () => {
    const result = computeDerivedStatistics([], YEAR)

    expect(result.longestStreak).toBeNull()
    expect(result.peakHour).toBeNull()
    expect(result.mostActiveDay).toBeNull()
    expect(result.hourHistogram).toEqual(new Array(24).fill(0))
    expect(result.weekendVsWeekday.weekendPct).toBe(0)
    expect(result.dayOfWeekHistogram).toHaveLength(7)
  })

  it("computes a streak spanning a month boundary", () => {
    const history = [
      play("2026-01-30", 20),
      play("2026-01-31", 20),
      play("2026-02-01", 20),
      play("2026-02-02", 20),
      // gap
      play("2026-02-10", 20),
    ]

    const result = computeDerivedStatistics(history, YEAR)

    expect(result.longestStreak).toEqual({
      days: 4,
      start: "2026-01-30",
      end: "2026-02-02",
    })
  })

  it("handles a single-day user", () => {
    const history = [play("2026-06-15", 21), play("2026-06-15", 23)]

    const result = computeDerivedStatistics(history, YEAR)

    expect(result.longestStreak).toEqual({
      days: 1,
      start: "2026-06-15",
      end: "2026-06-15",
    })
    expect(result.mostActiveDay).toEqual({ date: "2026-06-15", watchTime: 120 })
  })

  it("picks the hour with the most plays as peak hour", () => {
    const history = [
      play("2026-03-01", 23),
      play("2026-03-02", 23),
      play("2026-03-03", 23),
      play("2026-03-04", 9),
    ]

    const result = computeDerivedStatistics(history, YEAR)

    expect(result.peakHour).toEqual({ hour: 23, label: "11 PM", plays: 3 })
    expect(result.hourHistogram[23]).toBe(180)
    expect(result.hourHistogram[9]).toBe(60)
  })

  it("computes weekend percentage of watch time", () => {
    const history = [
      play("2026-06-06", 20), // Saturday
      play("2026-06-07", 20), // Sunday
      play("2026-06-08", 20), // Monday
      play("2026-06-09", 20), // Tuesday
    ]

    const result = computeDerivedStatistics(history, YEAR)

    expect(result.weekendVsWeekday.weekendPct).toBe(50)
    expect(result.dayOfWeekHistogram[6]).toEqual({
      day: "Saturday",
      watchTime: 60,
    })
  })

  it("ignores zero-duration plays, tracks, and other years", () => {
    const history = [
      play("2026-05-01", 20),
      play("2026-05-02", 20, { viewed_duration: 0, duration: 0 }),
      play("2026-05-03", 20, { media_type: "track" }),
      play("2025-12-31", 20),
    ]

    const result = computeDerivedStatistics(history, YEAR)

    expect(result.longestStreak).toEqual({
      days: 1,
      start: "2026-05-01",
      end: "2026-05-01",
    })
    expect(result.hourHistogram[20]).toBe(60)
  })

  it("prefers started over date for hour bucketing", () => {
    const dateAt = new Date("2026-04-01T02:00:00")
    const startedAt = new Date("2026-04-01T22:00:00")
    const history: TautulliHistoryItem[] = [
      {
        date: Math.floor(dateAt.getTime() / 1000),
        started: Math.floor(startedAt.getTime() / 1000),
        duration: 3600,
        media_type: "movie",
        title: "Test",
      },
    ]

    const result = computeDerivedStatistics(history, YEAR)

    expect(result.peakHour?.hour).toBe(22)
  })
})

describe("computePercentile", () => {
  it("computes standard percentiles", () => {
    expect(computePercentile(1, 50)).toEqual({
      percentile: 2,
      topPercentLabel: "Top 2%",
    })
    expect(computePercentile(25, 50)).toEqual({
      percentile: 50,
      topPercentLabel: "Top 50%",
    })
  })

  it("clamps to Top 1% at minimum", () => {
    expect(computePercentile(1, 500).topPercentLabel).toBe("Top 1%")
  })

  it("handles last place and single-user servers", () => {
    expect(computePercentile(50, 50).percentile).toBe(100)
    expect(computePercentile(1, 1).percentile).toBe(100)
  })
})

describe("formatHourLabel", () => {
  it.each([
    [0, "12 AM"],
    [1, "1 AM"],
    [11, "11 AM"],
    [12, "12 PM"],
    [13, "1 PM"],
    [23, "11 PM"],
  ])("formats hour %i as %s", (hour, label) => {
    expect(formatHourLabel(hour)).toBe(label)
  })
})
