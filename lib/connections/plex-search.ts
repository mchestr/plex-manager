/**
 * Plex search functionality
 */

import { type PlexServerParsed } from "@/lib/validations/plex"
import { fetchWithTimeout, isTimeoutError } from "@/lib/utils/fetch-with-timeout"
import { logger, type PlexMediaItem } from "./plex-core"

/**
 * Search for media items in Plex by title
 * Uses the search endpoint to find media items
 */
export async function searchPlexMedia(
  config: PlexServerParsed,
  query: string,
  mediaType?: 'movie' | 'show' | 'episode'
): Promise<{ success: boolean; data?: PlexMediaItem[]; error?: string }> {
  const startTime = Date.now()
  logger.debug("Searching Plex media", { query, mediaType })

  try {
    // Map media types to Plex type codes
    const typeCodeMap: Record<string, number> = {
      movie: 1,
      show: 2,
      episode: 4,
    }

    // Build URL with query parameter
    let url = `${config.url}/search?query=${encodeURIComponent(query)}&X-Plex-Token=${config.token}`

    // Add type filter if specified
    if (mediaType && typeCodeMap[mediaType]) {
      url += `&type=${typeCodeMap[mediaType]}`
    }

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    })

    if (!response.ok) {
      const duration = Date.now() - startTime
      logger.error("Failed to search Plex media", undefined, {
        query,
        mediaType,
        status: response.status,
        statusText: response.statusText,
        duration,
      })
      return { success: false, error: `Failed to search media: ${response.statusText}` }
    }

    const data = await response.json()

    // Extract media items from response
    const mediaContainer = data.MediaContainer
    if (!mediaContainer?.Metadata) {
      const duration = Date.now() - startTime
      logger.debug("No search results found", { query, mediaType, duration })
      return { success: true, data: [] }
    }

    // Handle both single item and array of items
    const metadataArray = Array.isArray(mediaContainer.Metadata)
      ? mediaContainer.Metadata
      : [mediaContainer.Metadata]

    const mediaItems: PlexMediaItem[] = metadataArray.map((item: any) => ({
      ratingKey: item.ratingKey?.toString() || '',
      title: item.title || '',
      type: item.type || '',
      year: item.year,
      parentTitle: item.parentTitle,
      grandparentTitle: item.grandparentTitle,
      index: item.index,
      parentIndex: item.parentIndex,
      thumb: item.thumb,
      viewCount: item.viewCount,
      lastViewedAt: item.lastViewedAt,
    }))

    const duration = Date.now() - startTime
    logger.info("Successfully searched Plex media", {
      query,
      mediaType,
      resultCount: mediaItems.length,
      duration,
    })
    return { success: true, data: mediaItems }
  } catch (error) {
    const duration = Date.now() - startTime
    logger.error("Error searching Plex media", error, { query, mediaType, duration })
    if (isTimeoutError(error)) {
      return { success: false, error: "Connection timeout" }
    }
    if (error instanceof Error) {
      return { success: false, error: `Error searching media: ${error.message}` }
    }
    return { success: false, error: "Failed to search Plex media" }
  }
}
