/**
 * Plex session and library management functions
 */

import { fetchWithTimeout, isTimeoutError } from "@/lib/utils/fetch-with-timeout"

type PlexServerConfig = { url: string; token: string }
type PlexResult = { success: boolean; data?: any; error?: string }

/**
 * Shared GET helper for Plex server endpoints. Appends the X-Plex-Token,
 * requests JSON, and normalizes the ok/timeout/error handling that every
 * read function below previously duplicated.
 *
 * @param serverConfig - Plex server URL + token.
 * @param path - Path beginning with `/`; query string (other than the token) already appended.
 * @param noun - Lowercased noun used in messages, e.g. "sessions" → "Failed to fetch sessions".
 * @param opts.timeoutMs - Optional request timeout override.
 * @param opts.timeoutError - Optional override for the timeout message.
 * @internal
 */
async function plexGet(
  serverConfig: PlexServerConfig,
  path: string,
  noun: string,
  opts: { timeoutMs?: number; timeoutError?: string } = {}
): Promise<PlexResult> {
  const separator = path.includes("?") ? "&" : "?"
  const url = `${serverConfig.url}${path}${separator}X-Plex-Token=${serverConfig.token}`

  try {
    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: { "Accept": "application/json" },
      ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
    })

    if (!response.ok) {
      return { success: false, error: `Failed to fetch ${noun}: ${response.statusText}` }
    }

    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (isTimeoutError(error)) {
      return { success: false, error: opts.timeoutError ?? "Connection timeout" }
    }
    if (error instanceof Error) {
      return { success: false, error: `Error fetching ${noun}: ${error.message}` }
    }
    return { success: false, error: `Failed to fetch Plex ${noun}` }
  }
}

/**
 * Fetches current sessions from Plex server
 * Uses the Plex server API /status/sessions endpoint
 */
export async function getPlexSessions(serverConfig: PlexServerConfig): Promise<PlexResult> {
  return plexGet(serverConfig, "/status/sessions", "sessions")
}

/**
 * Get library sections from Plex server
 */
export async function getPlexLibrarySections(serverConfig: PlexServerConfig): Promise<PlexResult> {
  return plexGet(serverConfig, "/library/sections", "library sections")
}

/**
 * Get recently added content from Plex server
 */
export async function getPlexRecentlyAdded(serverConfig: PlexServerConfig, limit = 20): Promise<PlexResult> {
  return plexGet(serverConfig, `/library/recentlyAdded?limit=${limit}`, "recently added")
}

/**
 * Get all items from a specific library section
 * @param serverConfig - Plex server configuration
 * @param sectionId - Library section ID
 * @param type - Filter by type (1=movie, 2=show, 4=episode)
 */
export async function getPlexLibraryItems(
  serverConfig: PlexServerConfig,
  sectionId: string | number,
  type?: number
): Promise<PlexResult> {
  const path = type
    ? `/library/sections/${sectionId}/all?type=${type}`
    : `/library/sections/${sectionId}/all`
  return plexGet(serverConfig, path, "library items", {
    timeoutMs: 60000, // Allow longer timeout for large libraries
    timeoutError: "Connection timeout - library may be too large",
  })
}

/**
 * Get on deck content from Plex server
 */
export async function getPlexOnDeck(serverConfig: PlexServerConfig): Promise<PlexResult> {
  return plexGet(serverConfig, "/library/onDeck", "on deck")
}

/**
 * Get all playlists from Plex server
 */
export async function getPlexPlaylists(serverConfig: PlexServerConfig): Promise<PlexResult> {
  return plexGet(serverConfig, "/playlists", "playlists")
}

/**
 * Get items in a specific playlist
 * @param serverConfig - Plex server configuration
 * @param playlistKey - The ratingKey of the playlist
 */
export async function getPlexPlaylistItems(
  serverConfig: PlexServerConfig,
  playlistKey: string
): Promise<PlexResult> {
  return plexGet(serverConfig, `/playlists/${playlistKey}/items`, "playlist items")
}
