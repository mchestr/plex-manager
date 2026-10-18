import { getUserPlexWrapped } from "@/actions/users"
import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI, validateYear } from "@/lib/security/api-helpers"
import { limitRequest } from "@/lib/security/rate-limit"
import { createSafeError, ErrorCode, getStatusCode, logError } from "@/lib/security/error-handler"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await context.params
    // Apply rate limiting
    const rateLimitResponse = await limitRequest("admin", request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    // Require admin authentication
    const authResult = await requireAdminAPI(request)
    if (authResult.response) {
      return authResult.response
    }

    const yearParam = request.nextUrl.searchParams.get("year")
    const currentYear = validateYear(yearParam)

    const wrapped = await getUserPlexWrapped(userId, currentYear)

    if (!wrapped) {
      return NextResponse.json({ wrappedId: null })
    }

    return NextResponse.json({ wrappedId: wrapped.id })
  } catch (error) {
    logError("ADMIN_WRAPPED_BY_USER_API", error)
    return NextResponse.json(
      createSafeError(ErrorCode.INTERNAL_ERROR, "Failed to fetch wrapped ID"),
      { status: getStatusCode(ErrorCode.INTERNAL_ERROR) }
    )
  }
}

