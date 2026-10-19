/**
 * The lookups P2.8's modules read instead of Prisma: a play's title metadata
 * and the member's slice of the server aggregate. Both are injected, so the
 * modules stay pure and test without a database (design 7.5).
 *
 * The cache's JSON columns are stored data, so {@link metadataLookup} parses
 * them with Zod once per row; a row that fails reads as a miss.
 *
 * @module lib/wrapped/stats/metadata
 */

import { z } from "zod"

import type { ServerAggregate } from "@/lib/wrapped/aggregate/schema"
import type { MediaMetadata } from "@/lib/wrapped/metadata-cache"
import type { PlayEvent } from "@/lib/wrapped/sources/watch-history-source"

/** One title's cached metadata, as the stats read it. An episode's is its series'. */
export interface TitleMetadata {
  genres: string[]
  directors: string[]
  /** In billing order, at most ten. */
  actors: string[]
  year: number | null
  /** `YYYY-MM-DD`, or null. */
  originallyAvailableAt: string | null
  /** `tmdb://`, `tvdb://` and `imdb://` guids. */
  guids: string[]
  videoResolution: string | null
  /** Episodes per season number (`{ "1": 10 }`), for a warmed series. */
  seasonEpisodeCounts: Record<string, number> | null
}

/** The metadata of a play's title, or undefined on a cache miss. */
export type MetadataLookup = (e: Pick<PlayEvent, "ratingKey">) => TitleMetadata | undefined

/** The member's view of `RewindServerAggregate` for the batch. */
export interface AggregateView {
  userId: string
  aggregate: Pick<ServerAggregate, "members" | "titles" | "community">
}

const names = z.array(z.string())
const seasonCounts = z.record(z.string(), z.number().int().nonnegative()).nullable()

function toTitleMetadata(row: MediaMetadata): TitleMetadata | undefined {
  const genres = names.safeParse(row.genres)
  const directors = names.safeParse(row.directors)
  const actors = names.safeParse(row.actors)
  const guids = names.safeParse(row.guids)
  const seasons = seasonCounts.safeParse(row.seasonEpisodeCounts ?? null)
  if (!genres.success || !directors.success || !actors.success || !guids.success || !seasons.success) return undefined
  return {
    genres: genres.data,
    directors: directors.data,
    actors: actors.data,
    year: row.year,
    originallyAvailableAt: row.originallyAvailableAt?.toISOString().slice(0, 10) ?? null,
    guids: guids.data,
    videoResolution: row.videoResolution,
    seasonEpisodeCounts: seasons.data,
  }
}

/**
 * A lookup over `getMetadata()`'s result, which is keyed by each play's
 * `ratingKey` and already resolves an episode to its series.
 *
 * @example
 * ```ts
 * const lookup = metadataLookup(await getMetadata(events))
 * lookup(episode)?.genres // the series' genres
 * metadataLookup(new Map())(episode) // undefined: Taste and People omit themselves
 * ```
 */
export function metadataLookup(rows: ReadonlyMap<string, MediaMetadata>): MetadataLookup {
  const parsed = new Map<string, TitleMetadata | undefined>()
  return (e) => {
    if (!parsed.has(e.ratingKey)) {
      const row = rows.get(e.ratingKey)
      parsed.set(e.ratingKey, row && toTitleMetadata(row))
    }
    return parsed.get(e.ratingKey)
  }
}

/** Minutes-weighted coverage: the share of `seconds` whose play `covered` accepts, 0 when there are none. */
export function coverage<T extends { playSeconds: number }>(events: readonly T[], covered: (e: T) => boolean): number {
  const total = events.reduce((sum, e) => sum + e.playSeconds, 0)
  if (total === 0) return 0
  return events.filter(covered).reduce((sum, e) => sum + e.playSeconds, 0) / total
}
