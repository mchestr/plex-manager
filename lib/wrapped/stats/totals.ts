/**
 * The number page's facts (page 02): total, series and film minutes and
 * their shares, the counts, live minutes, the per-day average, and the
 * comparison with the same window of the year before.
 *
 * Every minute counts toward the totals, hidden titles included; the counts
 * take only counted plays (FR-46) and key titles by rating key (RWP-07). The
 * comparison is recomputed here from the earlier year's events, never read
 * from a stored Rewind (RWP-03).
 *
 * @module lib/wrapped/stats/totals
 */

import { zonedParts } from "@/lib/utils/zoned-time"
import { isCountedPlay, type PlayEvent } from "@/lib/wrapped/sources/watch-history-source"
import { dataWindow, elapsedDays, inWindow } from "@/lib/wrapped/time/zone"

import { dailyMinutes } from "./calendar"
import { minutesOf, videoEvents, type StatsContext } from "./keys"

export interface Totals {
  totalMinutes: number
  seriesMinutes: number
  filmMinutes: number
  /** 0-1, from seconds; 0 when nothing was watched. */
  seriesShare: number
  filmShare: number
  liveMinutes: number
  counts: { episodes: number; series: number; films: number; seasons: number }
  /** Whole minutes a day over the window's elapsed days. */
  perDay: number
  /** The total as whole days and the hours left over. */
  daysHours: { days: number; hours: number }
  /** The change on last year's minutes over the same window, as a ratio (0.18 is +18%); null without them. */
  vsLastYear: number | null
  /** Last year's minutes per day over the same window; null without any. */
  minutes2025: number[] | null
}

function sumSeconds(events: readonly PlayEvent[]): number {
  return events.reduce((sum, e) => sum + e.playSeconds, 0)
}

function countTitles(events: ReturnType<typeof videoEvents>): Totals["counts"] {
  const episodes = new Set<string>()
  const series = new Set<string>()
  const films = new Set<string>()
  const seasons = new Set<string>()
  for (const e of events.filter(isCountedPlay)) {
    if (e.mediaType === "movie") {
      films.add(e.ratingKey)
    } else {
      episodes.add(e.ratingKey)
      series.add(e.grandparentRatingKey!)
      if (e.parentMediaIndex !== null) seasons.add(`${e.grandparentRatingKey}:${e.parentMediaIndex}`)
    }
  }
  return { episodes: episodes.size, series: series.size, films: films.size, seasons: seasons.size }
}

/**
 * @param events - The member's plays in `ctx.window`.
 * @param lifetime - All of the member's plays; only those in last year's
 *   matching window are read. Omit it when there is no lifetime pass.
 *
 * @example
 * ```ts
 * const totals = computeTotals(events, ctx, lifetime)
 * totals.totalMinutes // 78420
 * totals.daysHours    // { days: 54, hours: 11 }
 * totals.vsLastYear   // 0.18
 * ```
 */
export function computeTotals(events: readonly PlayEvent[], ctx: StatsContext, lifetime?: readonly PlayEvent[]): Totals {
  const plays = videoEvents(events)
  const seriesSeconds = sumSeconds(plays.filter((e) => e.mediaType === "episode"))
  const filmSeconds = sumSeconds(plays.filter((e) => e.mediaType === "movie"))
  const totalSeconds = seriesSeconds + filmSeconds
  const totalMinutes = minutesOf(totalSeconds)
  const year = zonedParts(ctx.window.start, ctx.zone).year

  const lastWindow = dataWindow(year - 1, ctx.zone, { finalCut: ctx.finalCut })
  const lastYear = (lifetime ?? []).filter((e) => inWindow(e.startedAt, lastWindow))
  const lastMinutes = minutesOf(sumSeconds(videoEvents(lastYear)))

  return {
    totalMinutes,
    seriesMinutes: minutesOf(seriesSeconds),
    filmMinutes: minutesOf(filmSeconds),
    seriesShare: totalSeconds > 0 ? seriesSeconds / totalSeconds : 0,
    filmShare: totalSeconds > 0 ? filmSeconds / totalSeconds : 0,
    liveMinutes: minutesOf(sumSeconds(plays.filter((e) => e.live))),
    counts: countTitles(plays),
    perDay: Math.floor(totalMinutes / elapsedDays(year, { finalCut: ctx.finalCut })),
    daysHours: { days: Math.floor(totalMinutes / 1440), hours: Math.floor((totalMinutes % 1440) / 60) },
    vsLastYear: lastMinutes > 0 ? (totalMinutes - lastMinutes) / lastMinutes : null,
    minutes2025: lastMinutes > 0 ? dailyMinutes(lastYear, lastWindow).map((day) => day.minutes) : null,
  }
}
