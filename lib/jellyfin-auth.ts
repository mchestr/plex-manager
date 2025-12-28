/**
 * Jellyfin authentication helpers for NextAuth integration
 */

"use server"

import { authenticateJellyfinUser, getJellyfinUserById } from "@/lib/connections/jellyfin-users"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("JELLYFIN_AUTH")

interface JellyfinConfig {
  url: string
  apiKey: string
}

interface JellyfinAuthResult {
  success: boolean
  data?: {
    id: string
    username: string
    accessToken: string
  }
  error?: string
}

/**
 * Authenticate a Jellyfin user with username and password
 *
 * @param jellyfinConfig - Server configuration (URL and API key)
 * @param username - Jellyfin username
 * @param password - User's password
 * @returns Authentication result with user info or error
 */
export async function authenticateJellyfin(
  jellyfinConfig: JellyfinConfig,
  username: string,
  password: string
): Promise<JellyfinAuthResult> {
  logger.debug("Authenticating Jellyfin user", { username })

  try {
    const authResult = await authenticateJellyfinUser(
      jellyfinConfig,
      username,
      password
    )

    if (!authResult.success || !authResult.data) {
      logger.warn("Jellyfin authentication failed", {
        username,
        error: authResult.error,
      })
      return {
        success: false,
        error: authResult.error || "Authentication failed",
      }
    }

    const { User, AccessToken } = authResult.data

    logger.info("Jellyfin user authenticated successfully", {
      userId: User.Id,
      username: User.Name,
    })

    return {
      success: true,
      data: {
        id: User.Id,
        username: User.Name,
        accessToken: AccessToken,
      },
    }
  } catch (error) {
    logger.error("Error during Jellyfin authentication", error, { username })
    return {
      success: false,
      error: "An unexpected error occurred during authentication",
    }
  }
}

/**
 * Verify if a Jellyfin user has admin privileges
 *
 * @param jellyfinConfig - Server configuration
 * @param userId - Jellyfin user ID
 * @param serverAdminUserId - The admin user ID configured for this server
 * @returns True if user is admin
 */
export async function isJellyfinAdmin(
  jellyfinConfig: JellyfinConfig,
  userId: string,
  serverAdminUserId?: string | null
): Promise<boolean> {
  // First check: Does the user ID match the server's admin user ID?
  if (serverAdminUserId && userId === serverAdminUserId) {
    logger.debug("User is admin (matches server admin ID)", { userId })
    return true
  }

  try {
    // Second check: Fetch user details and check Policy.IsAdministrator
    const userResult = await getJellyfinUserById(jellyfinConfig, userId)

    if (!userResult.success || !userResult.data) {
      logger.warn("Failed to fetch Jellyfin user for admin check", {
        userId,
        error: userResult.error,
      })
      return false
    }

    const isAdmin = userResult.data.Policy?.IsAdministrator || false
    logger.debug("User admin status determined from policy", {
      userId,
      isAdmin,
    })

    return isAdmin
  } catch (error) {
    logger.error("Error checking Jellyfin admin status", error, { userId })
    return false
  }
}
