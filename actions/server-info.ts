"use server"

import { prisma } from "@/lib/prisma"

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
    const plexServer = await prisma.plexServer.findFirst({
      where: { isActive: true },
    })
    return plexServer?.name || "Plex"
  } catch (error) {
    console.error("[SERVER INFO] Error fetching server name:", error)
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
    const plexServer = await prisma.plexServer.findFirst({
      where: { isActive: true },
    })

    if (!plexServer) {
      return { success: false, error: "No active Plex server configured" }
    }

    // Fetch library sections directly from the local Plex server
    const baseUrl = `${plexServer.protocol}://${plexServer.hostname}:${plexServer.port}`
    const sectionsUrl = `${baseUrl}/library/sections?X-Plex-Token=${plexServer.token}`

    console.log("[SERVER INFO] Fetching libraries from local server:", sectionsUrl)

    const response = await fetch(sectionsUrl, {
      headers: { Accept: "application/json" },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[SERVER INFO] Failed to fetch library details:", response.status, errorText)
      return { success: false, error: `Failed to fetch library details: ${response.statusText}` }
    }

    const data = await response.json()
    console.log("[SERVER INFO] Library sections response:", JSON.stringify(data, null, 2))

    const sections = data.MediaContainer?.Directory || []

    if (!Array.isArray(sections)) {
      console.error("[SERVER INFO] Invalid sections format:", sections)
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
          console.warn("[SERVER INFO] Invalid section key:", section.key)
          return null
        }
        return {
          id: key, // Use section key as ID
          title: section.title || `Library ${key}`,
          type: section.type,
        }
      })
      .filter((lib): lib is LibrarySection => lib !== null)

    console.log("[SERVER INFO] Final libraries list:", libraries)

    if (libraries.length === 0) {
      return { success: false, error: "No libraries found on the server" }
    }

    return { success: true, data: libraries }
  } catch (error) {
    console.error("[SERVER INFO] Error fetching libraries:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch libraries",
    }
  }
}
