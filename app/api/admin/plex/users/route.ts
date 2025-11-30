import { getAllPlexServerUsers } from "@/lib/connections/plex"
import { requireAdminAPI } from "@/lib/security/api-helpers"
import { createSafeError, ErrorCode, getStatusCode, logError } from "@/lib/security/error-handler"
import { adminRateLimiter } from "@/lib/security/rate-limit"
import { getActivePlexService } from "@/lib/services/service-helpers"
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

    // Get active Plex service configuration
    const plexService = await getActivePlexService()

    if (!plexService) {
      return NextResponse.json(
        createSafeError(ErrorCode.NOT_FOUND, "No active Plex server configured"),
        { status: getStatusCode(ErrorCode.NOT_FOUND) }
      )
    }

    // Fetch users from Plex server
    const usersResult = await getAllPlexServerUsers({
      url: plexService.url ?? "",
      token: plexService.config.token,
    })

    if (!usersResult.success) {
      return NextResponse.json(
        createSafeError(ErrorCode.INTERNAL_ERROR, usersResult.error || "Failed to fetch Plex users"),
        { status: getStatusCode(ErrorCode.INTERNAL_ERROR) }
      )
    }

    return NextResponse.json({ users: usersResult.data || [] })
  } catch (error) {
    logError("ADMIN_PLEX_USERS_API", error)
    return NextResponse.json(
      createSafeError(ErrorCode.INTERNAL_ERROR, "Failed to fetch Plex users"),
      { status: getStatusCode(ErrorCode.INTERNAL_ERROR) }
    )
  }
}

