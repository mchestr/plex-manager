import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { shareRateLimiter } from "@/lib/security/rate-limit"
import { createSafeError, ErrorCode, getStatusCode, logError } from "@/lib/security/error-handler"
import { toShareSafeV2 } from "@/lib/wrapped/data/share-safe-v2"

// Share links are public but not meant for search results.
const NOINDEX = { "X-Robots-Tag": "noindex" }

/**
 * GET /api/wrapped/share/[token]
 * Fetch a shared wrapped by its share token. The response carries only the
 * share-safe projection, never the stored data blob (RWP-01, SEC-16).
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params
    // Apply rate limiting
    const rateLimitResponse = await shareRateLimiter(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    if (!token) {
      return NextResponse.json(
        createSafeError(ErrorCode.VALIDATION_ERROR, "Share token is required"),
        { status: getStatusCode(ErrorCode.VALIDATION_ERROR), headers: NOINDEX }
      )
    }

    // Find wrapped by share token
    const wrapped = await prisma.plexWrapped.findUnique({
      where: { shareToken: token },
      select: {
        id: true,
        year: true,
        status: true,
        summary: true,
        archetype: true,
        data: true,
        user: { select: { name: true } },
      },
    })

    // Security: Use same error message for both not found and not available
    // to prevent token enumeration attacks
    if (!wrapped || wrapped.status !== "completed") {
      return NextResponse.json(
        createSafeError(ErrorCode.NOT_FOUND, "Wrapped not found"),
        { status: getStatusCode(ErrorCode.NOT_FOUND), headers: NOINDEX }
      )
    }

    // Track the visit by wrapped id only (non-blocking - don't fail if tracking fails)
    try {
      await prisma.wrappedShareVisit.create({
        data: { wrappedId: wrapped.id },
      })
    } catch (error) {
      // Log but don't fail the request if tracking fails
      logError("SHARE_VISIT_TRACKING", error)
    }

    return NextResponse.json(
      { success: true, wrapped: toShareSafeV2(wrapped, wrapped.user) },
      { headers: NOINDEX }
    )
  } catch (error) {
    logError("SHARE_API", error)
    return NextResponse.json(
      createSafeError(ErrorCode.INTERNAL_ERROR, "Failed to fetch shared wrapped"),
      { status: getStatusCode(ErrorCode.INTERNAL_ERROR), headers: NOINDEX }
    )
  }
}
