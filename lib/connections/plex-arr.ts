/**
 * Links a Plex item to the Radarr movie or Sonarr series it came from, by the
 * ids Plex holds for it (TMDB, TVDB, IMDb), never by title.
 *
 * ## Lookup
 *
 * 1. Read the item's metadata (`getPlexItemMetadata`). An episode reads its
 *    show (`grandparentRatingKey`): Sonarr holds series, and an episode's own
 *    ids are episode ids.
 * 2. A movie goes to the active Radarr, by TMDB id and then IMDb id
 *    (`findRadarrMovie`). A show goes to the active Sonarr, by TVDB id and
 *    then TMDB or IMDb id (`findSonarrSeries`).
 * 3. Any other type, an item without ids, an id the service doesn't have, a
 *    service that isn't set up or can't be read: `null`. No link is better
 *    than a link to the wrong title, because later steps change files by it.
 *
 * @module
 */

import "server-only"

import { getPlexItemMetadata, type PlexItemMetadata } from "@/lib/connections/plex"
import { findRadarrMovie } from "@/lib/connections/radarr"
import { findSonarrSeries } from "@/lib/connections/sonarr"
import { getActiveService } from "@/lib/data/active-service"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("PLEX_ARR")

interface PlexServer {
  url: string
  token: string
}

/** The movie or show behind an item: the item itself, or an episode's show. */
async function readTitle(server: PlexServer, ratingKey: string): Promise<PlexItemMetadata | null> {
  const lookup = await getPlexItemMetadata(server, ratingKey)
  if (lookup.status !== "found") return null
  if (lookup.item.type !== "episode") return lookup.item
  if (!lookup.item.grandparentRatingKey) return null
  const show = await getPlexItemMetadata(server, lookup.item.grandparentRatingKey)
  return show.status === "found" ? show.item : null
}

async function activeArr(kind: "radarr" | "sonarr") {
  const row = await getActiveService(kind)
  return row ? { name: row.name, url: row.url, apiKey: row.apiKey } : null
}

/**
 * The Radarr movie or Sonarr series behind a Plex movie, show or episode.
 *
 * @param server - The active Plex server (URL and owner token)
 * @param ratingKey - The item's rating key
 * @returns The service and the title's id and `titleSlug`, or `null`
 */
export async function findArrTitle(
  server: PlexServer,
  ratingKey: string
): Promise<{ service: "radarr" | "sonarr"; id: number; titleSlug: string } | null> {
  const title = await readTitle(server, ratingKey)
  if (!title || Object.keys(title.ids).length === 0) return null
  const service = title.type === "movie" ? "radarr" : title.type === "show" ? "sonarr" : null
  if (!service) return null

  const config = await activeArr(service)
  if (!config) return null
  const result = service === "radarr" ? await findRadarrMovie(config, title.ids) : await findSonarrSeries(config, title.ids)
  if (!result.success) {
    logger.warn("Could not look the title up by its Plex ids", { service, ratingKey, error: result.error })
    return null
  }
  return result.data ? { service, id: result.data.id, titleSlug: result.data.titleSlug } : null
}
