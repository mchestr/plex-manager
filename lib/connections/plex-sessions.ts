/**
 * Plex session and library management functions
 */

import { fetchWithTimeout, isTimeoutError } from "@/lib/utils/fetch-with-timeout"

/**
 * Fetches current sessions from Plex server
 * Uses the Plex server API /status/sessions endpoint
 */
export async function getPlexSessions(
  serverConfig: { url: string; token: string }
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const url = `${serverConfig.url}/status/sessions?X-Plex-Token=${serverConfig.token}`

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    })

    if (!response.ok) {
      return { success: false, error: `Failed to fetch sessions: ${response.statusText}` }
    }

    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (isTimeoutError(error)) {
      return { success: false, error: "Connection timeout" }
    }
    if (error instanceof Error) {
      return { success: false, error: `Error fetching sessions: ${error.message}` }
    }
    return { success: false, error: "Failed to fetch Plex sessions" }
  }
}

/**
 * Get library sections from Plex server
 */
export async function getPlexLibrarySections(
  serverConfig: { url: string; token: string }
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const url = `${serverConfig.url}/library/sections?X-Plex-Token=${serverConfig.token}`

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    })

    if (!response.ok) {
      return { success: false, error: `Failed to fetch library sections: ${response.statusText}` }
    }

    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (isTimeoutError(error)) {
      return { success: false, error: "Connection timeout" }
    }
    if (error instanceof Error) {
      return { success: false, error: `Error fetching library sections: ${error.message}` }
    }
    return { success: false, error: "Failed to fetch Plex library sections" }
  }
}

/**
 * Get recently added content from Plex server
 */
export async function getPlexRecentlyAdded(
  serverConfig: { url: string; token: string },
  limit = 20
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const url = `${serverConfig.url}/library/recentlyAdded?X-Plex-Token=${serverConfig.token}&limit=${limit}`

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    })

    if (!response.ok) {
      return { success: false, error: `Failed to fetch recently added: ${response.statusText}` }
    }

    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (isTimeoutError(error)) {
      return { success: false, error: "Connection timeout" }
    }
    if (error instanceof Error) {
      return { success: false, error: `Error fetching recently added: ${error.message}` }
    }
    return { success: false, error: "Failed to fetch Plex recently added" }
  }
}

/**
 * Get all items from a specific library section
 * @param serverConfig - Plex server configuration
 * @param sectionId - Library section ID
 * @param type - Filter by type (1=movie, 2=show, 4=episode)
 */
export async function getPlexLibraryItems(
  serverConfig: { url: string; token: string },
  sectionId: string | number,
  type?: number
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    let url = `${serverConfig.url}/library/sections/${sectionId}/all?X-Plex-Token=${serverConfig.token}`
    if (type) {
      url += `&type=${type}`
    }

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
      timeoutMs: 60000, // Allow longer timeout for large libraries
    })

    if (!response.ok) {
      return { success: false, error: `Failed to fetch library items: ${response.statusText}` }
    }

    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (isTimeoutError(error)) {
      return { success: false, error: "Connection timeout - library may be too large" }
    }
    if (error instanceof Error) {
      return { success: false, error: `Error fetching library items: ${error.message}` }
    }
    return { success: false, error: "Failed to fetch Plex library items" }
  }
}

/**
 * Get on deck content from Plex server
 */
export async function getPlexOnDeck(
  serverConfig: { url: string; token: string }
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const url = `${serverConfig.url}/library/onDeck?X-Plex-Token=${serverConfig.token}`

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    })

    if (!response.ok) {
      return { success: false, error: `Failed to fetch on deck: ${response.statusText}` }
    }

    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (isTimeoutError(error)) {
      return { success: false, error: "Connection timeout" }
    }
    if (error instanceof Error) {
      return { success: false, error: `Error fetching on deck: ${error.message}` }
    }
    return { success: false, error: "Failed to fetch Plex on deck" }
  }
}

/**
 * Get all playlists from Plex server
 */
export async function getPlexPlaylists(
  serverConfig: { url: string; token: string }
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const url = `${serverConfig.url}/playlists?X-Plex-Token=${serverConfig.token}`

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    })

    if (!response.ok) {
      return { success: false, error: `Failed to fetch playlists: ${response.statusText}` }
    }

    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (isTimeoutError(error)) {
      return { success: false, error: "Connection timeout" }
    }
    if (error instanceof Error) {
      return { success: false, error: `Error fetching playlists: ${error.message}` }
    }
    return { success: false, error: "Failed to fetch Plex playlists" }
  }
}

/**
 * Get items in a specific playlist
 * @param serverConfig - Plex server configuration
 * @param playlistKey - The ratingKey of the playlist
 */
export async function getPlexPlaylistItems(
  serverConfig: { url: string; token: string },
  playlistKey: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const url = `${serverConfig.url}/playlists/${playlistKey}/items?X-Plex-Token=${serverConfig.token}`

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    })

    if (!response.ok) {
      return { success: false, error: `Failed to fetch playlist items: ${response.statusText}` }
    }

    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (isTimeoutError(error)) {
      return { success: false, error: "Connection timeout" }
    }
    if (error instanceof Error) {
      return { success: false, error: `Error fetching playlist items: ${error.message}` }
    }
    return { success: false, error: "Failed to fetch Plex playlist items" }
  }
}
