/**
 * Plex mark watched/unwatched functionality
 */

import { type PlexServerParsed } from "@/lib/validations/plex"
import { fetchWithTimeout, isTimeoutError } from "@/lib/utils/fetch-with-timeout"
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

  try {
    const url = `${config.url}/:/scrobble?identifier=com.plexapp.plugins.library&key=${ratingKey}&X-Plex-Token=${config.token}`

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    })

    if (!response.ok) {
      const duration = Date.now() - startTime
      logger.error("Failed to mark item as watched", undefined, {
        ratingKey,
        status: response.status,
        statusText: response.statusText,
        duration,
      })
      return { success: false, error: `Failed to mark item as watched: ${response.statusText}` }
    }

    const duration = Date.now() - startTime
    logger.info("Successfully marked item as watched", { ratingKey, duration })
    return { success: true }
  } catch (error) {
    const duration = Date.now() - startTime
    logger.error("Error marking item as watched", error, { ratingKey, duration })
    if (isTimeoutError(error)) {
      return { success: false, error: "Connection timeout" }
    }
    if (error instanceof Error) {
      return { success: false, error: `Error marking item as watched: ${error.message}` }
    }
    return { success: false, error: "Failed to mark Plex item as watched" }
  }
}

/**
 * Mark a Plex item as unwatched
 * Uses the unscrobble endpoint to mark content as unwatched
 */
export async function markPlexItemUnwatched(
  config: PlexServerParsed,
  ratingKey: string
): Promise<{ success: boolean; error?: string }> {
  const startTime = Date.now()
  logger.debug("Marking Plex item as unwatched", { ratingKey })

  try {
    const url = `${config.url}/:/unscrobble?identifier=com.plexapp.plugins.library&key=${ratingKey}&X-Plex-Token=${config.token}`

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    })

    if (!response.ok) {
      const duration = Date.now() - startTime
      logger.error("Failed to mark item as unwatched", undefined, {
        ratingKey,
        status: response.status,
        statusText: response.statusText,
        duration,
      })
      return { success: false, error: `Failed to mark item as unwatched: ${response.statusText}` }
    }

    const duration = Date.now() - startTime
    logger.info("Successfully marked item as unwatched", { ratingKey, duration })
    return { success: true }
  } catch (error) {
    const duration = Date.now() - startTime
    logger.error("Error marking item as unwatched", error, { ratingKey, duration })
    if (isTimeoutError(error)) {
      return { success: false, error: "Connection timeout" }
    }
    if (error instanceof Error) {
      return { success: false, error: `Error marking item as unwatched: ${error.message}` }
    }
    return { success: false, error: "Failed to mark Plex item as unwatched" }
  }
}
