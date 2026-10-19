/**
 * Tautulli library functions
 *
 * Fetches library information (counts, not storage) from Tautulli
 */

import { z } from "zod"

import { tautulliCommand } from "@/lib/connections/tautulli"
import { createLogger } from "@/lib/utils/logger"
import { tautulliLibrarySchema } from "@/lib/validations/tautulli"
import type { TautulliConfig } from "./statistics-types"

const logger = createLogger("STATISTICS")

const librariesSchema = z.union([
  z.array(tautulliLibrarySchema),
  z.looseObject({ data: z.array(tautulliLibrarySchema) }).transform((page) => page.data),
])

/**
 * Fetch only library counts from Tautulli (no storage calculation)
 */
export async function fetchTautulliLibraryCounts(
  config: TautulliConfig,
  signal?: AbortSignal
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
    // get_libraries provides counts, including child_count (episodes)
    const result = await tautulliCommand(config, "get_libraries", {}, librariesSchema, { signal })
    if (!result.ok) {
      return { success: false, error: "Failed to fetch libraries from Tautulli" }
    }
    const libraries = result.data

    let moviesCount = 0
    let showsCount = 0
    let episodesCount = 0

    // Sum counts from all libraries
    for (const library of libraries) {
      const sectionType = library.section_type
      const count = parseInt(String(library.count ?? "0"), 10) || 0
      const childCount = parseInt(String(library.child_count ?? "0"), 10) || 0

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
