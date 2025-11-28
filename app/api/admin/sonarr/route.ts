import { prisma } from "@/lib/prisma"
import { requireAdminAPI } from "@/lib/security/api-helpers"
import { createSafeError, ErrorCode, getStatusCode, logError } from "@/lib/security/error-handler"
import { adminRateLimiter } from "@/lib/security/rate-limit"
import { NextRequest, NextResponse } from "next/server"

/**
 * API route for fetching Sonarr servers.
 *
 * Uses API route instead of Server Action because this endpoint is consumed
 * by client-side components that need to fetch server lists dynamically
 * (e.g., for dropdowns/selectors in maintenance rule creation).
 * API routes are preferred for GET operations that need to be called from
 * client components with proper HTTP caching and conditional requests.
 */
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

    // Get all Sonarr servers
    const servers = await prisma.sonarr.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ servers })
  } catch (error) {
    logError("ADMIN_SONARR_API", error)
    return NextResponse.json(
      createSafeError(ErrorCode.INTERNAL_ERROR, "Failed to fetch Sonarr servers"),
      { status: getStatusCode(ErrorCode.INTERNAL_ERROR) }
    )
  }
}
