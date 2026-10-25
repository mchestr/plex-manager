import { NextRequest, NextResponse } from "next/server"
import type { Session } from "next-auth"
import { createSafeError, ErrorCode, getStatusCode, logError } from "@/lib/security/error-handler"
import { getSession } from "@/lib/data/session"

/**
 * Require admin authentication for API routes
 * Returns session if admin, or error response if not
 */
export async function requireAdminAPI(
  _request: NextRequest
): Promise<{ session: Session; response: null } | { session: null; response: NextResponse }> {
  try {
    const session = await getSession()

    if (!session) {
      return {
        session: null,
        response: NextResponse.json(
          createSafeError(ErrorCode.UNAUTHORIZED, "Authentication required"),
          { status: getStatusCode(ErrorCode.UNAUTHORIZED) }
        ),
      }
    }

    if (!session.user.isAdmin) {
      return {
        session: null,
        response: NextResponse.json(
          createSafeError(ErrorCode.FORBIDDEN, "Admin access required"),
          { status: getStatusCode(ErrorCode.FORBIDDEN) }
        ),
      }
    }

    return { session, response: null }
  } catch (error) {
    logError("API_AUTH", error)
    return {
      session: null,
      response: NextResponse.json(
        createSafeError(ErrorCode.INTERNAL_ERROR, "Authentication check failed"),
        { status: getStatusCode(ErrorCode.INTERNAL_ERROR) }
      ),
    }
  }
}
