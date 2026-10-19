/**
 * The public projection of a stored Rewind, served to anyone holding a share
 * link.
 *
 * ## Overview
 *
 * A stored `PlexWrapped.data` blob can hold far more than its owner's own
 * numbers: rows written before October 2026 carry `statistics.leaderboards`
 * (every member's name and yearly watch time), server stats, the internal
 * user ID and sometimes the owner's email as `userName` (RWP-01, SEC-16).
 * Share responses therefore never pass the blob through. They build this
 * allow-listed object field by field and finish with a strict Zod parse, so a
 * key that is not listed here fails loudly instead of leaking.
 *
 * ## Process
 *
 * 1. Parse the stored row with `parseStoredRewind` (v1 and v2 rows share
 *    `statistics`, read leniently: a missing or malformed value becomes 0 or
 *    an empty list).
 * 2. Copy only the allow-listed fields into a new object, keeping at most
 *    five titles per list, the first entry for each month and no per-month
 *    top titles.
 * 3. Take the owner's name from the `User` row via `memberName()`, never from
 *    the stored `userName`, and fall back to "Someone".
 * 4. `ShareSafeRewindV2.parse()` the result.
 *
 * @module lib/wrapped/data/share-safe-v2
 */

import { z } from "zod"

import { parseStoredRewind } from "@/lib/wrapped/data/parse-stored"
import type { StoredWrappedData } from "@/lib/wrapped/data/schema-legacy"
import { memberName } from "@/lib/wrapped/member-name"

const MAX_TOP_TITLES = 5

const minutes = z.number().nonnegative()

const shareSafeMovie = z.strictObject({
  title: z.string(),
  year: z.number().int().optional(),
  minutes,
  plays: z.number().nonnegative(),
  ratingKey: z.string().optional(),
})

const shareSafeShow = z.strictObject({
  title: z.string(),
  year: z.number().int().optional(),
  minutes,
  plays: z.number().nonnegative(),
  episodes: z.number().nonnegative(),
  ratingKey: z.string().optional(),
})

/** Everything a public share response may contain. */
export const ShareSafeRewindV2 = z.strictObject({
  year: z.number().int(),
  ownerName: z.string(),
  summary: z.string().nullable(),
  archetypeName: z.string().nullable(),
  totals: z.strictObject({
    minutes,
    movies: z.number().nonnegative(),
    shows: z.number().nonnegative(),
    episodes: z.number().nonnegative(),
  }),
  months: z.array(z.strictObject({ month: z.number().int().min(1).max(12), minutes })).max(12),
  topMovies: z.array(shareSafeMovie).max(MAX_TOP_TITLES),
  topShows: z.array(shareSafeShow).max(MAX_TOP_TITLES),
})

export type ShareSafeRewindV2 = z.infer<typeof ShareSafeRewindV2>

type ShareSafeMovie = z.infer<typeof shareSafeMovie>
type ShareSafeShow = z.infer<typeof shareSafeShow>

type StoredStatistics = StoredWrappedData["statistics"]
type StoredTitle = StoredStatistics["topShows"][number]
type StoredMonth = NonNullable<StoredStatistics["watchTimeByMonth"]>[number]

/**
 * Keep the first entry for each month. Generation writes one per month, but
 * the playground stores admin-supplied statistics unvalidated, and a
 * duplicated month would otherwise break the 12-entry schema limit.
 */
function firstPerMonth(months: StoredMonth[]): StoredMonth[] {
  const byMonth = new Map<number, StoredMonth>()
  for (const month of months) {
    if (!byMonth.has(month.month)) byMonth.set(month.month, month)
  }
  return [...byMonth.values()]
}

function toMovie(title: StoredStatistics["topMovies"][number]): ShareSafeMovie {
  const movie: ShareSafeMovie = { title: title.title, minutes: title.watchTime, plays: title.playCount }
  if (title.year !== undefined) movie.year = title.year
  if (title.ratingKey !== undefined) movie.ratingKey = title.ratingKey
  return movie
}

function toShow(title: StoredTitle): ShareSafeShow {
  const show: ShareSafeShow = {
    title: title.title,
    minutes: title.watchTime,
    plays: title.playCount,
    episodes: title.episodesWatched,
  }
  if (title.year !== undefined) show.year = title.year
  if (title.ratingKey !== undefined) show.ratingKey = title.ratingKey
  return show
}

/**
 * Project a stored Rewind row (v1 or v2) into the public share shape.
 *
 * @param row - The `PlexWrapped` columns the projection reads; `data` is the
 *   stored JSON string.
 * @param owner - The owning `User`; only `name` is read.
 * @returns The validated projection.
 * @throws When `row.data` is not a v1 or v2 Rewind, or the projection fails its schema.
 *
 * @example
 * ```ts
 * const shared = toShareSafeV2(
 *   { year: 2026, summary: null, archetype: null, data: JSON.stringify({ statistics: { moviesWatched: 3 } }) },
 *   { name: "mike@example.com" }
 * )
 * shared.ownerName      // "Someone"
 * shared.totals.movies  // 3
 * ```
 */
export function toShareSafeV2(
  row: { year: number; summary: string | null; archetype: string | null; data: string },
  owner: { name: string | null }
): ShareSafeRewindV2 {
  const stored = parseStoredRewind(row.data)
  if (stored.version !== 1 && stored.version !== 2) {
    throw new Error(`Stored Rewind is not a v1 or v2 row (${stored.version === 3 ? "v3" : stored.reason})`)
  }
  const { statistics } = stored.legacy

  return ShareSafeRewindV2.parse({
    year: row.year,
    ownerName: memberName(owner) ?? "Someone",
    summary: row.summary,
    archetypeName: row.archetype,
    totals: {
      minutes: statistics.totalWatchTime.total,
      movies: statistics.moviesWatched,
      shows: statistics.showsWatched,
      episodes: statistics.episodesWatched,
    },
    months: firstPerMonth(statistics.watchTimeByMonth ?? []).map((month) => ({ month: month.month, minutes: month.watchTime })),
    topMovies: statistics.topMovies.slice(0, MAX_TOP_TITLES).map(toMovie),
    topShows: statistics.topShows.slice(0, MAX_TOP_TITLES).map(toShow),
  })
}
