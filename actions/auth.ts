"use server"

import { prisma } from "@/lib/prisma"
import { checkUserServerAccess, getPlexUserInfo } from "@/lib/connections/plex"

/**
 * Check if a user has access to the configured Plex server
 */
export async function checkServerAccess(userToken: string): Promise<{
  success: boolean
  hasAccess: boolean
  error?: string
}> {
  try {
    const plexServer = await prisma.plexServer.findFirst({
      where: { isActive: true },
    })

    if (!plexServer) {
      return {
        success: false,
        hasAccess: false,
        error: "No Plex server configured",
      }
    }

    // Fetch user info to get the Plex user ID
    const userInfoResult = await getPlexUserInfo(userToken)
    const plexUser = userInfoResult.success && userInfoResult.data ? userInfoResult.data : null

    if (!plexUser) {
      return {
        success: false,
        hasAccess: false,
        error: "Failed to fetch user information",
      }
    }

    // Check if user has access to the configured Plex server
    // Use the server's admin token to check if the user exists in the server's user list
    const accessCheck = await checkUserServerAccess(
      {
        hostname: plexServer.hostname,
        port: plexServer.port,
        protocol: plexServer.protocol,
        token: plexServer.token,
      },
      plexUser.id
    )

    // Log if access is denied
    if (!accessCheck.hasAccess) {
      console.log("[AUTH ACTION] - Plex user denied access:", {
        plexUserId: plexUser?.id || "unknown",
        username: plexUser?.username || "unknown",
        email: plexUser?.email || "unknown",
        serverHostname: plexServer.hostname,
        reason: accessCheck.error || "No access to server",
      })
    }

    return accessCheck
  } catch (error) {
    console.error("[AUTH ACTION] - Error checking server access:", error)
    return {
      success: false,
      hasAccess: false,
      error: error instanceof Error ? error.message : "Failed to check server access",
    }
  }
}

