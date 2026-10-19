/**
 * Which titles `REWIND_METADATA_WARM` fetches (design 7.5): for each member,
 * the films and series that make up 95% of their minutes, biggest first. The
 * long tail is left to the library pass, which already stored every title's
 * rating, genres and people.
 *
 * @module lib/wrapped/aggregate/warm-selection
 */

import type { PlayEvent } from "@/lib/wrapped/sources/watch-history-source"

import { metadataKeyOf } from "./rating-exclusions"

/** The share of a member's minutes whose titles are warmed. */
const WARM_SHARE = 0.95

/** How many of a member's series get season episode counts. */
const TOP_SERIES = 5

export interface WarmSelection {
  /** Film and series rating keys, biggest first. */
  keys: string[]
  /** The member's biggest series. */
  topSeries: string[]
}

/**
 * The titles covering {@link WARM_SHARE} of `events`' seconds: titles are
 * taken biggest first until their running total reaches the share.
 *
 * @example
 * ```ts
 * // 60 h of one series, 30 h of a film, then 50 one-hour films
 * warmSelection(events).keys.length // 45: 133 of 140 hours; the last 7 films are the tail
 * ```
 */
export function warmSelection(events: readonly PlayEvent[]): WarmSelection {
  const seconds = new Map<string, { total: number; series: boolean }>()
  let total = 0
  for (const e of events) {
    if (e.mediaType !== "movie" && e.mediaType !== "episode") continue
    const key = metadataKeyOf(e)
    const entry = seconds.get(key) ?? { total: 0, series: e.mediaType === "episode" }
    entry.total += e.playSeconds
    seconds.set(key, entry)
    total += e.playSeconds
  }

  const ranked = [...seconds].sort(([ka, a], [kb, b]) => b.total - a.total || ka.localeCompare(kb))
  const keys: string[] = []
  let covered = 0
  for (const [key, entry] of ranked) {
    if (covered >= total * WARM_SHARE) break
    keys.push(key)
    covered += entry.total
  }
  const topSeries = ranked.filter(([, entry]) => entry.series).slice(0, TOP_SERIES).map(([key]) => key)
  return { keys, topSeries }
}
