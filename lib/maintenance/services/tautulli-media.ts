/**
 * Tautulli media fetching service for maintenance rules
 */

import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { getTautulliLibraryMediaInfo, getTautulliLibraryNames } from "@/lib/connections/tautulli"
import type { TautulliParsed } from "@/lib/validations/tautulli"
import type { TautulliMediaItem } from "./types"

const logger = createLogger("tautulli-media")

interface TautulliLibrary {
  section_name: string
  section_type: string
  section_id: string
}

/**
 * Fetch movie data from Tautulli for playback/file/quality info
 */
export async function fetchTautulliMovieData(): Promise<TautulliMediaItem[]> {
  return fetchTautulliMediaByType("movie")
}

/**
 * Fetch TV series data from Tautulli for playback info
 */
export async function fetchTautulliSeriesData(): Promise<TautulliMediaItem[]> {
  return fetchTautulliMediaByType("show")
}

/**
 * Fetch media data from Tautulli by library type
 */
async function fetchTautulliMediaByType(libraryType: "movie" | "show"): Promise<TautulliMediaItem[]> {
  try {
    const tautulli = await prisma.tautulli.findFirst({
      where: { isActive: true },
    })

    if (!tautulli) {
      logger.debug("No active Tautulli server configured")
      return []
    }

    const tautulliConfig: TautulliParsed = {
      url: tautulli.url,
      apiKey: tautulli.apiKey,
      name: tautulli.name,
    }

    const librariesResult = await getTautulliLibraryNames(tautulliConfig)
    if (!librariesResult.success) {
      logger.debug("Failed to get library names", { error: librariesResult.error })
      return []
    }
    if (!librariesResult.data) {
      logger.debug("No library data returned")
      return []
    }

    const libraries = (librariesResult.data as { response?: { data?: TautulliLibrary[] } })?.response?.data || []
    const filteredLibraries = libraries.filter((lib) => lib.section_type === libraryType)

    if (filteredLibraries.length === 0) {
      logger.debug(`No ${libraryType} libraries found`)
      return []
    }

    const allMedia: TautulliMediaItem[] = []

    for (const library of filteredLibraries) {
      const mediaResult = await getTautulliLibraryMediaInfo(tautulliConfig, library.section_id, {
        length: 10000,
      })

      if (mediaResult.success && mediaResult.data) {
        const responseData = (mediaResult.data as { response?: { data?: { data?: TautulliMediaItem[] } } })?.response?.data
        const items = responseData?.data || []
        allMedia.push(...items)
      }
    }

    logger.debug(`Fetched ${allMedia.length} ${libraryType} items from Tautulli`)
    return allMedia
  } catch (error) {
    logger.error(`Failed to fetch ${libraryType} data from Tautulli`, { error })
    return []
  }
}
