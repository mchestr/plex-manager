/**
 * The Plex side of shows: which seasons and episodes belong to which show
 * copy, and which season an episode is in (TS 7.4 Seasons, 7.5). Pure and
 * client-safe.
 *
 * - A season copy is one Plex season row (P5). Its `index` is the season
 *   number; with no index the season gives no item (fail closed, R06 4.4).
 * - An episode copy is one Plex episode row (P6) with its `Part.file` paths.
 *   Its season number is its season row's index, else its own `parentIndex`.
 * - `showParts()` reads the rows of the copies of one show title.
 *
 * @module lib/cleanup/identity/episodes
 */

import { sumSizes, type TitleCopy, wholeOrNull } from "@/lib/cleanup/identity/copies"
import { plexPartFiles, type PlexEpisodeRow, type PlexSeasonRow } from "@/lib/cleanup/schema/upstream"

export interface SeasonCopy {
  ratingKey: string
  sectionId: string
  showRatingKey: string
  /** The season number, or null when Plex gives none. 0 is the specials. */
  index: number | null
  addedAt: number | null
}

export interface EpisodeCopy {
  ratingKey: string
  sectionId: string
  seasonRatingKey: string
  showRatingKey: string
  /** The episode's own `parentIndex`, used when its season row is missing or has no index. */
  parentIndex: number | null
  guid: string | null
  addedAt: number | null
  files: string[]
  size: number | null
}

/** Every Plex show, season and episode row of a read, by rating key. */
export interface ShowStore {
  shows: Map<string, TitleCopy>
  seasons: Map<string, SeasonCopy>
  episodes: Map<string, EpisodeCopy>
}

const seasonIndex = (value: number | undefined) => (value !== undefined && Number.isInteger(value) && value >= 0 ? value : null)

/** A copy of a Plex season row of `sectionId`. */
export function toSeasonCopy(sectionId: string, row: PlexSeasonRow): SeasonCopy {
  return { ratingKey: row.ratingKey, sectionId, showRatingKey: row.parentRatingKey, index: seasonIndex(row.index), addedAt: wholeOrNull(row.addedAt) }
}

/** A copy of a Plex episode row of `sectionId`. */
export function toEpisodeCopy(sectionId: string, row: PlexEpisodeRow): EpisodeCopy {
  return {
    ratingKey: row.ratingKey,
    sectionId,
    seasonRatingKey: row.parentRatingKey,
    showRatingKey: row.grandparentRatingKey,
    parentIndex: seasonIndex(row.parentIndex),
    guid: row.guid ?? null,
    addedAt: wholeOrNull(row.addedAt),
    files: plexPartFiles(row),
    size: sumSizes(row.Media.flatMap((media) => media.Part.map((part) => part.size))),
  }
}

/** The season number of an episode: its season row's index, else its `parentIndex`, else null. */
export function seasonNumberOf(store: ShowStore, episode: EpisodeCopy): number | null {
  return store.seasons.get(episode.seasonRatingKey)?.index ?? episode.parentIndex
}

/** Per show rating key, its season rows and its episode rows. Built once per store. */
export interface ShowIndex {
  seasons: Map<string, SeasonCopy[]>
  episodes: Map<string, EpisodeCopy[]>
  episodesBySeason: Map<string, EpisodeCopy[]>
}

function push<K, T>(map: Map<K, T[]>, key: K, value: T): void {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

/** The rows of every show copy, grouped once. */
export function indexShows(store: ShowStore): ShowIndex {
  const index: ShowIndex = { seasons: new Map(), episodes: new Map(), episodesBySeason: new Map() }
  for (const season of store.seasons.values()) push(index.seasons, season.showRatingKey, season)
  for (const episode of store.episodes.values()) {
    push(index.episodes, episode.showRatingKey, episode)
    push(index.episodesBySeason, episode.seasonRatingKey, episode)
  }
  return index
}

/** The rows of one show title over all of its copies. */
export interface ShowParts {
  /** Every episode of every copy. */
  episodes: EpisodeCopy[]
  episodesOf(showRatingKey: string): EpisodeCopy[]
  episodesOfSeasons(seasons: readonly SeasonCopy[]): EpisodeCopy[]
  seasonOf(episode: EpisodeCopy): number | null
  /** The season rows of every copy by season number, 1 and up, ascending. */
  seasonsByNumber(): [number, SeasonCopy[]][]
}

/** The parts of one show title: the episodes of each copy and of each season, and the seasons by number (1 and up). */
export function showParts(store: ShowStore, index: ShowIndex, copies: readonly TitleCopy[]): ShowParts {
  const episodesOf = (showRatingKey: string) => index.episodes.get(showRatingKey) ?? []
  const episodesOfSeasons = (seasons: readonly SeasonCopy[]) => seasons.flatMap((s) => index.episodesBySeason.get(s.ratingKey) ?? [])
  const seasons = copies.flatMap((copy) => index.seasons.get(copy.ratingKey) ?? [])
  const byNumber = new Map<number, SeasonCopy[]>()
  for (const season of seasons) if (season.index !== null && season.index >= 1) push(byNumber, season.index, season)
  return {
    episodes: copies.flatMap((copy) => episodesOf(copy.ratingKey)),
    episodesOf,
    episodesOfSeasons,
    seasonOf: (episode: EpisodeCopy) => seasonNumberOf(store, episode),
    seasonsByNumber: () => [...byNumber].sort(([a], [b]) => a - b),
  }
}
