/**
 * Plex server statistics functions
 */

import { z } from "zod"

import { serviceFetch } from "@/lib/connections/http"
import { createLogger } from "@/lib/utils/logger"
import { formatBytes } from "@/lib/utils/time-formatting"
import type { PlexConfig, TautulliConfig, ServerStatisticsData } from "./statistics-types"
import { fetchTautulliLibraryCounts } from "./tautulli-statistics"

const logger = createLogger("STATISTICS")

const plexItemsSchema = z.array(
  z.looseObject({
    Media: z
      .array(z.looseObject({ Part: z.array(z.looseObject({ size: z.union([z.number(), z.string()]).optional() })).optional() }))
      .optional(),
  })
)

const plexContainerSchema = z.looseObject({
  MediaContainer: z
    .looseObject({
      Directory: z.unknown().optional(),
      Metadata: plexItemsSchema.optional(),
      totalSize: z.number().optional(),
    })
    .optional(),
})

/** Bytes in every `Media.Part` of the items. */
function sumPartSizes(items: z.infer<typeof plexItemsSchema>): number {
  let total = 0
  for (const item of items) {
    for (const media of item.Media ?? []) {
      for (const part of media.Part ?? []) total += parseInt(String(part.size ?? "0"), 10) || 0
    }
  }
  return total
}

/**
 * A whole-library PMS read. Unpaginated until P2.4's library source replaces
 * it, so the budget is a generous 2 minutes, body included.
 */
function plexLibraryGet(config: PlexConfig, path: string) {
  return serviceFetch({
    service: "Plex",
    url: `${config.url}${path}`,
    headers: { "X-Plex-Token": config.token },
    schema: plexContainerSchema,
    timeoutMs: 120_000,
  })
}

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
    // Get all library sections
    const sectionsResult = await plexLibraryGet(config, "/library/sections")

    if (!sectionsResult.ok) {
      logger.error("Failed to fetch library sections from Plex", undefined, { code: sectionsResult.code, status: sectionsResult.status })
      return {
        success: false,
        error: "Failed to fetch library sections from Plex",
      }
    }

    const sections = sectionsResult.data.MediaContainer?.Directory || []

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

      // Get all items in this section using /all endpoint
      const allItems = await plexLibraryGet(config, `/library/sections/${sectionKey}/all?includeGuids=1`)

      if (!allItems.ok) {
        logger.warn("Failed to fetch items for a Plex library", { sectionTitle, code: allItems.code, status: allItems.status })
        continue
      }

      const mediaContainer = allItems.data.MediaContainer || {}
      const items = mediaContainer.Metadata || []
      const totalSize = mediaContainer.totalSize || items.length

      if (sectionType === "movie") {
        moviesCount += totalSize
        totalStorage += sumPartSizes(items)
      } else if (sectionType === "show") {
        showsCount += totalSize

        // Get all episodes directly using type=4 (episode)
        const episodes = await plexLibraryGet(config, `/library/sections/${sectionKey}/all?type=4`)

        if (episodes.ok) {
          const episodeItems = episodes.data.MediaContainer?.Metadata || []
          episodesCount += episodeItems.length
          totalStorage += sumPartSizes(episodeItems)
        } else {
          logger.warn("Failed to fetch episodes for a Plex library", { sectionTitle, code: episodes.code, status: episodes.status })
        }
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
