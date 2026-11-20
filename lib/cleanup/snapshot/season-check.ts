/**
 * The season numbering check (TS 7.4 Seasons item 3, E22) and the Sonarr
 * season facts that use Sonarr numbers (item 5). Pure and client-safe.
 *
 * Plex numbers the seasons of a show by its episode ordering (TMDB aired,
 * TVDB aired, TVDB DVD or absolute). Sonarr uses TVDB aired order. So season
 * n can hold other episodes on each side. The check, on the managed Plex
 * copy, needs both of these:
 *
 * 1. The set of Plex season numbers (1 and up) with at least one `Part`
 *    equals the set of Sonarr seasons (1 and up) with
 *    `statistics.episodeFileCount > 0`.
 * 2. For each such season n, the number of distinct Plex `Part.file` paths in
 *    Plex season n equals Sonarr `seasons[n].statistics.episodeFileCount`.
 *
 * A show that fails gives every season item `notManaged`, cause
 * `seasonMismatch`. Multi-episode files and several versions of one episode
 * fail it too, which is safe: such seasons are "Cannot delete". A file whose
 * Plex season is not known fails it as well (fail closed). Specials (season
 * 0) are left out on both sides.
 *
 * @module lib/cleanup/snapshot/season-check
 */

import { sonarrFileCount, type SonarrSeries } from "@/lib/cleanup/schema/upstream"

/** One Plex episode as the check reads it: its season number (null: not known) and its `Part.file` paths. */
export interface SeasonFileRow {
  seasonNumber: number | null
  files: readonly string[]
}

/** The distinct `Part.file` paths of each Plex season (null: the season number is not known). Episodes without a file are left out. */
export function plexSeasonFiles(episodes: Iterable<SeasonFileRow>): Map<number | null, Set<string>> {
  const seasons = new Map<number | null, Set<string>>()
  for (const episode of episodes) {
    if (episode.files.length === 0) continue
    const files = seasons.get(episode.seasonNumber) ?? new Set<string>()
    for (const file of episode.files) files.add(file)
    seasons.set(episode.seasonNumber, files)
  }
  return seasons
}

/** The Sonarr seasons on disk: numbers 1 and up with `episodeFileCount > 0`, ascending. A null `statistics` counts 0. */
export function sonarrSeasonsOnDisk(series: Pick<SonarrSeries, "seasons">): number[] {
  return [...new Set(series.seasons.filter((s) => s.seasonNumber >= 1 && (s.statistics?.episodeFileCount ?? 0) > 0).map((s) => s.seasonNumber))]
    .sort((a, b) => a - b)
}

/**
 * Whether Plex and Sonarr number and fill the seasons of a show the same way
 * (E22).
 *
 * @param plexFiles - `plexSeasonFiles()` of the managed Plex copy.
 * @param series - The matched Sonarr series.
 */
export function seasonNumberingMatches(plexFiles: ReadonlyMap<number | null, ReadonlySet<string>>, series: Pick<SonarrSeries, "seasons">): boolean {
  if ((plexFiles.get(null)?.size ?? 0) > 0) return false
  const plex = [...plexFiles].filter(([n, files]) => n !== null && n >= 1 && files.size > 0)
  const sonarr = sonarrSeasonsOnDisk(series)
  if (plex.length !== sonarr.length) return false
  return plex.every(([n, files]) => n !== null && sonarr.includes(n) && files.size === sonarrFileCount(series, n))
}

/** The rank of season n among the Sonarr seasons on disk, newest first (1 = newest). */
export function seasonPosition(seasonNumber: number, onDisk: readonly number[]): number {
  return 1 + onDisk.filter((n) => n > seasonNumber).length
}
