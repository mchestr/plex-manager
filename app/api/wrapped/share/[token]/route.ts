import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { limitRequest } from "@/lib/security/rate-limit"
import { getHashedIP } from "@/lib/security/ip-hash"
import { createSafeError, ErrorCode, getStatusCode, logError } from "@/lib/security/error-handler"

/**
 * GET /api/wrapped/share/[token]
 * Fetch a shared wrapped by its share token
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
      return rateLimitResponse
    }

    if (!token) {
      return NextResponse.json(
        createSafeError(ErrorCode.VALIDATION_ERROR, "Share token is required"),
        { status: getStatusCode(ErrorCode.VALIDATION_ERROR) }
      )
    }

    // Find wrapped by share token
    const wrapped = await prisma.plexWrapped.findUnique({
      where: { shareToken: token },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    })

    // Security: Use same error message for both not found and not available
    // to prevent token enumeration attacks
    if (!wrapped || wrapped.status !== "completed") {
      return NextResponse.json(
        createSafeError(ErrorCode.NOT_FOUND, "Wrapped not found"),
        { status: getStatusCode(ErrorCode.NOT_FOUND) }
      )
    }

    // Track visit (non-blocking - don't fail if tracking fails)
    try {
      const hashedIP = getHashedIP(request)
      const userAgent = request.headers.get("user-agent") || null
      const referer = request.headers.get("referer") || null

      await prisma.wrappedShareVisit.create({
        data: {
          wrappedId: wrapped.id,
          ipAddress: hashedIP, // Store hashed IP for privacy
          userAgent,
          referer,
        },
      })
    } catch (error) {
      // Log but don't fail the request if tracking fails
      logError("SHARE_VISIT_TRACKING", error)
    }

    // Parse wrapped data
    const wrappedData = JSON.parse(wrapped.data)

    // Return wrapped data with user info (but hide sensitive user ID)
    return NextResponse.json({
      success: true,
      wrapped: {
        id: wrapped.id,
        year: wrapped.year,
        shareToken: wrapped.shareToken,
        summary: wrapped.summary,
        generatedAt: wrapped.generatedAt,
        userName: wrapped.user.name || wrapped.user.email || "User",
        userImage: wrapped.user.image,
        data: wrappedData,
      },
    })
  } catch (error) {
    logError("SHARE_API", error)
    return NextResponse.json(
      createSafeError(ErrorCode.INTERNAL_ERROR, "Failed to fetch shared wrapped"),
      { status: getStatusCode(ErrorCode.INTERNAL_ERROR) }
    )
  }
}

