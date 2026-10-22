/**
 * Jellyfin sign-in helpers for the NextAuth Jellyfin provider in lib/auth.ts.
 *
 * Server-only, and deliberately not Server Actions: the helpers read the
 * stored Jellyfin server themselves, so no caller can choose the URL or API
 * key a request goes to (SEC-35). A sign-in reads the server once and checks
 * the password and the admin status against that same row.
 */

import "server-only"

import { authenticateJellyfinUser, getJellyfinUserById } from "@/lib/connections/jellyfin-users"
import type { JellyfinServer } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { z } from "zod"

const logger = createLogger("JELLYFIN_AUTH")

/**
 * What a sign-in learned about the user's Jellyfin administrator flag.
 */
export type JellyfinAdminStatus = "admin" | "not-admin" | "unknown"

interface JellyfinAuthResult {
  success: boolean
  data?: {
    id: string
    username: string
    adminStatus: JellyfinAdminStatus
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
 * The active Jellyfin server, when "Allow Jellyfin sign-in" is on.
 *
 * Returns null when no server is active or sign-in is turned off, so the
 * toggle is checked in one place for every Jellyfin sign-in. The encryption
 * extension in lib/prisma.ts has already decrypted `apiKey`.
 *
 * @internal
 */
export async function getJellyfinLoginServer() {
  const server = await prisma.jellyfinServer.findFirst({
    where: { isActive: true },
  })

  if (!server) {
    logger.error("No active Jellyfin server configured")
    return null
  }

  if (!server.enabledForLogin) {
    logger.warn("jellyfin.login.disabled", { serverId: server.id })
    return null
  }

  return server
}

/**
 * Authenticate a Jellyfin user with username and password against the
 * stored sign-in server, and check whether they administer it.
 *
 * Refuses without contacting Jellyfin when no server is active or "Allow
 * Jellyfin sign-in" is off (`getJellyfinLoginServer`). Jellyfin returns an
 * access token, which `authenticateJellyfinUser` logs out straight away: the
 * app keeps only the Jellyfin user ID, uses the stored API key for every later
 * Jellyfin call, and relies on its own NextAuth session.
 *
 * @param username - Jellyfin username
 * @param password - User's password
 * @returns The Jellyfin user ID, name and admin status, or an error
 */
export async function authenticateJellyfin(
  username: string,
  password: string
): Promise<JellyfinAuthResult> {
  // Validate credentials
  const validation = JellyfinCredentialsSchema.safeParse({ username, password })
  if (!validation.success) {
    const errors = validation.error.issues.map(e => e.message).join(", ")
    logger.warn("Invalid Jellyfin credentials format", { errors })
    return {
      success: false,
      error: errors,
    }
  }

  const { username: validatedUsername, password: validatedPassword } = validation.data

  logger.debug("Authenticating Jellyfin user", { username: validatedUsername })

  try {
    const server = await getJellyfinLoginServer()
    if (!server) {
      return { success: false, error: "Jellyfin sign-in is not available" }
    }

    const authResult = await authenticateJellyfinUser(
      { url: server.url, apiKey: server.apiKey },
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

    const { User } = authResult.data
    const adminStatus = await isJellyfinAdmin(server, User.Id)

    logger.info("Jellyfin user authenticated successfully", {
      userId: User.Id,
      username: User.Name,
      adminStatus,
    })

    return {
      success: true,
      data: {
        id: User.Id,
        username: User.Name,
        adminStatus,
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
 * Whether a Jellyfin user administers `server`, the row the password was
 * just checked against, from their Jellyfin policy's IsAdministrator.
 *
 * `'unknown'` when the lookup fails (a timeout, a 5xx) or the policy carries
 * no flag: the sign-in then keeps the role it already stores (GAP-26), and
 * `setMemberJellyfinAccess` refuses as for an administrator (P11.10).
 *
 * @param server - The sign-in server from `getJellyfinLoginServer`, or the active row
 * @param jellyfinUserId - Jellyfin user ID
 */
export async function isJellyfinAdmin(
  server: Pick<JellyfinServer, "url" | "apiKey">,
  jellyfinUserId: string
): Promise<JellyfinAdminStatus> {
  let userResult: Awaited<ReturnType<typeof getJellyfinUserById>>
  try {
    userResult = await getJellyfinUserById({ url: server.url, apiKey: server.apiKey }, jellyfinUserId)
  } catch (error) {
    logger.error("Error checking Jellyfin admin status", error, { userId: jellyfinUserId })
    return "unknown"
  }

  if (!userResult.success || !userResult.data) {
    logger.warn("Failed to fetch Jellyfin user for admin check", {
      userId: jellyfinUserId,
      error: userResult.error,
    })
    return "unknown"
  }

  const flag = userResult.data.Policy?.IsAdministrator
  if (typeof flag !== "boolean") {
    return "unknown"
  }
  return flag ? "admin" : "not-admin"
}
