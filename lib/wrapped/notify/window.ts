/**
 * When a Rewind ready message may go out (design 9.7): between 09:00 and
 * 20:00 in the member's Rewind zone, never at night.
 *
 * @module lib/wrapped/notify/window
 */

import { formatDayKey, wallTimeToInstant, zonedParts } from "@/lib/utils/zoned-time"

const OPENS_AT_HOUR = 9
const CLOSES_AT_HOUR = 20

/**
 * `now` when it falls between 09:00 and 20:00 in `zone`, else the next 09:00
 * there. The next day comes from the wall-clock date, so a DST change in
 * between needs no special case.
 *
 * @example
 * ```ts
 * nextSendWindow(new Date("2026-12-01T20:30:00Z"), "Europe/Berlin") // 2026-12-02T08:00:00.000Z (09:00 in Berlin)
 * ```
 */
export function nextSendWindow(now: Date, zone: string): Date {
  const { year, month, day, hour } = zonedParts(now.getTime(), zone)
  if (hour >= OPENS_AT_HOUR && hour < CLOSES_AT_HOUR) return now
  const date = new Date(Date.UTC(year, month - 1, hour < OPENS_AT_HOUR ? day : day + 1))
  const key = formatDayKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
  return wallTimeToInstant(`${key}T0${OPENS_AT_HOUR}:00`, zone)
}
