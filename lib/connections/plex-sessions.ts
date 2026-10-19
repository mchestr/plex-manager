/**
 * Plex session and library management functions
 */

import { z } from "zod"

import { serviceErrorMessage, serviceFetch } from "@/lib/connections/http"

type PlexServerConfig = { url: string; token: string }
type PlexResult = { success: boolean; data?: any; error?: string }

/**
 * Shared GET helper for Plex server endpoints: sends the token in the
 * `X-Plex-Token` header, asks for JSON, and goes through `serviceFetch`, so
 * errors never carry the token or the URL.
 *
 * @param serverConfig - Plex server URL + token.
 * @param path - Path beginning with `/`, query string already appended.
 * @internal
 */
async function plexGet(serverConfig: PlexServerConfig, path: string): Promise<PlexResult> {
  const result = await serviceFetch({
    service: "Plex",
    url: `${serverConfig.url}${path}`,
    headers: { "X-Plex-Token": serverConfig.token },
    schema: z.unknown(),
  })
  return result.ok ? { success: true, data: result.data } : { success: false, error: serviceErrorMessage("Plex", result) }
}

/**
 * Fetches current sessions from Plex server
 * Uses the Plex server API /status/sessions endpoint
 */
export async function getPlexSessions(serverConfig: PlexServerConfig): Promise<PlexResult> {
  return plexGet(serverConfig, "/status/sessions")
}

/**
 * Get library sections from Plex server
 */
export async function getPlexLibrarySections(serverConfig: PlexServerConfig): Promise<PlexResult> {
  return plexGet(serverConfig, "/library/sections")
}

/**
 * Get recently added content from Plex server
 */
export async function getPlexRecentlyAdded(serverConfig: PlexServerConfig, limit = 20): Promise<PlexResult> {
  return plexGet(serverConfig, `/library/recentlyAdded?limit=${limit}`)
}

/**
 * Get on deck content from Plex server
 */
export async function getPlexOnDeck(serverConfig: PlexServerConfig): Promise<PlexResult> {
  return plexGet(serverConfig, "/library/onDeck")
}
