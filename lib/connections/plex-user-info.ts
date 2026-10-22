/**
 * Plex user information fetching functions
 *
 * Functions for fetching user data from Plex.tv API
 */

import { isConnectionTestBypassed } from "@/lib/connections/connection-test"
import { fetchWithTimeout, isTimeoutError } from "@/lib/utils/fetch-with-timeout"

import { resolveMachineIdentifier } from "./plex-connection"
import { logger, type PlexServerUser, type PlexUser, type PlexUserInfo } from "./plex-core"
import { fetchPlexTvUsers } from "./plex-tv-users"

/**
 * Fetches Plex user information from a Plex token
 * Uses the Plex.tv API to get account information
 */
export async function getPlexUserInfo(token: string): Promise<{ success: boolean; data?: PlexUserInfo; error?: string }> {
  // TEST MODE BYPASS - see isConnectionTestBypassed
  if (isConnectionTestBypassed()) {
    return {
      success: true,
      data: {
        id: 'test-plex-user-id',
        username: 'testuser',
        email: 'test@example.com',
      },
    }
  }

  try {
    const url = `https://plex.tv/api/v2/user`

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-Plex-Token": token,
      },
    })

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: "Invalid Plex token" }
      }
      return { success: false, error: `Failed to fetch user info: ${response.statusText}` }
    }

    const data = await response.json()

    // Plex API v2 returns user data in a specific format
    // Handle both possible response structures
    const extractedId = data.id?.toString() || data.uuid?.toString() || data.user?.id?.toString()
    const extractedUsername = data.username || data.user?.username
    const extractedEmail = data.email || data.user?.email
    const extractedThumb = data.thumb || data.user?.thumb

    const userInfo: PlexUserInfo = {
      id: extractedId,
      username: extractedUsername,
      email: extractedEmail,
      thumb: extractedThumb,
    }

    // Validate required fields
    if (!userInfo.id || !userInfo.username) {
      return { success: false, error: "Invalid user data received from Plex API" }
    }

    return { success: true, data: userInfo }
  } catch (error) {
    if (isTimeoutError(error)) {
      return { success: false, error: "Connection timeout" }
    }
    if (error instanceof Error) {
      return { success: false, error: `Error fetching user info: ${error.message}` }
    }
    return { success: false, error: "Failed to fetch Plex user information" }
  }
}

/**
 * Every user in the owner's plex.tv `/api/users` list, with their shares
 * (machine identifier, share id, owned, pending). A 401 is an invalid token;
 * every other failure is Plex being unavailable (`status` and
 * `retryAfterSec` say which), never an empty list.
 */
export async function getPlexUsers(
  token: string
): Promise<{ success: boolean; data?: PlexUser[]; error?: string; status?: number; retryAfterSec?: number }> {
  const result = await fetchPlexTvUsers(token)
  if (result.ok) return { success: true, data: result.users }
  if (result.kind === "invalid_token") return { success: false, error: "Unauthorized - invalid token", status: 401 }
  return {
    success: false,
    error: "Plex is temporarily unavailable",
    ...(result.status !== undefined ? { status: result.status } : {}),
    ...(result.retryAfterSec !== undefined ? { retryAfterSec: result.retryAfterSec } : {}),
  }
}

/**
 * This server's users (GAP-06): everyone with a share of this machine
 * identifier, pending invites labelled `pending: true`, plus the owner's
 * managed Home users (`managed: true`, no email), who reach the server
 * through Home rather than a share. Friends who share only another server
 * are left out.
 */
export async function getAllPlexServerUsers(
  serverConfig: { url: string; token: string; machineIdentifier?: string | null }
): Promise<{ success: boolean; data?: PlexServerUser[]; error?: string }> {
  const identity = await resolveMachineIdentifier(serverConfig)
  if (!identity.success || !identity.machineIdentifier) {
    return { success: false, error: identity.error ?? "Failed to get server machine identifier" }
  }
  const machineIdentifier = identity.machineIdentifier

  const result = await fetchPlexTvUsers(serverConfig.token)
  if (!result.ok) {
    return {
      success: false,
      error: result.kind === "invalid_token" ? "Unauthorized - invalid server token" : "Plex is temporarily unavailable",
    }
  }

  const users: PlexServerUser[] = []
  for (const user of result.users) {
    const share = user.servers.find((server) => server.machineIdentifier === machineIdentifier)
    const managed = user.home && user.restricted && !user.email
    if (!share && !managed) continue
    users.push({
      id: user.id,
      name: user.username,
      ...(user.email ? { email: user.email } : {}),
      ...(user.thumb ? { thumb: user.thumb } : {}),
      restricted: user.restricted,
      managed,
      pending: Boolean(share?.pending) && !managed,
    })
  }

  logger.info("getAllPlexServerUsers completed", { total: result.users.length, onThisServer: users.length })
  return { success: true, data: users }
}
