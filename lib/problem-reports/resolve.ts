/**
 * The file a fix acts on: the one Plex plays, matched to Radarr's movie file
 * or a Sonarr episode file. Read fresh at run time and never taken from what
 * a report stored, since files change under reports (docs/problem-reports.md,
 * "Fixes").
 *
 * ## Matching
 *
 * 1. Read the Plex item. Versions Plex made with Optimize don't count; a
 *    title with several real versions, or one split into parts, goes to the
 *    server admin, since no fix can tell which one the member played.
 * 2. Find the movie or series by the ids Plex holds (an episode by its
 *    show's), never by title.
 * 3. Match the Plex file to a Radarr or Sonarr file by its name and the name
 *    of its folder, compared without case. Plex and Radarr or Sonarr often
 *    see the same disk under different roots (containers), so whole paths
 *    never match. Files that still tie are told apart by size.
 *
 * Specials (season 0) and anything Radarr or Sonarr doesn't monitor go to the
 * server admin too: Sonarr numbers specials its own way, and an unmonitored
 * title is one the server admin chose to leave alone.
 *
 * @module lib/problem-reports/resolve
 */

import "server-only"

import { type ArrFile } from "@/lib/connections/arr-upgrade"
import { getPlexItemMetadata, type PlexItemMetadata } from "@/lib/connections/plex"
import { findRadarrMovie } from "@/lib/connections/radarr"
import { getRadarrMovieFile } from "@/lib/connections/radarr-movie"
import { findSonarrSeries } from "@/lib/connections/sonarr"
import { getSonarrSeriesState, listSonarrEpisodeFiles, listSonarrEpisodes } from "@/lib/connections/sonarr-episodes"
import { getActiveService } from "@/lib/data/active-service"
import { folderOf, matchFile } from "@/lib/problem-reports/file-match"

type PlexServer = { url: string; token: string }

/** The active Radarr or Sonarr, as its calls take it. */
export type ArrConfig = { name: string; url: string; apiKey: string }

/** Why a file couldn't be resolved, which the server admin sees. */
type ResolveRefusal =
  | "NO_RADARR"
  | "NO_SONARR"
  | "NOT_IN_RADARR"
  | "NOT_IN_SONARR"
  | "NO_IDS"
  | "NO_FILE"
  | "SEVERAL_VERSIONS"
  | "MULTI_PART"
  | "SPECIAL"
  | "UNMONITORED"
  | "UNAVAILABLE"

/** The file Plex plays, and the same file in Radarr or Sonarr. */
export interface ResolvedFile {
  service: "radarr" | "sonarr"
  config: ArrConfig
  /** The Radarr movie or the Sonarr series. */
  titleId: number
  qualityProfileId: number
  file: ArrFile
  /** Sonarr: the episodes in the file, two for a double episode. */
  episodeIds: number[]
  /** The item in Plex, its guid, its library section, and the file and its folder as Plex sees them. */
  plex: { ratingKey: string; guid: string | null; sectionId: string | null; file: string; folder: string }
}

export type Resolution = { ok: true; resolved: ResolvedFile } | { ok: false; reason: ResolveRefusal }

const refuse = (reason: ResolveRefusal): Resolution => ({ ok: false, reason })

/** The one real file of a movie or episode, or why there isn't one. */
export function plexFile(item: PlexItemMetadata): { file: string; size?: number } | ResolveRefusal {
  if (item.type !== "movie" && item.type !== "episode") return "NO_FILE"
  const versions = item.media.filter((media) => !media.optimized)
  if (versions.length > 1) return "SEVERAL_VERSIONS"
  const parts = versions[0]?.parts ?? []
  if (parts.length > 1) return "MULTI_PART"
  return parts[0] ?? "NO_FILE"
}

async function readItem(server: PlexServer, ratingKey: string): Promise<PlexItemMetadata | ResolveRefusal> {
  const lookup = await getPlexItemMetadata(server, ratingKey)
  if (lookup.status === "found") return lookup.item
  return lookup.status === "missing" ? "NO_FILE" : "UNAVAILABLE"
}

async function arrConfig(kind: "radarr" | "sonarr"): Promise<ArrConfig | null> {
  const row = await getActiveService(kind)
  return row ? { name: row.name, url: row.url, apiKey: row.apiKey } : null
}

async function resolveMovie(item: PlexItemMetadata, file: { file: string; size?: number }): Promise<Resolution> {
  if (Object.keys(item.ids).length === 0) return refuse("NO_IDS")
  const config = await arrConfig("radarr")
  if (!config) return refuse("NO_RADARR")
  const found = await findRadarrMovie(config, item.ids)
  if (!found.success) return refuse("UNAVAILABLE")
  if (!found.data) return refuse("NOT_IN_RADARR")

  const movie = await getRadarrMovieFile(config, found.data.id)
  if (!movie.success) return refuse("UNAVAILABLE")
  if (!movie.data.monitored) return refuse("UNMONITORED")
  const radarrFile = movie.data.file
  // Radarr names a file relative to the movie's folder; its path is the folder and that name
  const path = radarrFile?.path ?? (radarrFile?.relativePath && movie.data.path ? `${movie.data.path}/${radarrFile.relativePath}` : null)
  if (!radarrFile || !path || !matchFile(file, [{ path, size: radarrFile.size }])) return refuse("NO_FILE")
  return { ok: true, resolved: { service: "radarr", config, titleId: movie.data.id, qualityProfileId: movie.data.qualityProfileId, file: radarrFile, episodeIds: [], plex: plexSide(item, file) } }
}

async function resolveEpisode(server: PlexServer, item: PlexItemMetadata, file: { file: string; size?: number }): Promise<Resolution> {
  if (item.seasonNumber === 0) return refuse("SPECIAL")
  const show = item.grandparentRatingKey ? await readItem(server, item.grandparentRatingKey) : "UNAVAILABLE"
  if (typeof show === "string") return refuse("UNAVAILABLE")
  if (Object.keys(show.ids).length === 0) return refuse("NO_IDS")
  const config = await arrConfig("sonarr")
  if (!config) return refuse("NO_SONARR")
  const found = await findSonarrSeries(config, show.ids)
  if (!found.success) return refuse("UNAVAILABLE")
  if (!found.data) return refuse("NOT_IN_SONARR")

  const seriesId = found.data.id
  const [series, episodes, files] = await Promise.all([getSonarrSeriesState(config, seriesId), listSonarrEpisodes(config, seriesId), listSonarrEpisodeFiles(config, seriesId)])
  if (!series.success || !episodes.success || !files.success) return refuse("UNAVAILABLE")
  if (!series.data.monitored) return refuse("UNMONITORED")

  const sonarrFile = matchFile(file, files.data.flatMap((candidate) => (candidate.path ? [{ ...candidate, path: candidate.path }] : [])))
  const inFile = sonarrFile ? episodes.data.filter((episode) => episode.episodeFileId === sonarrFile.id) : []
  if (!sonarrFile || inFile.length === 0) return refuse("NO_FILE")
  if (inFile.some((episode) => episode.seasonNumber === 0)) return refuse("SPECIAL")
  if (inFile.some((episode) => !episode.monitored)) return refuse("UNMONITORED")
  return {
    ok: true,
    resolved: { service: "sonarr", config, titleId: seriesId, qualityProfileId: series.data.qualityProfileId, file: sonarrFile, episodeIds: inFile.map((episode) => episode.id), plex: plexSide(item, file) },
  }
}

const plexSide = (item: PlexItemMetadata, file: { file: string }) => ({
  ratingKey: item.ratingKey,
  guid: item.guid ?? null,
  sectionId: item.librarySectionId ?? null,
  file: file.file,
  folder: folderOf(file.file),
})

/**
 * Resolves the file of a movie or episode; see the module comment.
 *
 * @param server - The active Plex server (URL and owner token)
 * @param ratingKey - The movie's or episode's rating key
 */
export async function resolveFile(server: PlexServer, ratingKey: string): Promise<Resolution> {
  const item = await readItem(server, ratingKey)
  if (typeof item === "string") return refuse(item)
  const file = plexFile(item)
  if (typeof file === "string") return refuse(file)
  return item.type === "movie" ? resolveMovie(item, file) : resolveEpisode(server, item, file)
}
