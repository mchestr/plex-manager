/**
 * Plex mark watched/unwatched functionality
 */

import { type PlexServerParsed } from "@/lib/validations/plex"
import { z } from "zod"

import { serviceErrorMessage, serviceFetch } from "@/lib/connections/http"
import { logger } from "./plex-core"

/**
 * Mark a Plex item as watched
 * Uses the scrobble endpoint to mark content as watched
 */
export async function markPlexItemWatched(
  config: PlexServerParsed,
  ratingKey: string
): Promise<{ success: boolean; error?: string }> {
  const startTime = Date.now()
  logger.debug("Marking Plex item as watched", { ratingKey })

  const params = new URLSearchParams({ identifier: "com.plexapp.plugins.library", key: ratingKey })
  const result = await serviceFetch({
    service: "Plex",
    url: `${config.url}/:/scrobble?${params.toString()}`,
    headers: { "X-Plex-Token": config.token },
    responseType: "text",
    schema: z.string(),
  })

  const duration = Date.now() - startTime
  if (!result.ok) {
    logger.error("Failed to mark item as watched", undefined, { ratingKey, code: result.code, status: result.status, duration })
    return { success: false, error: serviceErrorMessage("Plex", result) }
  }

  logger.info("Successfully marked item as watched", { ratingKey, duration })
  return { success: true }
}
