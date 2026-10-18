/**
 * Next.js proxy (formerly middleware) for request logging and request ID tracking
 * Logs incoming HTTP requests and sets up request context for async operations
 */

import {
  createLogger,
  generateRequestId,
  runWithRequestContext,
  sanitizeUrlForLogging,
} from "@/lib/utils/logger"
import { yearParamSchema } from "@/lib/validations/shared-schemas"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

const logger = createLogger("HTTP")

/** `/wrapped/<segment>`: one segment, so `/wrapped/share/<token>` never matches. */
const WRAPPED_YEAR_PATH = /^\/wrapped\/([^/]+)$/

/**
 * Whether the path is `/wrapped/<year>` with a year the route rejects.
 *
 * The route renders its not-found page itself, but `app/loading.tsx` streams
 * every page, so the status is already sent as 200 by then. Answering here
 * gives the same page with a real 404 (P0.14).
 */
function isInvalidWrappedYearPath(pathname: string): boolean {
  const segment = WRAPPED_YEAR_PATH.exec(pathname)?.[1]
  return segment !== undefined && !yearParamSchema.safeParse(segment).success
}

/**
 * Proxy handler to log HTTP requests and set up request context
 */
export function proxy(request: NextRequest) {
  const requestId = generateRequestId()

  // Extract user ID from session if available (set by auth callbacks)
  let userId: string | undefined

  // Run the request within a context
  return runWithRequestContext(requestId, userId, () => {
    const url = sanitizeUrlForLogging(request.url)
    const method = request.method
    const userAgent = request.headers.get("user-agent") || "unknown"
    const ip =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown"

    // Log incoming request
    logger.info("Incoming request", {
      method,
      url,
      userAgent,
      ip,
      pathname: request.nextUrl.pathname,
      searchParams: Object.fromEntries(request.nextUrl.searchParams),
    })

    // Create response: the same page, with a 404 status for an invalid Rewind year
    const response = isInvalidWrappedYearPath(request.nextUrl.pathname)
      ? NextResponse.rewrite(request.nextUrl, { status: 404 })
      : NextResponse.next()

    // Add request ID to response headers for tracing
    response.headers.set("X-Request-ID", requestId)

    return response
  })
}

/**
 * Configure which routes should be processed by this proxy
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)).*)",
  ],
}


