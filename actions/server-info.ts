"use server"

import { getActivePlexService } from "@/lib/services/service-helpers"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("SERVER_INFO")

export interface LibrarySection {
  id: number
  title: string
  type: string
}

/**
 * Get the name of the active Plex server
 */
export async function getServerName(): Promise<string> {
  try {
    const plexService = await getActivePlexService()
    return plexService?.name || "Plex"
  } catch (error) {
    logger.error("Error fetching server name", error)
    return "Plex"
  }
}

/**
 * Get available library sections from the active Plex server
 * Returns libraries with their section keys (which are used as IDs in Plex API)
 */
export async function getAvailableLibraries(): Promise<{
  success: boolean
  data?: LibrarySection[]
  error?: string
}> {
  try {
    const plexService = await getActivePlexService()

    if (!plexService) {
      return { success: false, error: "No active Plex server configured" }
    }

    // Fetch library sections directly from the local Plex server
    const sectionsUrl = `${plexService.url}/library/sections?X-Plex-Token=${plexService.config.token}`

    logger.debug("Fetching libraries from local server", { url: sectionsUrl })

    const response = await fetch(sectionsUrl, {
      headers: { Accept: "application/json" },
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error("Failed to fetch library details", undefined, { status: response.status, errorText })
      return { success: false, error: `Failed to fetch library details: ${response.statusText}` }
    }

    const data = await response.json()
    logger.debug("Library sections response", { data })

    const sections = data.MediaContainer?.Directory || []

    if (!Array.isArray(sections)) {
      logger.error("Invalid sections format", undefined, { sections })
      return { success: false, error: "Invalid response format from Plex server" }
    }

    // Use local server section keys directly as IDs
    const libraries: LibrarySection[] = sections
      .filter((section: { type?: string; hidden?: number }) => {
        const type = section.type
        // Include all libraries of supported types (including hidden ones for invite selection)
        return type === "movie" || type === "show" || type === "artist"
      })
      .map((section: { key: string; title: string; type: string }) => {
        const key = parseInt(section.key)
        if (isNaN(key)) {
          logger.warn("Invalid section key", { sectionKey: section.key })
          return null
        }
        return {
          id: key, // Use section key as ID
          title: section.title || `Library ${key}`,
          type: section.type,
        }
      })
      .filter((lib): lib is LibrarySection => lib !== null)

    logger.info("Retrieved libraries from Plex server", { count: libraries.length, libraries })

    if (libraries.length === 0) {
      return { success: false, error: "No libraries found on the server" }
    }

    return { success: true, data: libraries }
  } catch (error) {
    logger.error("Error fetching libraries", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch libraries",
    }
  }
}
