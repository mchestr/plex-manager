/**
 * The identity, rounding and listing rules every Rewind stat module shares
 * (design 7.2, RWP-07).
 *
 * - A title is keyed by Plex rating key, never by its name, so Dune (1984)
 *   and Dune (2021) stay two films: `film:<ratingKey>` for a film,
 *   `series:<grandparentRatingKey>` for an episode. Tracks and other media
 *   have no key and no Rewind stat reads them.
 * - Seconds are summed and floored to minutes once, at the end.
 * - Hidden titles count toward totals and are left out of every list, and so
 *   are plays P2.6's content-rating exclusions marked `excludedFromLists`.
 *
 * @module lib/wrapped/stats/keys
 */

import type { PlayEvent } from "@/lib/wrapped/sources/watch-history-source"
import type { TimeWindow } from "@/lib/wrapped/time/zone"

/** What every stat module needs besides the events. */
export interface StatsContext {
  /** The member's Rewind zone; every bucket is taken in it. */
  zone: string
  /** The data window the events were read for. */
  window: TimeWindow
  finalCut: boolean
  /** Rating keys the member hid: a film's own key or a series' grandparent key. */
  hiddenKeys: ReadonlySet<string>
}

export type TitleKey = `film:${string}` | `series:${string}`

/** A film or an episode of a series: the only plays Rewind reads. */
export type VideoEvent = PlayEvent & { mediaType: "movie" | "episode" }

/**
 * The title a play belongs to, or null for media Rewind does not read.
 *
 * @example
 * ```ts
 * titleKey({ mediaType: "movie", ratingKey: "101", grandparentRatingKey: null })  // "film:101"
 * titleKey({ mediaType: "episode", ratingKey: "9", grandparentRatingKey: "77" }) // "series:77"
 * titleKey({ mediaType: "track", ratingKey: "5", grandparentRatingKey: "4" })    // null
 * ```
 */
export function titleKey(e: Pick<PlayEvent, "mediaType" | "ratingKey" | "grandparentRatingKey">): TitleKey | null {
  if (e.mediaType === "movie") return `film:${e.ratingKey}`
  if (e.mediaType === "episode" && e.grandparentRatingKey) return `series:${e.grandparentRatingKey}`
  return null
}

/** The films and episodes among `events`, in their original order. */
export function videoEvents(events: readonly PlayEvent[]): VideoEvent[] {
  return events.filter((e): e is VideoEvent => titleKey(e) !== null)
}

/**
 * Whole minutes in `seconds`: the one rounding rule, applied once to a sum.
 *
 * @example
 * ```ts
 * minutesOf(50 + 50 + 50) // 2
 * ```
 */
export function minutesOf(seconds: number): number {
  return Math.floor(seconds / 60)
}

/**
 * Whether a play may appear in a list, a record, a calendar day's top title
 * or a card: its title is not hidden and its content rating is not excluded
 * (FR-44). Every stat module decides list membership here.
 */
export function isListed(e: VideoEvent, ctx: Pick<StatsContext, "hiddenKeys">): boolean {
  const key = e.mediaType === "movie" ? e.ratingKey : e.grandparentRatingKey
  return key !== null && !e.excludedFromLists && !ctx.hiddenKeys.has(key)
}

/** The display title of a play's title: the series name for an episode. */
export function titleOf(e: VideoEvent): string {
  return e.mediaType === "episode" ? (e.grandparentTitle ?? e.title) : e.title
}

/**
 * Display titles for a set of keys: a title that two keys share gains its
 * year, so the two Dunes read "Dune (1984)" and "Dune (2021)".
 */
export function displayTitles(
  titles: ReadonlyArray<{ key: string; title: string; year: number | null }>
): Map<string, string> {
  const keysPerTitle = new Map<string, number>()
  for (const { title } of titles) keysPerTitle.set(title, (keysPerTitle.get(title) ?? 0) + 1)
  return new Map(
    titles.map(({ key, title, year }) => [
      key,
      (keysPerTitle.get(title) ?? 0) > 1 && year !== null ? `${title} (${year})` : title,
    ])
  )
}
