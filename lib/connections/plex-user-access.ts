/**
 * Plex user access checking functions
 *
 * Functions for checking if users have access to Plex servers
 */

import {
  logger,
  sanitizeUrlForLogging,
  type PlexUser,
} from "./plex-core"
import { getPlexServerIdentity } from "./plex-connection"
import { getPlexUsers } from "./plex-user-info"

/**
 * Checks if a user has access to a server based on their servers list
 */
function checkUserHasAccess(
  users: ReadonlyMap<string, PlexUser>,
  userId: string,
  machineIdentifier: string,
  adminUserId?: string | null
): boolean {
  // Check if user is admin
  if (adminUserId && userId === adminUserId) {
    return true
  }

  // Check if user exists in the map
  const user = users.get(userId)
  if (!user) {
    return false
  }

  // Check if user has access to the server by machine identifier
  const hasAccess = user.servers.some((server) => server.machineIdentifier === machineIdentifier)

  if (!hasAccess) {
    logger.debug("User found but doesn't have access to server", {
      userId,
      username: user.username,
      machineIdentifier,
    })
  }

  return hasAccess
}

/**
 * Checks if a user has access to a configured Plex server
 * Uses the Plex.tv API to get users and check if the user has access to the server
 */
export async function checkUserServerAccess(
  serverConfig: { url: string; token: string; adminPlexUserId?: string | null },
  plexUserId: string
): Promise<{ success: boolean; hasAccess: boolean; error?: string }> {
  const checkStartTime = Date.now()
  logger.debug("Checking user server access", { plexUserId, url: sanitizeUrlForLogging(serverConfig.url) })

  try {
    // Normalize IDs for comparison (convert to string and trim)
    const normalizedPlexUserId = String(plexUserId).trim()
    logger.debug("Normalized Plex user ID", { normalizedPlexUserId })

    // Check if user is admin (optimization: skip API calls)
    if (serverConfig.adminPlexUserId && normalizedPlexUserId === String(serverConfig.adminPlexUserId).trim()) {
      logger.info("User is admin, granting access", { plexUserId: normalizedPlexUserId })
      return { success: true, hasAccess: true }
    }

    // Get the server's machine identifier
    logger.debug("Fetching server machine identifier")
    const identityResult = await getPlexServerIdentity({
      url: serverConfig.url,
      token: serverConfig.token,
    })

    if (!identityResult.success || !identityResult.machineIdentifier) {
      const duration = Date.now() - checkStartTime
      logger.warn("Failed to get server machine identifier", { error: identityResult.error, duration })
      return {
        success: false,
        hasAccess: false,
        error: identityResult.error ?? "Failed to get server machine identifier",
      }
    }

    const machineIdentifier = identityResult.machineIdentifier
    logger.debug("Got machine identifier", { machineIdentifier })

    // Get all users from Plex.tv API
    logger.debug("Fetching all users from Plex.tv API")
    const usersFetchStart = Date.now()
    const usersResult = await getPlexUsers(serverConfig.token)
    const usersFetchDuration = Date.now() - usersFetchStart
    logger.debug("Fetched users", { duration: usersFetchDuration, success: usersResult.success, count: usersResult.data?.length })

    if (!usersResult.success) {
      const duration = Date.now() - checkStartTime
      logger.warn("Failed to fetch users", { error: usersResult.error, duration })
      return { success: false, hasAccess: false, error: usersResult.error ?? "Failed to fetch users" }
    }

    if (!usersResult.data) {
      const duration = Date.now() - checkStartTime
      logger.warn("No user data returned", { duration })
      return { success: false, hasAccess: false, error: "No user data returned" }
    }

    logger.debug("Found users", { count: usersResult.data.length })

    // Create a map of users by ID for efficient lookup
    const userMap = new Map<string, PlexUser>()
    for (const user of usersResult.data) {
      userMap.set(user.id, user)
    }

    // Check if user has access
    const hasAccess = checkUserHasAccess(userMap, normalizedPlexUserId, machineIdentifier, serverConfig.adminPlexUserId)

    const duration = Date.now() - checkStartTime
    if (hasAccess) {
      logger.info("User has access", { duration })
      return { success: true, hasAccess: true }
    }

    logger.info("User does not have access", { duration })
    return { success: true, hasAccess: false, error: "User does not have access to this server" }
  } catch (error) {
    const duration = Date.now() - checkStartTime
    logger.error("Error checking server access", error, { duration })
    if (error instanceof Error) {
      return { success: false, hasAccess: false, error: `Error checking server access: ${error.message}` }
    }
    return { success: false, hasAccess: false, error: "Failed to check server access" }
  }
}
