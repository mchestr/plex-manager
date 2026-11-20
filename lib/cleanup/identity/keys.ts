/**
 * Title keys, item keys, test id keys and the database form of the cascade
 * (TS 5.4, 7.4). Pure and client-safe.
 *
 * - `titleKey`: movies `tmdb:<id>`, else `imdb:<id>`. Shows `tvdb:<id>`, else
 *   `tmdb:<id>`, else `imdb:<id>`. No external id: `rk:<ratingKey>`, and the
 *   item is `unmatched` with cause `noIds`. A season uses its show's key.
 * - `itemKey`: `movie:<titleKey>`, `show:<titleKey>`, `season:<showTitleKey>:<n>`.
 * - `testIdKey`: the item key with `-` for `:` (UX 10.1).
 * - `cascadeWhere(item)`: the rows of `CleanupItem` or `CleanupProtection`
 *   that the cascade of 5.4 reaches (architecture-r4-4). A movie and a show
 *   can share `tmdb:<id>`, so the `titleKey` branch also filters by level.
 *
 * | Item | `cascadeWhere(item)` |
 * |---|---|
 * | Movie | `{ itemKey }` |
 * | Show | `{ OR: [{ itemKey }, { level: "season", titleKey }] }` |
 * | Season | `{ itemKey: { in: [itemKey, "show:" + titleKey] } }` |
 *
 * @module lib/cleanup/identity/keys
 */

import type { PlexIds } from "@/lib/cleanup/identity/guids"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

/** The levels that own a title key. A season uses its show's. */
export type TitleLevel = "movie" | "show"
export type ExternalIdKind = "tmdb" | "tvdb" | "imdb"

/** The id kinds of each level in key order (TS 7.4): the title key and the arr match read them in this order. */
export const ID_ORDER: Record<TitleLevel, readonly ExternalIdKind[]> = {
  movie: ["tmdb", "imdb"],
  show: ["tvdb", "tmdb", "imdb"],
}

/** Whether the ids hold a TMDB, TVDB or IMDb id. A `plex://` guid alone is no external id. */
export function hasExternalId(ids: PlexIds): boolean {
  return ids.tmdb !== undefined || ids.tvdb !== undefined || ids.imdb !== undefined
}

/** The title key of a movie or show: the first id of its key order, else `rk:<ratingKey>`. */
export function titleKey(level: TitleLevel, ids: PlexIds, ratingKey: string): string {
  for (const kind of ID_ORDER[level]) {
    const value = ids[kind]
    if (value !== undefined) return `${kind}:${value}`
  }
  return `rk:${ratingKey}`
}

/** The item key of a movie or show. */
export function itemKey(level: TitleLevel, key: string): string {
  return `${level}:${key}`
}

/** The item key of season `seasonNumber` of the show with title key `showTitleKey`. */
export function seasonItemKey(showTitleKey: string, seasonNumber: number): string {
  return `season:${showTitleKey}:${seasonNumber}`
}

/** The item key in the form that test ids use: `movie-tmdb-1` (UX 10.1). */
export function testIdKey(key: string): string {
  return key.replaceAll(":", "-")
}

/** What `cascadeWhere` reads of a `CleanupItem`, a `CleanupProtection` or a snapshot item. */
export interface CascadeTarget {
  level: Level
  itemKey: string
  titleKey: string
}

/** A Prisma `where` on `itemKey`, `level` and `titleKey`, so it fits `CleanupItem` and `CleanupProtection`. */
export type CascadeWhere =
  | { itemKey: string }
  | { OR: [{ itemKey: string }, { level: "season"; titleKey: string }] }
  | { itemKey: { in: string[] } }

/**
 * The database form of the cascade (TS 5.4). The Keep and exclusion exits,
 * the E33 count and pre-delete row 6 use it.
 */
export function cascadeWhere(item: CascadeTarget): CascadeWhere {
  if (item.level === "movie") return { itemKey: item.itemKey }
  if (item.level === "show") return { OR: [{ itemKey: item.itemKey }, { level: "season", titleKey: item.titleKey }] }
  return { itemKey: { in: [item.itemKey, `show:${item.titleKey}`] } }
}
