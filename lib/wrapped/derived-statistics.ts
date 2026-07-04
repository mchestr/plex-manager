/**
 * Derived viewing-pattern statistics computed from Tautulli watch history.
 *
 * ## Overview
 *
 * Pure functions that turn a user's year-filtered history into pattern
 * insights the LLM cannot compute reliably on its own: watch streaks, the
 * peak viewing hour, hour/day-of-week histograms, and server percentile.
 * All functions are side-effect free and require no additional API calls —
 * they operate on the history already fetched by `fetchTautulliStatistics`.
 *
 * ## Special cases
 *
 * - Items with no positive watch time (or non-video media types) are ignored.
 * - Timestamps are bucketed in the server's local timezone via `Date`.
 * - An empty history yields `longestStreak: null`, `mostActiveDay: null`,
 *   zeroed histograms, and a `peakHour` of `null`.
 */

import type { TautulliHistoryItem } from "@/lib/validations/tautulli"

export interface DerivedStatistics {
  /** Longest run of consecutive calendar days with at least one play */
  longestStreak: { days: number; start: string; end: string } | null
  /** Hour of day (0-23) with the most plays, with a friendly label */
  peakHour: { hour: number; label: string; plays: number } | null
  /** Minutes watched per hour of day (24 buckets, index = hour) */
  hourHistogram: number[]
  /** Minutes watched per day of week, Sunday first */
  dayOfWeekHistogram: Array<{ day: string; watchTime: number }>
  /** Single calendar day with the most minutes watched */
  mostActiveDay: { date: string; watchTime: number } | null
  /** Share of watch time falling on Saturday/Sunday */
  weekendVsWeekday: { weekendPct: number }
}

export interface PercentileResult {
  /** 1-100, lower is better (1 = top of the leaderboard) */
  percentile: number
  /** Display label, e.g. "Top 5%" */
  topPercentLabel: string
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const

/** Format an hour (0-23) as "12 AM" / "3 PM" style label */
export function formatHourLabel(hour: number): string {
  const period = hour < 12 ? "AM" : "PM"
  const display = hour % 12 === 0 ? 12 : hour % 12
  return `${display} ${period}`
}

/** Format a Date as a local YYYY-MM-DD key */
function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function computeDerivedStatistics(
  history: TautulliHistoryItem[],
  year: number
): DerivedStatistics {
  const hourHistogram = new Array<number>(24).fill(0)
  const hourPlays = new Array<number>(24).fill(0)
  const dayOfWeekMinutes = new Array<number>(7).fill(0)
  const dailyMinutes = new Map<string, number>()

  for (const item of history) {
    if (item.media_type !== "movie" && item.media_type !== "episode") continue

    const watchedSeconds = item.viewed_duration || item.duration || 0
    const minutes = Math.floor(watchedSeconds / 60)
    if (minutes <= 0) continue

    const timestamp = item.started || item.date
    if (!timestamp) continue

    const when = new Date(timestamp * 1000)
    if (when.getFullYear() !== year) continue

    hourHistogram[when.getHours()] += minutes
    hourPlays[when.getHours()] += 1
    dayOfWeekMinutes[when.getDay()] += minutes

    const dateKey = toDateKey(when)
    dailyMinutes.set(dateKey, (dailyMinutes.get(dateKey) || 0) + minutes)
  }

  // Peak hour by play count (ties resolve to the earliest hour)
  let peakHour: DerivedStatistics["peakHour"] = null
  const maxPlays = Math.max(...hourPlays)
  if (maxPlays > 0) {
    const hour = hourPlays.indexOf(maxPlays)
    peakHour = { hour, label: formatHourLabel(hour), plays: maxPlays }
  }

  // Longest streak of consecutive days with plays
  let longestStreak: DerivedStatistics["longestStreak"] = null
  const sortedDays = Array.from(dailyMinutes.keys()).sort()
  if (sortedDays.length > 0) {
    let bestStart = sortedDays[0]
    let bestLength = 1
    let runStart = sortedDays[0]
    let runLength = 1

    for (let i = 1; i < sortedDays.length; i++) {
      const prev = new Date(`${sortedDays[i - 1]}T12:00:00`)
      const curr = new Date(`${sortedDays[i]}T12:00:00`)
      // Noon-to-noon diff avoids DST off-by-one on 23/25-hour days
      const dayDiff = Math.round(
        (curr.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000)
      )
      if (dayDiff === 1) {
        runLength += 1
      } else {
        runStart = sortedDays[i]
        runLength = 1
      }
      if (runLength > bestLength) {
        bestLength = runLength
        bestStart = runStart
      }
    }

    const startDate = new Date(`${bestStart}T12:00:00`)
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + bestLength - 1)
    longestStreak = {
      days: bestLength,
      start: bestStart,
      end: toDateKey(endDate),
    }
  }

  // Most active single day
  let mostActiveDay: DerivedStatistics["mostActiveDay"] = null
  for (const [date, watchTime] of dailyMinutes) {
    if (!mostActiveDay || watchTime > mostActiveDay.watchTime) {
      mostActiveDay = { date, watchTime }
    }
  }

  const totalMinutes = dayOfWeekMinutes.reduce((sum, m) => sum + m, 0)
  const weekendMinutes = dayOfWeekMinutes[0] + dayOfWeekMinutes[6]
  const weekendPct =
    totalMinutes > 0 ? Math.round((weekendMinutes / totalMinutes) * 100) : 0

  return {
    longestStreak,
    peakHour,
    hourHistogram,
    dayOfWeekHistogram: DAY_NAMES.map((day, i) => ({
      day,
      watchTime: dayOfWeekMinutes[i],
    })),
    mostActiveDay,
    weekendVsWeekday: { weekendPct },
  }
}

/**
 * Convert a leaderboard position into a "Top X%" percentile.
 *
 * @example
 * ```ts
 * computePercentile(1, 50) // { percentile: 2, topPercentLabel: "Top 2%" }
 * computePercentile(25, 50) // { percentile: 50, topPercentLabel: "Top 50%" }
 * ```
 */
export function computePercentile(
  userPosition: number,
  totalUsers: number
): PercentileResult {
  const raw = Math.ceil((userPosition / totalUsers) * 100)
  const percentile = Math.min(100, Math.max(1, raw))
  return { percentile, topPercentLabel: `Top ${percentile}%` }
}
