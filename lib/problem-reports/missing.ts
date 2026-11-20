/**
 * What "Episodes are missing" leads to, from what Sonarr and Plex hold for
 * the show (docs/problem-reports.md, "Missing episodes"). Pure.
 *
 * Specials (season 0) don't count. For each other episode, in this order:
 *
 * | Sonarr                                  | Plex             | Leads to         |
 * |-----------------------------------------|------------------|------------------|
 * | has a file                              | has its name     | nothing missing  |
 * | has a file                              | lacks it         | `SCAN`           |
 * | no file, aired, monitored               |                  | `SEARCH`         |
 * | no file, aired, not monitored           |                  | `NOT_ON_SERVER`  |
 * | no file, not aired (or no date)         |                  | `NOT_AIRED`      |
 *
 * The first row that has any episode wins: a scan before a search, a search
 * before "not on the server", and that before the next air date. Files are
 * compared by name, since Sonarr and Plex often see different folders. A
 * search of more than {@link MAX_SEARCH_EPISODES} episodes goes to the
 * server admin.
 *
 * @module lib/problem-reports/missing
 */

import type { SonarrEpisode, SonarrEpisodeFile } from "@/lib/connections/sonarr-episodes"

/** The most episodes one search asks for. */
const MAX_SEARCH_EPISODES = 50

export type MissingDecision =
  | { kind: "SCAN"; episodeIds: number[] }
  | { kind: "SEARCH"; episodeIds: number[] }
  | { kind: "NOT_ON_SERVER"; seasons: number[] }
  | { kind: "NOT_AIRED"; season: number; episode: number; airsAt: string | null }
  | { kind: "NOTHING_MISSING" }
  | { kind: "TOO_MANY"; count: number }

export interface MissingInput {
  now: Date
  episodes: readonly SonarrEpisode[]
  files: readonly SonarrEpisodeFile[]
  /** The names of every file Plex has for the show, from {@link plexFileNames}. */
  plexFiles: ReadonlySet<string>
  /** Only these episodes, by Sonarr id: the ones a run is waiting for. */
  targets?: readonly number[]
}

/** A file's name, in lower case, from a path in either style. */
const fileName = (path: string): string => (path.split(/[\\/]/).pop() ?? path).toLowerCase()

/** The names of Plex's files, for {@link MissingInput.plexFiles}. */
export function plexFileNames(paths: readonly string[]): Set<string> {
  return new Set(paths.map(fileName))
}

const order = (a: SonarrEpisode, b: SonarrEpisode) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber

/** The earliest air date first; an episode without one after every dated one. */
function byAirDate(a: SonarrEpisode, b: SonarrEpisode): number {
  if (a.airDateUtc && b.airDateUtc) return Date.parse(a.airDateUtc) - Date.parse(b.airDateUtc)
  if (a.airDateUtc || b.airDateUtc) return a.airDateUtc ? -1 : 1
  return order(a, b)
}

export function decideMissing({ now, episodes, files, plexFiles, targets }: MissingInput): MissingDecision {
  const names = new Map<number, string>()
  for (const file of files) {
    const path = file.relativePath ?? file.path
    if (path) names.set(file.id, fileName(path))
  }
  const wanted = targets ? new Set(targets) : null
  const regular = episodes.filter((episode) => episode.seasonNumber > 0 && (!wanted || wanted.has(episode.id))).sort(order)
  const aired = (episode: SonarrEpisode) => episode.airDateUtc !== null && Date.parse(episode.airDateUtc) <= now.getTime()

  const unscanned = regular.filter((episode) => {
    const name = episode.hasFile && episode.episodeFileId !== null ? names.get(episode.episodeFileId) : undefined
    return name !== undefined && !plexFiles.has(name)
  })
  if (unscanned.length > 0) return { kind: "SCAN", episodeIds: unscanned.map((episode) => episode.id) }

  const missing = regular.filter((episode) => !episode.hasFile)
  const searchable = missing.filter((episode) => aired(episode) && episode.monitored)
  if (searchable.length > MAX_SEARCH_EPISODES) return { kind: "TOO_MANY", count: searchable.length }
  if (searchable.length > 0) return { kind: "SEARCH", episodeIds: searchable.map((episode) => episode.id) }

  const unmonitored = missing.filter((episode) => aired(episode))
  if (unmonitored.length > 0) return { kind: "NOT_ON_SERVER", seasons: [...new Set(unmonitored.map((episode) => episode.seasonNumber))] }

  const next = [...missing].sort(byAirDate)[0]
  if (next) return { kind: "NOT_AIRED", season: next.seasonNumber, episode: next.episodeNumber, airsAt: next.airDateUtc }
  return { kind: "NOTHING_MISSING" }
}
