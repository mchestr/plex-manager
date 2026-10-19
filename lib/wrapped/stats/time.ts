/**
 * The clock page's facts (page 09): when the member presses play.
 *
 * Every figure counts counted plays (FR-46) by the wall-clock time they
 * started in the member's zone. After dark is "started 10 PM to 4 AM",
 * hours 22 to 3 (D8); the golden hour is hours 18 to 21. Late starts are
 * compared on a night that runs to 04:00, so 02:47 is later than 23:10.
 *
 * @module lib/wrapped/stats/time
 */

import { formatDayKey, zonedParts } from "@/lib/utils/zoned-time"
import { isCountedPlay, type PlayEvent } from "@/lib/wrapped/sources/watch-history-source"

import { videoEvents, type StatsContext } from "./keys"

const AFTER_DARK = new Set([22, 23, 0, 1, 2, 3])
const GOLDEN = new Set([18, 19, 20, 21])
const NIGHT_ENDS = 4 * 60

export interface ClockTime {
  hour: number
  minute: number
}

export interface TimeStats {
  /** Counted plays by start hour, 0-23. */
  histogram: number[]
  /** The busiest and quietest hours; the earliest wins a tie. Null without plays. */
  peak: number | null
  quietest: number | null
  afterDarkShare: number
  goldenShare: number
  /** The median start on the night clock (04:00 to 04:00). */
  medianStart: ClockTime | null
  /** The latest start on the night clock, with its date and weekday (0 = Sunday). */
  latestStart: (ClockTime & { date: string; weekday: number }) | null
  /** Shares of counted plays by start weekday, 0 = Sunday. */
  weekdayShare: number[]
  weekendShare: number
}

/** Minutes after 04:00, so a night sorts in viewing order. */
const nightMinute = ({ hour, minute }: ClockTime) => (hour * 60 + minute - NIGHT_ENDS + 1440) % 1440
const fromNightMinute = (value: number): ClockTime => {
  const minutes = (value + NIGHT_ENDS) % 1440
  return { hour: Math.floor(minutes / 60), minute: minutes % 60 }
}

function extreme(histogram: number[], pick: (a: number, b: number) => boolean): number {
  return histogram.reduce((best, count, hour) => (pick(count, histogram[best]) ? hour : best), 0)
}

/**
 * @example
 * ```ts
 * const time = computeTime(events, ctx)
 * time.peak           // 22
 * time.afterDarkShare // 0.41
 * time.latestStart    // { hour: 2, minute: 47, date: "2026-06-14", weekday: 0 }
 * ```
 */
export function computeTime(events: readonly PlayEvent[], ctx: Pick<StatsContext, "zone">): TimeStats {
  // Oldest first, so the latest start on a tie is the most recent one.
  const starts = videoEvents(events)
    .filter(isCountedPlay)
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((e) => zonedParts(e.startedAt, ctx.zone))
  const histogram = Array.from({ length: 24 }, () => 0)
  const weekdays = Array.from({ length: 7 }, () => 0)
  for (const { hour, weekday } of starts) {
    histogram[hour] += 1
    weekdays[weekday] += 1
  }
  const n = starts.length
  const share = (hours: Set<number>) => (n > 0 ? starts.filter((p) => hours.has(p.hour)).length / n : 0)

  const byNight = [...starts].sort((a, b) => nightMinute(a) - nightMinute(b))
  const latest = byNight.at(-1)
  const middle = n > 0 ? nightMinute(byNight[Math.floor((n - 1) / 2)]) : 0
  const median = n % 2 === 0 && n > 0 ? Math.floor((middle + nightMinute(byNight[n / 2])) / 2) : middle

  return {
    histogram,
    peak: n > 0 ? extreme(histogram, (a, b) => a > b) : null,
    quietest: n > 0 ? extreme(histogram, (a, b) => a < b) : null,
    afterDarkShare: share(AFTER_DARK),
    goldenShare: share(GOLDEN),
    medianStart: n > 0 ? fromNightMinute(median) : null,
    latestStart: latest
      ? {
          hour: latest.hour,
          minute: latest.minute,
          date: formatDayKey(latest.year, latest.month, latest.day),
          weekday: latest.weekday,
        }
      : null,
    weekdayShare: weekdays.map((count) => (n > 0 ? count / n : 0)),
    weekendShare: n > 0 ? (weekdays[0] + weekdays[6]) / n : 0,
  }
}
