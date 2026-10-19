/**
 * Per-title sums and the one ranking order (design 4.9): minutes, then
 * counted plays, then the most recent watch, then the title.
 *
 * @module lib/wrapped/stats/rank
 */

import { isCountedPlay, type PlayEvent } from "@/lib/wrapped/sources/watch-history-source"

import { displayTitles, isListed, minutesOf, titleKey, titleOf, videoEvents, type StatsContext, type TitleKey } from "./keys"

export interface RankedTitle {
  key: TitleKey
  kind: "film" | "series"
  /** Disambiguated with the year when two keys share a title. */
  title: string
  seconds: number
  minutes: number
  /** Counted plays (FR-46). */
  plays: number
  /** The latest `startedAt` of any play of the title. */
  lastWatched: number
}

/** The ranking order: a negative result puts `a` first. */
export function compareRanked(
  a: Pick<RankedTitle, "minutes" | "plays" | "lastWatched" | "title">,
  b: Pick<RankedTitle, "minutes" | "plays" | "lastWatched" | "title">
): number {
  if (a.minutes !== b.minutes) return b.minutes - a.minutes
  if (a.plays !== b.plays) return b.plays - a.plays
  if (a.lastWatched !== b.lastWatched) return b.lastWatched - a.lastWatched
  return a.title < b.title ? -1 : a.title > b.title ? 1 : 0
}

/**
 * The listed titles among `events`, ranked. Hidden titles are left out;
 * `kind` narrows the list to films or series.
 *
 * @example
 * ```ts
 * rankTitles(events, ctx, "series")[0] // { key: "series:77", title: "Severance", minutes: 1210, ... }
 * ```
 */
export function rankTitles(events: readonly PlayEvent[], ctx: Pick<StatsContext, "hiddenKeys">, kind?: "film" | "series"): RankedTitle[] {
  const sums = new Map<TitleKey, Omit<RankedTitle, "minutes"> & { year: number | null }>()
  for (const e of videoEvents(events)) {
    const key = titleKey(e)!
    if (!isListed(e, ctx) || (kind && !key.startsWith(`${kind}:`))) continue
    const entry = sums.get(key) ?? {
      key,
      kind: e.mediaType === "movie" ? ("film" as const) : ("series" as const),
      title: titleOf(e),
      year: e.year,
      seconds: 0,
      plays: 0,
      lastWatched: e.startedAt,
    }
    entry.seconds += e.playSeconds
    entry.plays += isCountedPlay(e) ? 1 : 0
    entry.lastWatched = Math.max(entry.lastWatched, e.startedAt)
    // An episode carries its own year; the earliest is closest to the series'.
    if (e.year !== null && (entry.year === null || e.year < entry.year)) entry.year = e.year
    sums.set(key, entry)
  }
  const titles = displayTitles([...sums.values()])
  return [...sums.values()]
    .map((s) => ({
      key: s.key,
      kind: s.kind,
      title: titles.get(s.key)!,
      seconds: s.seconds,
      minutes: minutesOf(s.seconds),
      plays: s.plays,
      lastWatched: s.lastWatched,
    }))
    .sort(compareRanked)
}
