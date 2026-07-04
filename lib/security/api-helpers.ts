import { NextRequest, NextResponse } from "next/server"
import { getServerSession, type Session } from "next-auth"
import { authOptions } from "@/lib/auth"
import { createSafeError, ErrorCode, getStatusCode, logError } from "@/lib/security/error-handler"

/**
 * Require admin authentication for API routes
 * Returns session if admin, or error response if not
 */
export async function requireAdminAPI(
  _request: NextRequest
): Promise<{ session: Session; response: null } | { session: null; response: NextResponse }> {
  try {
    const session = await getServerSession(authOptions)

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

/**
 * Require authentication for API routes (non-admin)
 */
export async function requireAuthAPI(
  _request: NextRequest
): Promise<{ session: Awaited<ReturnType<typeof getServerSession>>; response: null } | { session: null; response: NextResponse }> {
  try {
    const session = await getServerSession(authOptions)

    if (!session) {
      return {
        session: null,
        response: NextResponse.json(
          createSafeError(ErrorCode.UNAUTHORIZED, "Authentication required"),
          { status: getStatusCode(ErrorCode.UNAUTHORIZED) }
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

/**
 * Validate year parameter from URL
 */
export function validateYear(yearParam: string | null): number {
  const currentYear = new Date().getFullYear()

  if (!yearParam) {
    return currentYear
  }

  const parsed = parseInt(yearParam, 10)

  // Validate year is reasonable (2000-2100)
  if (isNaN(parsed) || parsed < 2000 || parsed > 2100) {
    return currentYear
  }

  return parsed
}

