import { NextRequest, NextResponse } from "next/server"
import { limitRequest } from "@/lib/security/rate-limit"
import { createSafeError, ErrorCode, getStatusCode, logError } from "@/lib/security/error-handler"
import { getShareSafeRewind } from "@/lib/wrapped/data/get-share-safe"

// Share links are public but not meant for search results.
const NOINDEX = { "X-Robots-Tag": "noindex" }

/**
 * GET /api/wrapped/share/[token]
 * Fetch a shared wrapped by its share token. The response carries only the
 * share-safe projection, never the stored data blob (RWP-01, SEC-16).
 *
 * Visits are recorded by the share page alone, so a view counts once
 * (RWP-09).
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params
    // Apply rate limiting
    const rateLimitResponse = await limitRequest("share", request)
    if (rateLimitResponse) {
      rateLimitResponse.headers.set("X-Robots-Tag", NOINDEX["X-Robots-Tag"])
      return rateLimitResponse
    }

    if (!token) {
      return NextResponse.json(
        createSafeError(ErrorCode.VALIDATION_ERROR, "Share token is required"),
        { status: getStatusCode(ErrorCode.VALIDATION_ERROR), headers: NOINDEX }
      )
    }

    const found = await getShareSafeRewind(token)

    // Security: Use same error message for malformed, unknown, revoked and
    // unfinished shares to prevent token enumeration attacks
    if (!found) {
      return NextResponse.json(
        createSafeError(ErrorCode.NOT_FOUND, "Wrapped not found"),
        { status: getStatusCode(ErrorCode.NOT_FOUND), headers: NOINDEX }
      )
    }

    return NextResponse.json({ success: true, wrapped: found.share }, { headers: NOINDEX })
  } catch (error) {
    logError("SHARE_API", error)
    return NextResponse.json(
      createSafeError(ErrorCode.INTERNAL_ERROR, "Failed to fetch shared wrapped"),
      { status: getStatusCode(ErrorCode.INTERNAL_ERROR), headers: NOINDEX }
    )
  }
}
