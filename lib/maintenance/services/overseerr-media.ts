/**
 * Overseerr media fetching service for maintenance rules
 */

import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { batchGetOverseerrMediaStatus } from "@/lib/connections/overseerr"
import type { OverseerrParsed } from "@/lib/validations/overseerr"
import type { OverseerrMediaStatus } from "./types"

const logger = createLogger("overseerr-media")

/**
 * Fetch Overseerr status for movies by TMDB IDs
 */
export async function fetchOverseerrMovieData(
  tmdbIds: number[]
): Promise<Map<string, OverseerrMediaStatus>> {
  return fetchOverseerrMediaByType(tmdbIds, "movie")
}

/**
 * Fetch Overseerr status for TV series by TMDB IDs
 */
export async function fetchOverseerrSeriesData(
  tmdbIds: number[]
): Promise<Map<string, OverseerrMediaStatus>> {
  return fetchOverseerrMediaByType(tmdbIds, "tv")
}

/**
 * Fetch Overseerr status for media by TMDB IDs and type
 */
async function fetchOverseerrMediaByType(
  tmdbIds: number[],
  mediaType: "movie" | "tv"
): Promise<Map<string, OverseerrMediaStatus>> {
  try {
    if (tmdbIds.length === 0) {
      return new Map()
    }

    const overseerr = await prisma.overseerr.findFirst({
      where: { isActive: true },
    })

    if (!overseerr) {
      logger.debug("No active Overseerr server configured")
      return new Map()
    }

    const overseerrConfig: OverseerrParsed = {
      url: overseerr.url,
      apiKey: overseerr.apiKey,
      name: overseerr.name,
    }

    const items = tmdbIds.map((tmdbId) => ({ tmdbId, mediaType }))
    const result = await batchGetOverseerrMediaStatus(overseerrConfig, items)

    logger.debug(`Fetched Overseerr status for ${result.size} ${mediaType} items`)
    return result
  } catch (error) {
    logger.error(`Failed to fetch ${mediaType} data from Overseerr`, { error })
    return new Map()
  }
}
