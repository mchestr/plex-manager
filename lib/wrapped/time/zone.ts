/**
 * The Rewind zone and the zone-aware year window (design 7.7).
 *
 * A play belongs to year Y when its `started` instant falls in
 * `[Y-01-01T00:00, (Y+1)-01-01T00:00)` in the member's Rewind zone, so a play
 * that starts at 23:30 on 31 December counts for that year. Buckets come from
 * the wall-clock parts of each instant (`zonedParts`), never from the process
 * zone, so DST changes need no special case.
 *
 * @module lib/wrapped/time/zone
 */

import { dayKey, formatDayKey, normalizeTimeZone, wallTimeToInstant, zonedParts } from "@/lib/utils/zoned-time"

/** The day key of an instant in a zone, `YYYY-MM-DD`. */
export { dayKey }

/** A half-open span of instants, `start <= ms < end`, and the zone it was built in. */
export interface TimeWindow {
  start: number
  end: number
  zone: string
}

/** The zone Rewind buckets in, and whose choice it is (drives `tz.note`). */
export interface RewindZone {
  zone: string
  source: "member" | "server"
}

/**
 * The member's zone when they set a valid one, else the server zone.
 *
 * @example
 * ```ts
 * resolveZone({ timezone: "Europe/London" }, "America/Chicago") // { zone: "Europe/London", source: "member" }
 * resolveZone({ timezone: null }, "America/Chicago")            // { zone: "America/Chicago", source: "server" }
 * ```
 */
export function resolveZone(user: { timezone: string | null }, serverZone: string): RewindZone {
  const memberZone = normalizeTimeZone(user.timezone)
  return memberZone ? { zone: memberZone, source: "member" } : { zone: serverZone, source: "server" }
}

/**
 * The hour, 0-23, at which `ms` falls in `zone`.
 * @public P2.7 buckets with it.
 */
export function hourOf(ms: number, zone: string): number {
  return zonedParts(ms, zone).hour
}

/**
 * The weekday of `ms` in `zone`: 0 is Sunday, 6 is Saturday.
 * @public P2.7 buckets with it.
 */
export function weekdayOf(ms: number, zone: string): number {
  return zonedParts(ms, zone).weekday
}

/** The month of `ms` in `zone`, 1-12. */
export function monthOf(ms: number, zone: string): number {
  return zonedParts(ms, zone).month
}

const startOf = (year: number, month: number, day: number, zone: string) =>
  wallTimeToInstant(`${formatDayKey(year, month, day)}T00:00`, zone).getTime()

/**
 * Calendar year `year` in `zone`, half-open.
 *
 * @example
 * ```ts
 * const window = yearWindow(2026, "America/Los_Angeles")
 * new Date(window.start).toISOString() // "2026-01-01T08:00:00.000Z"
 * new Date(window.end).toISOString()   // "2027-01-01T08:00:00.000Z"
 * ```
 *
 * @public P2.6 and P2.7 read whole years.
 */
export function yearWindow(year: number, zone: string): TimeWindow {
  return { start: startOf(year, 1, 1, zone), end: startOf(year + 1, 1, 1, zone), zone }
}

/**
 * The span a Rewind is computed over: during the season, 1 January to the end
 * of 30 November (23:59:59.999) in `zone`; after the final cut, the full year.
 */
export function dataWindow(year: number, zone: string, { finalCut }: { finalCut: boolean }): TimeWindow {
  if (finalCut) return yearWindow(year, zone)
  return { start: startOf(year, 1, 1, zone), end: startOf(year, 12, 1, zone), zone }
}

const isLeapYear = (year: number) => new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1

/**
 * Days the data window covers, for per-day averages: 334 during the season
 * (335 in a leap year), or the whole year after the final cut.
 */
export function elapsedDays(year: number, { finalCut }: { finalCut: boolean }): number {
  const leap = isLeapYear(year) ? 1 : 0
  return (finalCut ? 365 : 334) + leap
}

function shiftDay(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return formatDayKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

/**
 * Tautulli `get_history` `after` and `before` dates for a window, a day wider
 * on each side: Tautulli reads them in its own zone, so the extra day covers
 * any zone difference, and `inWindow` trims the rows by instant (design 7.2).
 *
 * @example
 * ```ts
 * paddedDateRange(yearWindow(2026, "Australia/Sydney"))
 * // { after: "2025-12-31", before: "2027-01-01" }
 * ```
 */
export function paddedDateRange(window: TimeWindow): { after: string; before: string } {
  return {
    after: shiftDay(dayKey(window.start, window.zone), -1),
    before: shiftDay(dayKey(window.end - 1, window.zone), 1),
  }
}

/** Whether `ms` falls inside the half-open window. */
export function inWindow(ms: number, window: Pick<TimeWindow, "start" | "end">): boolean {
  return ms >= window.start && ms < window.end
}
