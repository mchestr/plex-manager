/**
 * Plex invitation and sharing functions
 */

import {
  logger,
  sanitizeUrlForLogging,
  getClientIdentifier,
  type InviteSettings,
} from "./plex-core"
import { getPlexServerIdentity } from "./plex-connection"

/**
 * Invite a user to the Plex server
 * Based on the Plex API v2 shared_servers endpoint
 * Returns the invite ID if successful
 */
export async function inviteUserToPlexServer(
  serverConfig: { url: string; token: string },
  email: string,
  inviteSettings?: InviteSettings
): Promise<{ success: boolean; inviteID?: number; error?: string }> {
  try {
    // 1. Get the server's machine identifier
    const identityResult = await getPlexServerIdentity(serverConfig)
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

      if (invalidIds.length > 0) {
        return {
          success: false,
          error: `Invalid library section IDs: ${invalidIds.join(", ")}. These libraries may have been deleted or don't exist on this server.`,
        }
      }

      if (requestedPlexTvIds.length === 0) {
        return {
          success: false,
          error: "Failed to find matching Plex.tv library section IDs for the specified libraries.",
        }
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

/**
 * Unshare library access for a user from the Plex server
 * Removes the user's access to the shared server
 * Uses the Plex API v2 sharings endpoint
 */
export async function unshareUserFromPlexServer(
  serverConfig: { url: string; token: string },
  plexUserId: string
): Promise<{ success: boolean; error?: string }> {
  const unshareStartTime = Date.now()
  logger.debug("Unsharing user from Plex server", { plexUserId, url: sanitizeUrlForLogging(serverConfig.url) })

  try {
    // 1. Get client identifier
    let clientIdentifier: string
    try {
      clientIdentifier = getClientIdentifier()
    } catch (error) {
      return { success: false, error: "PLEX_CLIENT_IDENTIFIER is not configured" }
    }

    // 2. The sharing ID is the Plex user ID - use it directly
    const sharingId = plexUserId
    logger.debug("Using Plex user ID as sharing ID", { sharingId })

    // 3. Delete the sharing using the /api/v2/sharings/{sharingId} endpoint
    // The sharing ID is the Plex user ID
    const deleteUrl = `https://plex.tv/api/v2/sharings/${sharingId}`
    logger.debug("Deleting sharing", { sharingId, deleteUrl: sanitizeUrlForLogging(deleteUrl) })

    const deleteResponse = await fetch(deleteUrl, {
      method: "DELETE",
      headers: {
        "Accept": "application/json",
        "X-Plex-Token": serverConfig.token,
        "X-Plex-Client-Identifier": clientIdentifier,
      },
    })

    if (deleteResponse.status !== 200 && deleteResponse.status !== 204) {
      const errorText = await deleteResponse.text()
      logger.error("Failed to delete sharing", undefined, {
        status: deleteResponse.status,
        statusText: deleteResponse.statusText,
        errorPreview: errorText.substring(0, 100),
        sharingId,
      })

      // Try to parse structured error if available
      try {
        const errorData = JSON.parse(errorText)
        if (errorData.errors && Array.isArray(errorData.errors) && errorData.errors.length > 0) {
          return { success: false, error: errorData.errors[0].message || `Unshare API returned error status: ${deleteResponse.status} ${deleteResponse.statusText}` }
        }
      } catch {
        // If JSON parsing fails, use the text as-is
      }

      return { success: false, error: `Unshare API returned error status: ${deleteResponse.status} ${deleteResponse.statusText}` }
    }

    const duration = Date.now() - unshareStartTime
    logger.info("Successfully unshared user from server", { duration, plexUserId, sharingId })
    return { success: true }
  } catch (error) {
    const duration = Date.now() - unshareStartTime
    logger.error("Error unsharing user from server", error, { duration, plexUserId })
    if (error instanceof Error) {
      return { success: false, error: `Error unsharing user: ${error.message}` }
    }
    return { success: false, error: "Failed to unshare user from Plex server" }
  }
}
