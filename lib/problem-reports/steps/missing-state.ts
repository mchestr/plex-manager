/**
 * What Sonarr and Plex hold for a show, read for "Episodes are missing"
 * (`decideMissing`). The show is the item itself, or an episode's show. Its
 * series is found in Sonarr by the ids Plex holds for it, never by title, and
 * read fresh on every call, since a run never trusts what it read before.
 *
 * @module lib/problem-reports/steps/missing-state
 */

import "server-only"

import { getPlexItemMetadata, getPlexShowEpisodes, type PlexItemMetadata } from "@/lib/connections/plex"
import { findSonarrSeries } from "@/lib/connections/sonarr"
import { listSonarrEpisodeFiles, listSonarrEpisodes } from "@/lib/connections/sonarr-episodes"
import { getActiveService } from "@/lib/data/active-service"
import { decideMissing, plexFileNames, type MissingDecision } from "@/lib/problem-reports/missing"

type PlexServer = { url: string; token: string }

/** Why the state couldn't be read: no Sonarr, a show Sonarr doesn't have, or a service that didn't answer. */
type MissingStateRefusal = "NO_SONARR" | "NOT_IN_SONARR" | "UNAVAILABLE"

/** The active Sonarr, as its calls take it. */
type SonarrConfig = { name: string; url: string; apiKey: string }

export type MissingState =
  | { ok: true; sonarr: SonarrConfig; show: PlexItemMetadata; seriesId: number; decision: MissingDecision }
  | { ok: false; reason: MissingStateRefusal }

async function readShow(server: PlexServer, ratingKey: string): Promise<PlexItemMetadata | null> {
  const lookup = await getPlexItemMetadata(server, ratingKey)
  if (lookup.status !== "found") return null
  if (lookup.item.type === "show") return lookup.item
  if (lookup.item.type !== "episode" || !lookup.item.grandparentRatingKey) return null
  const show = await getPlexItemMetadata(server, lookup.item.grandparentRatingKey)
  return show.status === "found" && show.item.type === "show" ? show.item : null
}

/**
 * Reads the show's episodes from Sonarr and Plex and decides.
 *
 * @param ratingKey - A show, or one of its episodes
 * @param targets - Only these Sonarr episodes (a run waiting for them)
 */
export async function readMissingState(server: PlexServer, ratingKey: string, now: Date, targets?: readonly number[]): Promise<MissingState> {
  const row = await getActiveService("sonarr")
  if (!row) return { ok: false, reason: "NO_SONARR" }
  const config = { name: row.name, url: row.url, apiKey: row.apiKey }

  const show = await readShow(server, ratingKey)
  if (!show) return { ok: false, reason: "UNAVAILABLE" }
  const series = await findSonarrSeries(config, show.ids)
  if (!series.success) return { ok: false, reason: "UNAVAILABLE" }
  if (!series.data) return { ok: false, reason: "NOT_IN_SONARR" }

  const [episodes, files, onPlex] = await Promise.all([
    listSonarrEpisodes(config, series.data.id),
    listSonarrEpisodeFiles(config, series.data.id),
    getPlexShowEpisodes(server, show.ratingKey),
  ])
  if (!episodes.success || !files.success || !onPlex.ok) return { ok: false, reason: "UNAVAILABLE" }

  const plexFiles = plexFileNames(onPlex.episodes.flatMap((episode) => episode.files))
  const decision = decideMissing({ now, episodes: episodes.data, files: files.data, plexFiles, targets })
  return { ok: true, sonarr: config, show, seriesId: series.data.id, decision }
}
