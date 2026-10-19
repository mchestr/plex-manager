/**
 * The taste page's facts (page 07, RWP-18): genres by minutes, the dominant
 * genre of each month, release years and how fresh the member's picks were.
 *
 * ## Rules
 *
 * - Genres are the server's own Plex `Genre` tags from the metadata cache;
 *   an episode takes its series' genres. A title's minutes are split evenly
 *   across its genres, so the shares add up to 1.
 * - Only listed plays count (hidden or rating-excluded titles never shape a
 *   list), and the page is ineligible when fewer than 60% of their minutes
 *   have genres.
 * - Release years are per title (each listed title with a counted play once):
 *   the cache's year, else the play's. The median of an even count is the
 *   lower middle year.
 * - `freshShare` is the share of counted plays with a known release date that
 *   started 0 to 14 days after it, by day in the member's zone. An episode
 *   uses its own air date, a film its release date (the cache's when the row
 *   has none). It is a share that names no title, so every play counts.
 *
 * @module lib/wrapped/stats/taste
 */

import { isCountedPlay, type PlayEvent } from "@/lib/wrapped/sources/watch-history-source"
import { dayKey, monthOf } from "@/lib/wrapped/time/zone"

import { daysBetween } from "./days"
import { isListed, minutesOf, titleKey, videoEvents, type StatsContext, type TitleKey } from "./keys"
import { coverage, type MetadataLookup } from "./metadata"
import { rankTitles } from "./rank"

const MIN_COVERAGE = 0.6
const TOP_GENRES = 5
const FRESH_DAYS = 14

export type TasteStats =
  | { eligible: false; coverage: number }
  | {
      eligible: true
      coverage: number
      /** The top five genres by minutes; `share` is of the minutes that have genres. */
      genres: Array<{ name: string; minutes: number; share: number }>
      /** The window's months (1-12) and each one's dominant genre, or null. */
      genreByMonth: Array<{ month: number; genre: string | null }>
      medianYear: number | null
      decades: Array<{ decade: number; titles: number }>
      oldest: { key: TitleKey; title: string; year: number } | null
      /** 0-1; null without a counted play whose release date is known. */
      freshShare: number | null
    }

/** The genre with the most seconds; the name breaks a tie. */
function top(seconds: ReadonlyMap<string, number>): Array<[string, number]> {
  return [...seconds].sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1))
}

/**
 * The share of counted plays started 0 to 14 days after release, or null
 * without a known release date. P2.9 also reads it outside the page's
 * coverage gate, for the Premiere Chaser.
 */
export function freshShare(events: readonly PlayEvent[], lookup: MetadataLookup, zone: string): number | null {
  let known = 0
  let fresh = 0
  for (const e of videoEvents(events).filter(isCountedPlay)) {
    const released = e.mediaType === "episode" ? e.originallyAvailableAt : (e.originallyAvailableAt ?? lookup(e)?.originallyAvailableAt)
    if (!released || !/^\d{4}-\d{2}-\d{2}/.test(released)) continue
    known++
    const days = daysBetween(released.slice(0, 10), dayKey(e.startedAt, zone))
    if (days >= 0 && days <= FRESH_DAYS) fresh++
  }
  return known > 0 ? fresh / known : null
}

/**
 * @example
 * ```ts
 * const taste = computeTaste(events, ctx, lookup)
 * if (taste.eligible) taste.genres[0] // { name: "Drama", minutes: 21300, share: 0.31 }
 * ```
 */
export function computeTaste(events: readonly PlayEvent[], ctx: StatsContext, lookup: MetadataLookup): TasteStats {
  const listed = videoEvents(events).filter((e) => isListed(e, ctx))
  const covered = coverage(listed, (e) => (lookup(e)?.genres.length ?? 0) > 0)
  if (covered < MIN_COVERAGE) return { eligible: false, coverage: covered }

  const first = monthOf(ctx.window.start, ctx.zone)
  const months = Array.from({ length: monthOf(ctx.window.end - 1, ctx.zone) - first + 1 }, (_, i) => first + i)
  const byGenre = new Map<string, number>()
  const byMonth = months.map(() => new Map<string, number>())
  let genreSeconds = 0
  for (const e of listed) {
    const genres = [...new Set(lookup(e)?.genres)]
    for (const name of genres) {
      const part = e.playSeconds / genres.length
      byGenre.set(name, (byGenre.get(name) ?? 0) + part)
      const month = byMonth[monthOf(e.startedAt, ctx.zone) - first]
      month.set(name, (month.get(name) ?? 0) + part)
    }
    if (genres.length > 0) genreSeconds += e.playSeconds
  }

  const years = new Map<TitleKey, number>()
  for (const e of listed.filter(isCountedPlay)) {
    const key = titleKey(e)!
    const year = lookup(e)?.year ?? e.year
    if (year !== null && (!years.has(key) || year < years.get(key)!)) years.set(key, year)
  }
  const sorted = [...years.values()].sort((a, b) => a - b)
  const decades = new Map<number, number>()
  for (const year of sorted) decades.set(year - (year % 10), (decades.get(year - (year % 10)) ?? 0) + 1)
  const ranked = rankTitles(listed, ctx)
  const oldest = ranked
    .filter((t) => years.has(t.key))
    .reduce<(typeof ranked)[number] | null>((best, t) => (!best || years.get(t.key)! < years.get(best.key)! ? t : best), null)

  return {
    eligible: true,
    coverage: covered,
    genres: top(byGenre)
      .slice(0, TOP_GENRES)
      .map(([name, seconds]) => ({ name, minutes: minutesOf(seconds), share: seconds / genreSeconds })),
    genreByMonth: months.map((month, i) => ({ month, genre: top(byMonth[i])[0]?.[0] ?? null })),
    medianYear: sorted.length > 0 ? sorted[Math.floor((sorted.length - 1) / 2)] : null,
    decades: [...decades].map(([decade, titles]) => ({ decade, titles })),
    oldest: oldest && { key: oldest.key, title: oldest.title, year: years.get(oldest.key)! },
    freshShare: freshShare(events, lookup, ctx.zone),
  }
}
