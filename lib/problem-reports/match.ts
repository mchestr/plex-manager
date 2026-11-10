/**
 * Whether Plex's match for a title agrees with the title Radarr or Sonarr
 * has for the same file (docs/problem-reports.md, "Fix the Plex match").
 * Plex matches movies and shows, so an episode's match is its show's.
 *
 * 1. The file is resolved as the other fixes resolve it, by the ids Plex
 *    holds (`resolveFile`). When that finds the file, Plex and Radarr or
 *    Sonarr agree. For an episode, Sonarr's numbers for the file must also
 *    include the one Plex shows; when they don't, it's the episode order.
 * 2. When Plex's ids lead to no title, or to one whose file isn't this one,
 *    the title the file belongs to is looked for by folder: the Radarr movie
 *    whose file it is, or the Sonarr series whose folder holds it (for a
 *    show report, the show's folders). Plex's match then differs, and that
 *    title's ids are the ones to match to.
 * 3. Anything else can't be told: no Radarr or Sonarr, several versions, a
 *    special, a service or Plex that can't be read, or no title that owns
 *    the file.
 *
 * @module lib/problem-reports/match
 */

import "server-only"

import { listRadarrMovieFiles, listSonarrSeriesFolders, type SonarrSeriesEntry } from "@/lib/connections/arr-titles"
import { getPlexItemMetadata, type PlexItemMetadata } from "@/lib/connections/plex"
import { listSonarrEpisodeFiles, listSonarrEpisodes } from "@/lib/connections/sonarr-episodes"
import { getActiveService } from "@/lib/data/active-service"
import { matchFile, nameAndFolder } from "@/lib/problem-reports/file-match"
import { plexFile, resolveFile, type ArrConfig, type ResolvedFile } from "@/lib/problem-reports/resolve"
import type { ToAdminReason } from "@/lib/validations/problem-reports"

type PlexServer = { url: string; token: string }

/** The ids a match must end with: Radarr's TMDB (or IMDb) id for a movie, Sonarr's TVDB id for a show. */
export type ExpectedIds = { tmdb: number; imdb: string | null } | { tvdb: number }

/** The title Radarr or Sonarr has for the file, as a match search and the check after it read it. */
export interface ExpectedTitle {
  ids: ExpectedIds
  title: string
  year: number | null
}

/** The movie or show Plex would match. */
export interface MatchTarget {
  ratingKey: string
  sectionId: string
  type: "movie" | "show"
  guid: string | null
  title: string
}

export type MatchCheck = { verdict: "AGREES" } | { verdict: "DIFFERS"; target: MatchTarget; expected: ExpectedTitle } | { verdict: "UNKNOWN"; reason: ToAdminReason }

const AGREES: MatchCheck = { verdict: "AGREES" }
const unknown = (reason: ToAdminReason): MatchCheck => ({ verdict: "UNKNOWN", reason })

/** Resolve refusals that can mean Plex holds the wrong ids, so the file's owner is looked for by folder. */
const LOOK_BY_FOLDER: ReadonlySet<string> = new Set(["NOT_IN_RADARR", "NOT_IN_SONARR", "NO_FILE", "NO_IDS"])

/** Whether a Plex item's ids are the expected title's. */
export function idsFit(ids: PlexItemMetadata["ids"], expected: ExpectedIds): boolean {
  if ("tvdb" in expected) return ids.tvdb === expected.tvdb
  return ids.tmdb !== undefined ? ids.tmdb === expected.tmdb : expected.imdb !== null && ids.imdb === expected.imdb
}

async function arrConfig(kind: "radarr" | "sonarr"): Promise<ArrConfig | null> {
  const row = await getActiveService(kind)
  return row ? { name: row.name, url: row.url, apiKey: row.apiKey } : null
}

function verdict(item: PlexItemMetadata, type: "movie" | "show", expected: ExpectedTitle): MatchCheck {
  if (idsFit(item.ids, expected.ids)) return AGREES
  if (!item.librarySectionId) return unknown("UNAVAILABLE")
  return { verdict: "DIFFERS", target: { ratingKey: item.ratingKey, sectionId: item.librarySectionId, type, guid: item.guid ?? null, title: item.title }, expected }
}

const seriesTitle = (series: SonarrSeriesEntry): ExpectedTitle => ({ ids: { tvdb: series.tvdbId }, title: series.title, year: series.year })

/** The Radarr movie whose file is the Plex movie's file. */
async function movieByFolder(item: PlexItemMetadata): Promise<MatchCheck> {
  const file = plexFile(item)
  if (typeof file === "string") return unknown(file)
  const config = await arrConfig("radarr")
  if (!config) return unknown("NO_RADARR")
  const movies = await listRadarrMovieFiles(config)
  if (!movies.success) return unknown("UNAVAILABLE")
  const files = movies.data.flatMap((movie) => {
    const path = movie.file?.path ?? (movie.file?.relativePath && movie.path ? `${movie.path}/${movie.file.relativePath}` : null)
    return path && movie.file ? [{ movie, path, size: movie.file.size }] : []
  })
  const owner = matchFile(file, files)?.movie
  if (!owner) return unknown("NOT_IN_RADARR")
  return verdict(item, "movie", { ids: { tmdb: owner.tmdbId, imdb: owner.imdbId }, title: owner.title, year: owner.year })
}

/** The Sonarr series whose folder is one of `folders` (folder names, lower case), and the file it holds when one is given. */
async function seriesByFolder(config: ArrConfig, folders: ReadonlySet<string>, file: { file: string; size?: number } | null): Promise<SonarrSeriesEntry | "UNAVAILABLE" | null> {
  const series = await listSonarrSeriesFolders(config)
  if (!series.success) return "UNAVAILABLE"
  const candidates = series.data.filter((entry) => entry.path && folders.has(nameAndFolder(entry.path).name))
  if (!file) return candidates.length === 1 ? candidates[0] : null
  for (const candidate of candidates) {
    const files = await listSonarrEpisodeFiles(config, candidate.id)
    if (!files.success) return "UNAVAILABLE"
    if (matchFile(file, files.data.flatMap((entry) => (entry.path ? [{ ...entry, path: entry.path }] : [])))) return candidate
  }
  return null
}

/** An episode whose show's ids led nowhere: the series whose folder holds the file. */
async function episodeByFolder(server: PlexServer, item: PlexItemMetadata): Promise<MatchCheck> {
  if (item.seasonNumber === 0) return unknown("SPECIAL")
  const file = plexFile(item)
  if (typeof file === "string") return unknown(file)
  const show = item.grandparentRatingKey ? await getPlexItemMetadata(server, item.grandparentRatingKey) : null
  if (show?.status !== "found") return unknown("UNAVAILABLE")
  const config = await arrConfig("sonarr")
  if (!config) return unknown("NO_SONARR")
  const folders = new Set(file.file.split(/[\\/]+/).filter(Boolean).slice(0, -1).map((segment) => segment.toLowerCase()))
  const owner = await seriesByFolder(config, folders, file)
  if (owner === "UNAVAILABLE") return unknown("UNAVAILABLE")
  return owner ? verdict(show.item, "show", seriesTitle(owner)) : unknown("NOT_IN_SONARR")
}

/** A show report: the series whose folder is one of the show's. */
async function checkShow(show: PlexItemMetadata): Promise<MatchCheck> {
  const config = await arrConfig("sonarr")
  if (!config) return unknown("NO_SONARR")
  const owner = await seriesByFolder(config, new Set(show.locations.map((location) => nameAndFolder(location).name)), null)
  if (owner === "UNAVAILABLE") return unknown("UNAVAILABLE")
  return owner ? verdict(show, "show", seriesTitle(owner)) : unknown("NOT_IN_SONARR")
}

/** Sonarr's numbers for the episodes in the file include the one Plex shows, or it's the episode order. */
async function checkEpisodeOrder(item: PlexItemMetadata, resolved: ResolvedFile): Promise<MatchCheck> {
  const episodes = await listSonarrEpisodes(resolved.config, resolved.titleId)
  if (!episodes.success) return unknown("UNAVAILABLE")
  const inFile = episodes.data.filter((episode) => resolved.episodeIds.includes(episode.id))
  return inFile.some((episode) => episode.seasonNumber === item.seasonNumber && episode.episodeNumber === item.episodeNumber) ? AGREES : unknown("EPISODE_ORDER")
}

/** Checks Plex's match for the title a report is about; see the module comment. */
export async function checkMatch(server: PlexServer, ratingKey: string): Promise<MatchCheck> {
  const lookup = await getPlexItemMetadata(server, ratingKey)
  if (lookup.status !== "found") return unknown(lookup.status === "missing" ? "NO_FILE" : "UNAVAILABLE")
  const { item } = lookup
  if (item.type === "show") return checkShow(item)
  if (item.type !== "movie" && item.type !== "episode") return unknown("NO_FILE")

  const resolution = await resolveFile(server, ratingKey)
  if (resolution.ok) return item.type === "episode" ? checkEpisodeOrder(item, resolution.resolved) : AGREES
  if (!LOOK_BY_FOLDER.has(resolution.reason)) return unknown(resolution.reason)
  return item.type === "movie" ? movieByFolder(item) : episodeByFolder(server, item)
}
