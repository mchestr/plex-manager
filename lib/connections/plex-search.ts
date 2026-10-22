/**
 * Plex search functionality
 */

import { type PlexServerParsed } from "@/lib/validations/plex"
import { z } from "zod"

import { serviceErrorMessage, serviceFetch } from "@/lib/connections/http"
import { containerPage, PLEX_PAGE_SIZE } from "@/lib/connections/plex-sessions"
import { logger, type PlexMediaItem } from "./plex-core"

const optionalNumber = z.coerce.number().optional().catch(undefined)
const optionalText = z.string().optional().catch(undefined)

/** The fields this module reads from one search result; Plex sends many more. */
const searchItemSchema = z.looseObject({
  ratingKey: z.union([z.string(), z.number()]).transform(String).catch(""),
  title: z.string().catch(""),
  type: z.string().catch(""),
  year: optionalNumber,
  parentTitle: optionalText,
  grandparentTitle: optionalText,
  index: optionalNumber,
  parentIndex: optionalNumber,
  thumb: optionalText,
  viewCount: optionalNumber,
  lastViewedAt: optionalNumber,
})

const searchResponseSchema = z.looseObject({
  MediaContainer: z
    .looseObject({ Metadata: z.union([z.array(searchItemSchema), searchItemSchema]).optional() })
    .optional(),
})

/**
 * Search for media items in Plex by title, the first page of 50 results
 * (`X-Plex-Container-Start`/`Size`), each validated with Zod (GAP-10).
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

    const params = new URLSearchParams({ query })
    if (mediaType && typeCodeMap[mediaType]) {
      params.set("type", String(typeCodeMap[mediaType]))
    }

    const result = await serviceFetch({
      service: "Plex",
      url: `${config.url}/search?${params.toString()}`,
      headers: { "X-Plex-Token": config.token, ...containerPage(PLEX_PAGE_SIZE) },
      schema: searchResponseSchema,
    })

    if (!result.ok) {
      const duration = Date.now() - startTime
      logger.error("Failed to search Plex media", undefined, { query, mediaType, code: result.code, status: result.status, duration })
      return { success: false, error: serviceErrorMessage("Plex", result) }
    }

    const data = result.data

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

    const mediaItems: PlexMediaItem[] = metadataArray.filter((item) => item.ratingKey).map((item) => ({
      ratingKey: item.ratingKey,
      title: item.title,
      type: item.type,
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
    return { success: false, error: "Failed to search Plex media" }
  }
}
