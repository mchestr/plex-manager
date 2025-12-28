/**
 * Jellyfin authentication helpers for NextAuth integration
 */

"use server"

import { authenticateJellyfinUser, getJellyfinUserById } from "@/lib/connections/jellyfin-users"
import { createLogger } from "@/lib/utils/logger"
import { z } from "zod"

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
 * Zod schema for Jellyfin credentials
 * Validates username and password inputs before authentication
 */
const JellyfinCredentialsSchema = z.object({
  username: z
    .string()
    .min(1, "Username is required")
    .max(100, "Username is too long")
    .trim(),
  password: z
    .string()
    .min(1, "Password is required")
    .max(1000, "Password is too long"),
})

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
  // Validate credentials
  const validation = JellyfinCredentialsSchema.safeParse({ username, password })
  if (!validation.success) {
    const errors = validation.error.errors.map(e => e.message).join(", ")
    logger.warn("Invalid Jellyfin credentials format", { errors })
    return {
      success: false,
      error: errors,
    }
  }

  const { username: validatedUsername, password: validatedPassword } = validation.data

  logger.debug("Authenticating Jellyfin user", { username: validatedUsername })

  try {
    const authResult = await authenticateJellyfinUser(
      jellyfinConfig,
      validatedUsername,
      validatedPassword
    )

    if (!authResult.success || !authResult.data) {
      logger.warn("Jellyfin authentication failed", {
        username: validatedUsername,
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
    logger.error("Error during Jellyfin authentication", error, { username: validatedUsername })
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
