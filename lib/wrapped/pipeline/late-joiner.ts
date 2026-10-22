/**
 * Late joiners (design 4.5, GAP-45): a member who joined on or after
 * 1 October has too little of the year for a Rewind. Their run is skipped
 * with `JOINED_LATE`, and the home card says "Your first Rewind arrives next
 * year".
 *
 * "Joined" is the member's first lifetime play (`member.since`), else the
 * account's `createdAt`. 1 October starts at 00:00 in the given zone (the
 * member's Rewind zone in the pipeline, the server zone on the home card),
 * through the calendar-aware wall-time conversion, so DST and the process
 * zone never move it.
 *
 * Client-safe: the home card's state resolver reads it.
 *
 * @module lib/wrapped/pipeline/late-joiner
 */

import { formatDayKey, wallTimeToInstant } from "@/lib/utils/zoned-time"

/** The month a late joiner's first play or account falls in, or after. */
const LATE_MONTH = 10

export interface JoinedMember {
  /** The first lifetime play, in ms or as a date; null when there is none or the pass is missing. */
  since: number | Date | null
  createdAt: Date | null
}

/** 00:00 on 1 October of `year` in `zone`. */
function lateJoinerCutoff(year: number, zone: string): number {
  return wallTimeToInstant(`${formatDayKey(year, LATE_MONTH, 1)}T00:00`, zone).getTime()
}

/**
 * @example
 * ```ts
 * isLateJoiner({ since: Date.parse("2026-10-01T07:00:00Z"), createdAt: null }, 2026, "America/Los_Angeles") // true
 * isLateJoiner({ since: Date.parse("2026-10-01T06:59:00Z"), createdAt: null }, 2026, "America/Los_Angeles") // false
 * ```
 */
export function isLateJoiner(member: JoinedMember, year: number, zone: string): boolean {
  const joined = member.since ?? member.createdAt
  if (joined === null) return false
  return new Date(joined).getTime() >= lateJoinerCutoff(year, zone)
}

/** The first lifetime play of `events`, or null when there is none. */
export function firstPlayAt(events: ReadonlyArray<{ startedAt: number }> | null): number | null {
  if (!events || events.length === 0) return null
  return events.reduce((first, e) => Math.min(first, e.startedAt), Number.POSITIVE_INFINITY)
}
