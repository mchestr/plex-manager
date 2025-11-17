import { prisma } from "@/lib/prisma"
import { requireAdminAPI } from "@/lib/security/api-helpers"
import { createSafeError, ErrorCode, getStatusCode, logError } from "@/lib/security/error-handler"
import { adminRateLimiter } from "@/lib/security/rate-limit"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  request: NextRequest,
  { params }: { params: { wrappedId: string } }
) {
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

    const wrapped = await prisma.plexWrapped.findUnique({
      where: { id: params.wrappedId },
      select: {
        userId: true,
      },
    })

    if (!wrapped) {
      return NextResponse.json(
        createSafeError(ErrorCode.NOT_FOUND, "Wrapped not found"),
        { status: getStatusCode(ErrorCode.NOT_FOUND) }
      )
    }

    return NextResponse.json({ userId: wrapped.userId })
  } catch (error) {
    logError("ADMIN_WRAPPED_USER_API", error)
    return NextResponse.json(
      createSafeError(ErrorCode.INTERNAL_ERROR, "Failed to fetch wrapped user"),
      { status: getStatusCode(ErrorCode.INTERNAL_ERROR) }
    )
  }
}
