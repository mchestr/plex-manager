/**
 * Content-rating exclusions (FR-44), applied to plays once the library pass
 * has stored every title's rating.
 *
 * History rows carry no content rating, so each play takes its title's
 * rating from the metadata cache: a film's own, an episode's series'. When
 * the admin has excluded ratings, a play is kept out of lists when:
 *
 * - its rating is excluded, or
 * - its rating is unknown (fail closed: a title the cache has never seen
 *   could be anything).
 *
 * Such a play still counts toward the member's totals. It never reaches a
 * list, a record, a calendar day's top title or a card: every module that
 * builds one reads {@link listableEvents}, or skips `excludedFromLists`.
 *
 * @module lib/wrapped/aggregate/rating-exclusions
 */

import type { PlayEvent } from "@/lib/wrapped/sources/watch-history-source"

/**
 * The cache key a play's metadata is stored under: the series for an
 * episode, the title itself otherwise.
 *
 * @example
 * ```ts
 * metadataKeyOf({ ratingKey: "501", grandparentRatingKey: "500" }) // "500"
 * metadataKeyOf({ ratingKey: "900", grandparentRatingKey: null })  // "900"
 * ```
 */
export function metadataKeyOf(e: Pick<PlayEvent, "ratingKey" | "grandparentRatingKey">): string {
  return e.grandparentRatingKey ?? e.ratingKey
}

/**
 * Fills each play's `contentRating` from `ratings` (by {@link metadataKeyOf})
 * and marks it `excludedFromLists` when `excludedRatings` rules it out.
 * Ratings compare without regard to case or surrounding spaces.
 *
 * @example
 * ```ts
 * const ratings = new Map([["900", "X"]])
 * applyRatingExclusions([play], ratings, ["x"])[0].excludedFromLists // true
 * applyRatingExclusions([play], new Map(), ["X"])[0].excludedFromLists // true (unknown fails closed)
 * applyRatingExclusions([play], new Map(), [])[0].excludedFromLists // undefined
 * ```
 */
export function applyRatingExclusions(
  events: readonly PlayEvent[],
  ratings: ReadonlyMap<string, string | null>,
  excludedRatings: readonly string[]
): PlayEvent[] {
  const excluded = new Set(excludedRatings.map((r) => r.trim().toUpperCase()))
  return events.map((e) => {
    const contentRating = ratings.get(metadataKeyOf(e)) ?? null
    const hide = excluded.size > 0 && (contentRating === null || excluded.has(contentRating.trim().toUpperCase()))
    return hide ? { ...e, contentRating, excludedFromLists: true } : { ...e, contentRating }
  })
}

/** The plays a list, record, calendar top title or card may use. @public P2.7, P2.8, P2.9 */
export function listableEvents<T extends Pick<PlayEvent, "excludedFromLists">>(events: readonly T[]): T[] {
  return events.filter((e) => !e.excludedFromLists)
}
