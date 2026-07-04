import { getAllPlexServerUsers } from "@/lib/connections/plex"
import { prisma } from "@/lib/prisma"
import { requireAdminAPI } from "@/lib/security/api-helpers"
import { createSafeError, ErrorCode, getStatusCode, logError } from "@/lib/security/error-handler"
import { adminRateLimiter } from "@/lib/security/rate-limit"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResponse = await adminRateLimiter(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    // Require admin authentication
    const authResult = await requireAdminAPI(request)
    if (authResult.response) {
      return authResult.response
    }

    // Get active Plex server configuration
    const plexServer = await prisma.plexServer.findFirst({
      where: { isActive: true },
    })

    if (!plexServer) {
      return NextResponse.json(
        createSafeError(ErrorCode.NOT_FOUND, "No active Plex server configured"),
        { status: getStatusCode(ErrorCode.NOT_FOUND) }
      )
    }

    // Fetch users from Plex server
    const usersResult = await getAllPlexServerUsers({
      url: plexServer.url,
      token: plexServer.token,
    })

    if (!usersResult.success) {
      return NextResponse.json(
        createSafeError(ErrorCode.INTERNAL_ERROR, usersResult.error || "Failed to fetch Plex users"),
        { status: getStatusCode(ErrorCode.INTERNAL_ERROR) }
      )
    }

    const users = usersResult.data || []

    // The Plex.tv /api/users endpoint only returns shared users, so the
    // server owner (the local admin) may be missing. Prepend them so the
    // playground can always test against the current admin account.
    const sessionUser = authResult.session?.user
    if (
      sessionUser?.name &&
      !users.some(
        (user) =>
          user.name === sessionUser.name ||
          (user.email && sessionUser.email && user.email === sessionUser.email)
      )
    ) {
      users.unshift({
        id: sessionUser.id,
        name: sessionUser.name,
        email: sessionUser.email ?? undefined,
        thumb: sessionUser.image ?? undefined,
        restricted: false,
        // App-admin flag, not necessarily the Plex server owner — only
        // drives the [Admin] label in the playground picker.
        serverAdmin: sessionUser.isAdmin,
      })
    }

    return NextResponse.json({ users })
  } catch (error) {
    logError("ADMIN_PLEX_USERS_API", error)
    return NextResponse.json(
      createSafeError(ErrorCode.INTERNAL_ERROR, "Failed to fetch Plex users"),
      { status: getStatusCode(ErrorCode.INTERNAL_ERROR) }
    )
  }
}

