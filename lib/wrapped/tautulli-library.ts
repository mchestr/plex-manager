/**
 * Tautulli library functions
 *
 * Fetches library information (counts, not storage) from Tautulli
 */

import { createLogger } from "@/lib/utils/logger"
import type { TautulliConfig } from "./statistics-types"

const logger = createLogger("STATISTICS")

/**
 * Fetch only library counts from Tautulli (no storage calculation)
 */
export async function fetchTautulliLibraryCounts(
  config: TautulliConfig
): Promise<{
  success: boolean
  data?: {
    librarySize: {
      movies: number
      shows: number
      episodes: number
    }
  }
  error?: string
}> {
  try {
    const baseUrl = `${config.url}/api/v2`
    const apiKey = config.apiKey

    // Get libraries - this provides counts including child_count (episodes)
    const librariesUrl = `${baseUrl}?apikey=${apiKey}&cmd=get_libraries`

    const librariesResponse = await fetch(librariesUrl, {
      headers: { "Accept": "application/json" },
    })

    if (!librariesResponse.ok) {
      return {
        success: false,
        error: `Failed to fetch libraries from Tautulli: ${librariesResponse.statusText}`,
      }
    }

    const librariesData = await librariesResponse.json()

    if (librariesData.response?.result === "error") {
      return {
        success: false,
        error: librariesData.response?.message || "Tautulli API error",
      }
    }

    const libraries = Array.isArray(librariesData.response?.data)
      ? librariesData.response.data
      : librariesData.response?.data?.data || []

    let moviesCount = 0
    let showsCount = 0
    let episodesCount = 0

    // Sum counts from all libraries
    for (const library of libraries) {
      const sectionType = library.section_type
      const count = parseInt(library.count || "0", 10)
      const childCount = parseInt(library.child_count || "0", 10)

      if (sectionType === "movie") {
        moviesCount += count
      } else if (sectionType === "show") {
        showsCount += count
        episodesCount += childCount
      }
    }

    return {
      success: true,
      data: {
        librarySize: {
          movies: moviesCount,
          shows: showsCount,
          episodes: episodesCount,
        },
      },
    }
  } catch (error) {
    logger.error("Error fetching library counts from Tautulli", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch library counts from Tautulli",
    }
  }
}
