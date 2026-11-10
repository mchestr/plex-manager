/**
 * Titles of the list tabs as screens show them (TS 10.5 `ItemRef`): from a
 * `CleanupItem`, a `CleanupOutcome` or a `CleanupProtection` row. A size of
 * 0 is unknown and reads as null. Pure and client-safe.
 *
 * @module lib/cleanup/screens/leaving/item-ref
 */

import { parseWhy } from "@/lib/cleanup/schema/why"
import type { ItemRef } from "@/lib/cleanup/types/preview"
import { type Level, LEVELS } from "@/lib/validations/cleanup-vocabulary"

/** The title columns that the three tables share. Outcomes and protections have no episode or season count. */
export interface TitleColumns {
  itemKey: string
  level: string
  title: string
  year: number | null
  seasonNumber: number | null
  episodeCount?: number | null
  seasonCount?: number | null
  ratingKey: string | null
  sectionId: string | null
  sizeBytes?: bigint
}

/** A stored level; a value this build does not know reads as a movie. */
export const levelOf = (value: string): Level => (LEVELS as readonly string[]).includes(value) ? (value as Level) : "movie"

/** The `ItemRef` of a stored row. */
export function itemRefOf(row: TitleColumns): ItemRef {
  return {
    itemKey: row.itemKey,
    level: levelOf(row.level),
    title: row.title,
    year: row.year,
    seasonNumber: row.seasonNumber,
    episodeCount: row.episodeCount ?? null,
    seasonCount: row.seasonCount ?? null,
    posterKey: row.ratingKey || null,
    sectionId: row.sectionId ?? "",
    sizeBytes: row.sizeBytes !== undefined && row.sizeBytes > 0n ? row.sizeBytes.toString() : null,
  }
}

/** "Napoleon", or "Supernatural, Season 4" for a season (UX 4.3.7). */
export function itemName(row: Pick<TitleColumns, "title" | "level" | "seasonNumber">): string {
  return row.level === "season" && row.seasonNumber !== null ? `${row.title}, Season ${row.seasonNumber}` : row.title
}

/**
 * The last counted play that the stored Why saw (TS 3.4): an ISO instant,
 * "never" with no counted play, or null while Tautulli failed or the Why
 * does not parse.
 */
export function lastPlayedOf(why: unknown): string | "never" | null {
  const facts = parseWhy(why)?.facts
  if (!facts || facts.countedTotal === null) return null
  return facts.lastCountedAt === null ? "never" : new Date(facts.lastCountedAt * 1000).toISOString()
}
