"use server"

import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { serviceErrorMessage, serviceFetch } from "@/lib/connections/http"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("SERVER_INFO")

export interface LibrarySection {
  id: number
  title: string
  type: string
}

/**
 * Get available library sections from the active Plex server
 * Returns libraries with their section keys (which are used as IDs in Plex API)
 */
export const getAvailableLibraries = adminAction({
  fallbackError: "Failed to fetch libraries",
  handler: async () => {
    const plexServer = await prisma.plexServer.findFirst({
      where: { isActive: true },
    orderBy: { updatedAt: "desc" },
    })

    if (!plexServer) {
      return fail("NOT_FOUND", "No active Plex server configured")
    }

    // Fetch library sections directly from the local Plex server
    const result = await serviceFetch({
      service: "Plex",
      url: `${plexServer.url}/library/sections`,
      headers: { "X-Plex-Token": plexServer.token },
      schema: z.looseObject({ MediaContainer: z.looseObject({ Directory: z.unknown() }).optional() }),
    })

    if (!result.ok) {
      // The upstream status and URL stay in the log, never in the result
      logger.warn("Could not fetch Plex libraries", { error: serviceErrorMessage("Plex", result) })
      return fail("UPSTREAM_UNAVAILABLE", "Could not reach the Plex server to list libraries")
    }

    const data = result.data

    const sections = data.MediaContainer?.Directory || []

    if (!Array.isArray(sections)) {
      logger.error("Invalid sections format", undefined, { sections })
      return fail("UPSTREAM_UNAVAILABLE", "Invalid response format from Plex server")
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

    logger.info("Retrieved libraries from Plex server", { count: libraries.length })

    if (libraries.length === 0) {
      return fail("NOT_FOUND", "No libraries found on the server")
    }

    return ok(libraries)
  },
})
