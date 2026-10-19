/**
 * Calendar-day arithmetic on `YYYY-MM-DD` keys. A key is a date with no zone,
 * so stepping it is plain UTC arithmetic; which day an instant falls on is
 * always decided in the member's zone first (`dayKey`).
 *
 * @module lib/wrapped/stats/days
 */

import { formatDayKey, zonedParts } from "@/lib/utils/zoned-time"
import { dayKey, type TimeWindow } from "@/lib/wrapped/time/zone"

const DAY_MS = 86_400_000

const toUtc = (key: string) => {
  const [year, month, day] = key.split("-").map(Number)
  return Date.UTC(year, month - 1, day)
}

/** `key` moved by `days` calendar days. */
export function addDays(key: string, days: number): string {
  return new Date(toUtc(key) + days * DAY_MS).toISOString().slice(0, 10)
}

/** Calendar days from `from` to `to`: 1 for consecutive days. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS)
}

/**
 * Every day the window covers in its zone, in order.
 *
 * @example
 * ```ts
 * windowDays(dataWindow(2026, "America/Los_Angeles", { finalCut: false })).length // 334
 * ```
 */
export function windowDays(window: TimeWindow): string[] {
  const last = dayKey(window.end - 1, window.zone)
  const days: string[] = []
  for (let key = dayKey(window.start, window.zone); key <= last; key = addDays(key, 1)) days.push(key)
  return days
}

/**
 * The night an instant belongs to: a night runs from 04:00 to 04:00, so a
 * play started at 01:30 belongs to the evening before.
 */
export function nightKey(ms: number, zone: string): string {
  const { year, month, day, hour } = zonedParts(ms, zone)
  const key = formatDayKey(year, month, day)
  return hour < 4 ? addDays(key, -1) : key
}

/** The Monday that starts the week of `key`, whose weekday (0 = Sunday) is given. */
export function weekStart(key: string, weekday: number): string {
  return addDays(key, -((weekday + 6) % 7))
}
