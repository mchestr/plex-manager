/**
 * Builders for the P2.8 stats tests: metadata lookups without Prisma.
 */

import type { PlayEvent } from "@/lib/wrapped/sources/watch-history-source"

import type { MetadataLookup, TitleMetadata } from "../metadata"

/** Metadata with every field empty, overridden by `fields`. */
export function meta(fields: Partial<TitleMetadata> = {}): TitleMetadata {
  return {
    genres: [],
    directors: [],
    actors: [],
    year: null,
    originallyAvailableAt: null,
    guids: [],
    videoResolution: null,
    runtimeSec: null,
    seasonEpisodeCounts: null,
    ...fields,
  }
}

/**
 * A lookup over rows keyed the way the cache is: a film by its rating key, a
 * series by its grandparent key. Each play finds its row through `events`,
 * the way `getMetadata()` resolves an episode to its series.
 */
export function lookupFor(events: readonly PlayEvent[], rows: Record<string, TitleMetadata>): MetadataLookup {
  const byPlay = new Map(events.map((e) => [e.ratingKey, rows[e.grandparentRatingKey ?? e.ratingKey]]))
  return (e) => byPlay.get(e.ratingKey)
}
