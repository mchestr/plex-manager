/**
 * Plex server statistics functions
 */

import { createLogger } from "@/lib/utils/logger"
import { formatBytes } from "@/lib/utils/time-formatting"
import type { PlexConfig, TautulliConfig, ServerStatisticsData } from "./statistics-types"
import { fetchTautulliLibraryCounts } from "./tautulli-statistics"

const logger = createLogger("STATISTICS")

/**
 * Fetch server statistics from Plex API (more efficient than Tautulli for storage)
 */
async function fetchPlexServerStatisticsFromPlex(
  config: PlexConfig
): Promise<{
  success: boolean
  data?: {
    totalStorage: number
    totalStorageFormatted: string
    librarySize: {
      movies: number
      shows: number
      episodes: number
    }
  }
  error?: string
}> {
  try {
    const baseUrl = `${config.url}`
    const token = config.token

    // Get all library sections
    const sectionsUrl = `${baseUrl}/library/sections?X-Plex-Token=${token}`

    const sectionsResponse = await fetch(sectionsUrl, {
      headers: { "Accept": "application/json" },
    })

    if (!sectionsResponse.ok) {
      logger.error("Failed to fetch library sections from Plex", undefined, { statusText: sectionsResponse.statusText })
      return {
        success: false,
        error: `Failed to fetch library sections from Plex: ${sectionsResponse.statusText}`,
      }
    }

    const sectionsData = await sectionsResponse.json()
    const sections = sectionsData.MediaContainer?.Directory || []

    if (!Array.isArray(sections)) {
      logger.error("Invalid response format from Plex API: expected array of sections")
      return {
        success: false,
        error: "Invalid response format from Plex API",
      }
    }

    let totalStorage = 0
    let moviesCount = 0
    let showsCount = 0
    let episodesCount = 0

    // Process each library section
    for (const section of sections) {
      const sectionKey = section.key
      const sectionTitle = section.title || `Section ${sectionKey}`
      const sectionType = section.type // "movie" or "show"

      try {
        // Get all items in this section using /all endpoint
        const allItemsUrl = `${baseUrl}/library/sections/${sectionKey}/all?X-Plex-Token=${token}&includeGuids=1`

        const allItemsResponse = await fetch(allItemsUrl, {
          headers: { "Accept": "application/json" },
        })

        if (!allItemsResponse.ok) {
          console.warn(`[STATISTICS] Failed to fetch items for library "${sectionTitle}": ${allItemsResponse.statusText}`)
          continue
        }

        const allItemsData = await allItemsResponse.json()
        const mediaContainer = allItemsData.MediaContainer || {}
        const items = mediaContainer.Metadata || []
        const totalSize = mediaContainer.totalSize || items.length

        if (sectionType === "movie") {
          moviesCount += totalSize

          // Sum file sizes from all movies
          for (const movie of items) {
            const media = movie.Media || []
            for (const mediaItem of media) {
              const parts = mediaItem.Part || []
              for (const part of parts) {
                totalStorage += parseInt(part.size || "0", 10)
              }
            }
          }
        } else if (sectionType === "show") {
          showsCount += totalSize

          // Get all episodes directly using type=episode filter
          const episodesUrl = `${baseUrl}/library/sections/${sectionKey}/all?X-Plex-Token=${token}&type=4` // type=4 is episode

          const episodesResponse = await fetch(episodesUrl, {
            headers: { "Accept": "application/json" },
          })

          if (episodesResponse.ok) {
            const episodesData = await episodesResponse.json()
            const episodesContainer = episodesData.MediaContainer || {}
            const episodes = episodesContainer.Metadata || []
            episodesCount += episodes.length

            // Sum file sizes from all episodes
            for (const episode of episodes) {
              const media = episode.Media || []
              for (const mediaItem of media) {
                const parts = mediaItem.Part || []
                for (const part of parts) {
                  totalStorage += parseInt(part.size || "0", 10)
                }
              }
            }
          } else {
            console.warn(`[STATISTICS] Failed to fetch episodes for library "${sectionTitle}": ${episodesResponse.statusText}`)
          }
        }
      } catch (libraryError) {
        console.warn(`[STATISTICS] Error processing library "${sectionTitle}":`, libraryError)
        continue
      }
    }

    return {
      success: true,
      data: {
        totalStorage,
        totalStorageFormatted: formatBytes(totalStorage),
        librarySize: {
          movies: moviesCount,
          shows: showsCount,
          episodes: episodesCount,
        },
      },
    }
  } catch (error) {
    logger.error("Error fetching server statistics from Plex", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch server statistics from Plex",
    }
  }
}

/**
 * Fetch server statistics from Plex API (storage) and Tautulli API (counts)
 */
export async function fetchPlexServerStatistics(
  config: PlexConfig,
  tautulliConfig: TautulliConfig
): Promise<{
  success: boolean
  data?: ServerStatisticsData
  error?: string
}> {
  try {
    // Use Plex API for storage (more efficient)
    // Use Tautulli for counts only (get_libraries provides accurate episode counts)
    const [plexResult, tautulliCountsResult] = await Promise.all([
      fetchPlexServerStatisticsFromPlex(config),
      fetchTautulliLibraryCounts(tautulliConfig),
    ])

    if (!plexResult.success) {
      return plexResult
    }

    if (!tautulliCountsResult.success) {
      return {
        success: false,
        error: tautulliCountsResult.error || "Failed to fetch library counts from Tautulli",
      }
    }

    // Combine: use Plex for storage, Tautulli for counts
    return {
      success: true,
      data: {
        totalStorage: plexResult.data!.totalStorage,
        totalStorageFormatted: plexResult.data!.totalStorageFormatted,
        librarySize: tautulliCountsResult.data!.librarySize,
      },
    }
  } catch (error) {
    logger.error("Error fetching server statistics", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch server statistics",
    }
  }
}
