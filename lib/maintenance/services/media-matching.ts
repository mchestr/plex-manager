/**
 * Media matching utilities for maintenance rules
 *
 * Provides title normalization and matching logic between
 * different media services (Radarr, Sonarr, Tautulli, Plex).
 */

import type { TautulliMediaItem, PlexMediaItem, RadarrMovie, SonarrSeries } from "./types"

// Matching configuration constants
export const YEAR_TOLERANCE = 1 // Allow ±1 year difference for matching
export const TITLE_SUBSTRING_LENGTH = 10 // Characters to use for fuzzy matching

/**
 * Normalize title for matching between services
 * Removes punctuation and normalizes whitespace for consistent comparison
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // Remove punctuation
    .replace(/\s+/g, " ")    // Normalize whitespace
    .trim()
}

/**
 * Check if two years match within tolerance
 */
export function yearsMatch(year1: number | undefined, year2: number | undefined): boolean {
  if (year1 === undefined || year2 === undefined) {
    return false
  }
  return Math.abs(year1 - year2) <= YEAR_TOLERANCE
}

/**
 * Find matching Tautulli item for a movie
 */
export function findTautulliMatch(
  movie: RadarrMovie | SonarrSeries,
  tautulliData: TautulliMediaItem[]
): TautulliMediaItem | undefined {
  const normalizedTitle = normalizeTitle(movie.title)

  return tautulliData.find((t) => {
    const normalizedTautulliTitle = normalizeTitle(t.title)
    const titleMatch = normalizedTautulliTitle === normalizedTitle
    const yearMatch = yearsMatch(t.year, movie.year)
    return titleMatch && yearMatch
  })
}

/**
 * Find matching Plex item for a movie
 */
export function findPlexMatch(
  movie: RadarrMovie | SonarrSeries,
  plexData: PlexMediaItem[]
): PlexMediaItem | undefined {
  const normalizedTitle = normalizeTitle(movie.title)

  return plexData.find((p) => {
    const normalizedPlexTitle = normalizeTitle(p.title)
    const titleMatch = normalizedPlexTitle === normalizedTitle
    const yearMatch = yearsMatch(p.year, movie.year)
    return titleMatch && yearMatch
  })
}

/**
 * Find close matches for debugging unmatched items
 * Uses substring matching to find potential matches
 */
export function findCloseMatches(
  title: string,
  tautulliData: TautulliMediaItem[],
  maxMatches: number = 3
): TautulliMediaItem[] {
  const normalizedTitle = normalizeTitle(title)
  const titlePrefix = normalizedTitle.slice(0, TITLE_SUBSTRING_LENGTH)

  return tautulliData
    .filter((t) => {
      const normalizedTautulliTitle = normalizeTitle(t.title)
      const tautulliPrefix = normalizedTautulliTitle.slice(0, TITLE_SUBSTRING_LENGTH)
      return (
        normalizedTautulliTitle.includes(titlePrefix) ||
        normalizedTitle.includes(tautulliPrefix)
      )
    })
    .slice(0, maxMatches)
}
