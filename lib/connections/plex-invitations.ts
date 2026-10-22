/**
 * Plex invitation and sharing functions
 */

import { z } from "zod"

import { serviceFetch } from "@/lib/connections/http"

import {
  logger,
  sanitizeUrlForLogging,
  getClientIdentifier,
  type InviteSettings,
} from "./plex-core"
import { resolveMachineIdentifier } from "./plex-connection"
import { getPlexUsers } from "./plex-user-info"

/**
 * Invite a user to the Plex server
 * Based on the Plex API v2 shared_servers endpoint
 * Returns the invite ID if successful
 */
export async function inviteUserToPlexServer(
  serverConfig: { url: string; token: string; machineIdentifier?: string | null },
  email: string,
  inviteSettings?: InviteSettings
): Promise<{ success: boolean; inviteID?: number; error?: string }> {
  try {
    // 1. The server's machine identifier: stored, or from the PMS
    const identityResult = await resolveMachineIdentifier(serverConfig)
    if (!identityResult.success || !identityResult.machineIdentifier) {
      return { success: false, error: identityResult.error || "Failed to get server machine identifier" }
    }

    const machineIdentifier = identityResult.machineIdentifier

    // 2. Get library section IDs from Plex.tv API (required format for sharing)
    let clientIdentifier: string
    try {
      clientIdentifier = getClientIdentifier()
    } catch (error) {
      return { success: false, error: "PLEX_CLIENT_IDENTIFIER is not configured" }
    }

    const plexTvUrl = `https://plex.tv/api/v2/servers/${machineIdentifier}`
    const plexTvResponse = await fetch(plexTvUrl, {
      headers: {
        "Accept": "application/json",
        "X-Plex-Token": serverConfig.token,
        "X-Plex-Client-Identifier": clientIdentifier,
      },
    })

    if (!plexTvResponse.ok) {
      return { success: false, error: `Failed to fetch library sections from Plex.tv API: ${plexTvResponse.statusText}` }
    }

    const plexTvData = await plexTvResponse.json()
    const plexTvSections = plexTvData.librarySections || plexTvData.LibrarySections || []

    // Extract all Plex.tv section IDs (these are what we need to send)
    const allPlexTvIds = plexTvSections
      .map((section: { id?: number; ID?: number }) => section.id ?? section.ID)
      .filter((id: number | undefined): id is number => id !== undefined && !isNaN(id))

    if (allPlexTvIds.length === 0) {
      return { success: false, error: "No libraries found on the server" }
    }

    let librarySectionIds: number[]

    if (inviteSettings?.librarySectionIds && inviteSettings.librarySectionIds.length > 0) {
      // Find Plex.tv sections that match the requested local server keys
      // Plex.tv sections have both 'key' (local server key) and 'id' (Plex.tv API ID)
      const requestedPlexTvIds = inviteSettings.librarySectionIds
        .map((localKey) => {
          const section = plexTvSections.find(
            (s: { key?: number; Key?: number }) => (s.key ?? s.Key) === localKey
          )
          return section ? (section.id ?? section.ID) : undefined
        })
        .filter((id): id is number => id !== undefined)

      const invalidIds = inviteSettings.librarySectionIds.filter((localKey) => {
        return !plexTvSections.some(
          (s: { key?: number; Key?: number }) => (s.key ?? s.Key) === localKey
        )
      })

      // Stale IDs (e.g. a configured library was deleted/recreated) must not
      // hard-fail the whole invite: background grant jobs retry on failure, so
      // one stale ID would block every new grant until an admin fixes the
      // config. Share the libraries that still exist and warn about the rest.
      // Never fall back to sharing everything — that would over-grant access.
      if (requestedPlexTvIds.length === 0) {
        return {
          success: false,
          error: `None of the configured library section IDs exist on this server: ${invalidIds.join(", ")}. The libraries may have been deleted; update the configured library selection.`,
        }
      }

      if (invalidIds.length > 0) {
        logger.warn("Some configured library section IDs no longer exist on the server; sharing the remaining libraries", {
          invalidIds,
          sharedCount: requestedPlexTvIds.length,
        })
      }

      librarySectionIds = requestedPlexTvIds
    } else {
      librarySectionIds = allPlexTvIds
    }

    if (librarySectionIds.length === 0) {
      return { success: false, error: "No libraries found on the server" }
    }

    // 3. Invite the user via Plex.tv API v2
    // Using the correct endpoint: https://clients.plex.tv/api/v2/shared_servers
    const url = "https://clients.plex.tv/api/v2/shared_servers"

    const payload = {
      invitedEmail: email,
      machineIdentifier: machineIdentifier,
      librarySectionIds: librarySectionIds,
      skipFriendship: true,
      settings: {
        allowSync: inviteSettings?.allowDownloads ?? false,
        allowChannels: false,
        allowSubtitleAdmin: false,
        allowTuners: 0,
        filterMovies: "",
        filterMusic: "",
        filterPhotos: "",
        filterTelevision: "",
      },
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Plex-Token": serverConfig.token,
        "X-Plex-Client-Identifier": clientIdentifier,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const text = await response.text()

      // Try to parse structured error if available
      try {
        const errorData = JSON.parse(text)
        if (errorData.errors && Array.isArray(errorData.errors) && errorData.errors.length > 0) {
          return { success: false, error: errorData.errors[0].message || `Failed to invite user: ${response.statusText}` }
        }
      } catch {
        // If JSON parsing fails, use the text as-is
      }

      return { success: false, error: `Failed to invite user: ${response.statusText}` }
    }

    // Parse the response to get the invite ID
    try {
      const responseData = await response.json()

      // The response might have the ID in different places depending on Plex API version
      // Try common field names: id, inviteID, sharedServerID, serverID
      const inviteID =
        responseData.id ||
        responseData.inviteID ||
        responseData.sharedServerID ||
        responseData.serverID ||
        responseData.data?.id ||
        responseData.invite?.id

      if (inviteID) {
        const parsedID = Number(inviteID)
        if (!isNaN(parsedID)) {
          return { success: true, inviteID: parsedID }
        }
      }

      // If no ID in response, still return success (invite was sent)
      // The user will need to accept manually or we'll need to query for pending invites
      return { success: true }
    } catch (parseError) {
      // If we can't parse the response, still consider it successful if status was OK
      return { success: true }
    }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Error inviting user: ${error.message}` }
    }
    return { success: false, error: "Failed to invite user to Plex server" }
  }
}

/**
 * Accept a pending invite using the invite ID
 * Based on the Plex API v2 shared_servers endpoint
 */
export async function acceptPlexInvite(
  userToken: string,
  inviteID: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get client identifier
    let clientIdentifier: string
    try {
      clientIdentifier = getClientIdentifier()
    } catch (error) {
      return { success: false, error: "PLEX_CLIENT_IDENTIFIER is not configured" }
    }

    // Accept the invite using the invite ID
    // POST https://plex.tv/api/v2/shared_servers/{inviteID}/accept
    const acceptUrl = `https://plex.tv/api/v2/shared_servers/${inviteID}/accept`

    const acceptResponse = await fetch(acceptUrl, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "X-Plex-Token": userToken,
        "X-Plex-Client-Identifier": clientIdentifier,
      },
    })

    if (!acceptResponse.ok) {
      const text = await acceptResponse.text()

      // Try to parse structured error if available
      try {
        const errorData = JSON.parse(text)
        if (errorData.errors && Array.isArray(errorData.errors) && errorData.errors.length > 0) {
          return { success: false, error: errorData.errors[0].message || "Failed to accept invite" }
        }
      } catch {
        // If JSON parsing fails, use the text as-is
      }

      return { success: false, error: `Failed to accept invite: ${acceptResponse.statusText}` }
    }

    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Error accepting invite: ${error.message}` }
    }
    return { success: false, error: "Failed to accept Plex invite" }
  }
}


/** Why an unshare could not be confirmed. */
export type PlexUnshareErrorCode = "PLEX_AUTH" | "PLEX_UNAVAILABLE"

/**
 * The outcome of {@link unshareUserFromPlexServer}. `already_removed` is a
 * success, so retries and reruns settle.
 */
export type PlexUnshareResult =
  | { success: true; status: "removed" | "already_removed" }
  | { success: false; code: PlexUnshareErrorCode }

/** plex.tv's friend-server route (python-plexapi's `FRIENDSERVERS`). */
const SHARED_SERVER_URL = "https://plex.tv/api/servers"
const UNSHARE_TIMEOUT_MS = 10_000

function authOrUnavailable(status: number | undefined): PlexUnshareErrorCode {
  return status === 401 || status === 403 ? "PLEX_AUTH" : "PLEX_UNAVAILABLE"
}

/**
 * Removes a user's share of this Plex server, and only that (GAP-04).
 *
 * ## Process
 *
 * 1. This server's machine identifier: the stored one, or its `/identity`.
 * 2. Read the owner's plex.tv user list and find the user's `<Server>` entry
 *    for that machine identifier. No user, or no entry (managed home users
 *    have none), is `already_removed` without a DELETE.
 * 3. `DELETE https://plex.tv/api/servers/{machineIdentifier}/shared_servers/{shareId}`.
 *    The plex.tv friendship and the owner's other servers are left alone.
 *
 * ## Result mapping
 *
 * 200 or 204 is `removed`; 404 is `already_removed` (plex.tv's status for a
 * share that is already gone is unconfirmed, so a 404 and a missing entry both
 * count as success); 401 or 403 is `PLEX_AUTH`; anything else, including a
 * timeout or network error, is `PLEX_UNAVAILABLE`. No Plex response text is
 * returned or logged.
 */
export async function unshareUserFromPlexServer(
  serverConfig: { url: string; token: string; machineIdentifier?: string | null },
  plexUserId: string
): Promise<PlexUnshareResult> {
  const identity = await resolveMachineIdentifier(serverConfig)
  if (!identity.success || !identity.machineIdentifier) {
    logger.warn("plex.unshare_failed", { plexUserId, step: "identity", url: sanitizeUrlForLogging(serverConfig.url) })
    return { success: false, code: "PLEX_UNAVAILABLE" }
  }
  const machineIdentifier = identity.machineIdentifier

  const users = await getPlexUsers(serverConfig.token)
  if (!users.success || !users.data) {
    const code = authOrUnavailable(users.status)
    logger.warn("plex.unshare_failed", { plexUserId, step: "users", code, status: users.status })
    return { success: false, code }
  }

  const user = users.data.find((candidate) => candidate.id === plexUserId)
  const share = user?.servers.find((server) => server.machineIdentifier === machineIdentifier)
  if (!share?.shareId) {
    logger.info("plex.unshare_already_removed", {
      plexUserId,
      reason: user ? "no_share_for_this_server" : "not_in_user_list",
    })
    return { success: true, status: "already_removed" }
  }

  const result = await serviceFetch({
    service: "Plex",
    url: `${SHARED_SERVER_URL}/${encodeURIComponent(machineIdentifier)}/shared_servers/${encodeURIComponent(share.shareId)}`,
    method: "DELETE",
    headers: {
      "X-Plex-Token": serverConfig.token,
      "X-Plex-Client-Identifier": getClientIdentifier(),
    },
    responseType: "text",
    schema: z.string(),
    timeoutMs: UNSHARE_TIMEOUT_MS,
  })

  if (result.ok) {
    logger.info("plex.unshare_removed", { plexUserId })
    return { success: true, status: "removed" }
  }
  if (result.code === "HTTP" && result.status === 404) {
    logger.info("plex.unshare_already_removed", { plexUserId, reason: "not_found" })
    return { success: true, status: "already_removed" }
  }
  const code = result.code === "HTTP" ? authOrUnavailable(result.status) : "PLEX_UNAVAILABLE"
  logger.warn("plex.unshare_failed", { plexUserId, step: "delete", code, status: result.status })
  return { success: false, code }
}
