/**
 * The postcard's community titles (design 4.5): up to three titles that 3 or
 * more members watched this year, from the member's view of the server
 * aggregate, named by the server's library.
 *
 * ## Rules
 *
 * - The aggregate keeps only titles with 3 or more viewers, and holds no
 *   names, so nothing here can point at a member.
 * - Order: most viewers, then most minutes in all, then the key.
 * - A title the member hid, a title the library no longer lists and a title
 *   with an excluded content rating are skipped.
 *
 * Without the aggregate or the library pass, the list is empty.
 *
 * @module lib/wrapped/stats/popular
 */

import { MIN_CONTRIBUTORS } from "@/lib/wrapped/aggregate/schema"

import type { StatsContext, TitleKey } from "./keys"
import type { AggregateView } from "./metadata"
import type { LibraryTitle } from "./next-year"

const LIMIT = 3

export interface PopularTitle {
  key: TitleKey
  title: string
}

/**
 * @example
 * ```ts
 * computePopular(view, library, ctx, [])
 * // [{ key: "series:77", title: "Severance" }, { key: "film:9", title: "Dune: Part Two" }]
 * ```
 */
export function computePopular(
  view: AggregateView | null,
  library: readonly LibraryTitle[] | null,
  ctx: Pick<StatsContext, "hiddenKeys">,
  excludedContentRatings: readonly string[]
): PopularTitle[] {
  if (!view || !library) return []
  const excluded = new Set(excludedContentRatings.map((r) => r.trim().toUpperCase()))
  const byKey = new Map<string, LibraryTitle>(
    library.flatMap((t): Array<[string, LibraryTitle]> => (t.type === "movie" ? [[`film:${t.ratingKey}`, t]] : t.type === "show" ? [[`series:${t.ratingKey}`, t]] : []))
  )
  const sum = (minutes: readonly number[]) => minutes.reduce((a, b) => a + b, 0)

  return Object.entries(view.aggregate.titles)
    .filter(([, title]) => title.viewers >= MIN_CONTRIBUTORS)
    .sort(([ka, a], [kb, b]) => b.viewers - a.viewers || sum(b.minutes) - sum(a.minutes) || (ka < kb ? -1 : ka > kb ? 1 : 0))
    .flatMap(([key]) => {
      const item = byKey.get(key)
      if (!item || ctx.hiddenKeys.has(item.ratingKey)) return []
      if (excluded.size > 0 && (item.contentRating === null || excluded.has(item.contentRating.trim().toUpperCase()))) return []
      return [{ key: key as TitleKey, title: item.title }]
    })
    .slice(0, LIMIT)
}
