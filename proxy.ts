/**
 * Next.js proxy (formerly middleware) for request logging and request ID tracking
 * Logs incoming HTTP requests and sets up request context for async operations
 *
 * The proxy is bundled apart from the app, so in production it holds its own
 * PrismaClient and pg pool (lib/prisma.ts reuses a client through globalThis
 * only outside production) and, with REDIS_URL, its own rate-limiter Redis
 * client. Importing lib/prisma.ts also means a missing DATABASE_URL fails every
 * proxied request, not only the pages that read the database.
 */

import { prisma } from "@/lib/prisma"
import { clientIp } from "@/lib/security/client-ip"
import { consume } from "@/lib/security/rate-limit"
import {
  createLogger,
  generateRequestId,
  runWithRequestContext,
  sanitizeUrlForLogging,
} from "@/lib/utils/logger"
import { shareTokenSchema, yearParamSchema } from "@/lib/validations/shared-schemas"
import { SHARE_BUSY_HEADER } from "@/lib/wrapped/share-page-limit"
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

/** `/wrapped/share/<token>` */
const WRAPPED_SHARE_PATH = /^\/wrapped\/share\/([^/]+)$/

/**
 * What the share page should do for `/wrapped/share/<token>`, or `null` for
 * any other path.
 *
 * - `missing`: the token shares nothing. The page renders its not-found page,
 *   streamed with status 200 for the same reason as above, so the 404 status
 *   is set here (P0.11). A token that cannot exist (not the 43 base64url
 *   characters of a share token, or not valid percent-encoding) is answered
 *   without a database call; an unknown or revoked token, or one whose Rewind
 *   is not `completed`, is found with one indexed read of the status, the same
 *   rule as `getShareSafeRewind`.
 * - `busy`: the visitor is over `rw:share-page`. Their point is spent before
 *   the lookup, so a flood of share URLs never reaches the database at full
 *   rate; the page renders its busy state without a lookup of its own.
 * - `shown`: the page renders the Rewind.
 *
 * The segment is decoded first, as the page's `params.token` is, so a token
 * with a percent-encoded character is the same token in both places.
 *
 * A failed limiter or lookup lets the request through: the page's own lookup
 * then renders the Rewind, or throws and renders the error page.
 */
async function checkSharePath(pathname: string, headers: Headers): Promise<"missing" | "busy" | "shown" | null> {
  const segment = WRAPPED_SHARE_PATH.exec(pathname)?.[1]
  if (segment === undefined) {
    return null
  }

  let token: string
  try {
    token = decodeURIComponent(segment)
  } catch {
    return "missing"
  }
  if (!shareTokenSchema.safeParse(token).success) {
    return "missing"
  }

  try {
    if (!(await consume("rw:share-page", clientIp(headers))).ok) {
      return "busy"
    }
  } catch (error) {
    logger.error("Share page rate limit failed", error)
  }

  try {
    const wrapped = await prisma.plexWrapped.findUnique({
      where: { shareToken: token },
      select: { status: true },
    })
    return wrapped?.status === "completed" ? "shown" : "missing"
  } catch (error) {
    logger.error("Share token lookup failed", error)
    return "shown"
  }
}

/**
 * The request headers a share page receives: the client's, with the proxy's
 * busy verdict in place of any {@link SHARE_BUSY_HEADER} the client sent.
 */
function shareRequestHeaders(headers: Headers, busy: boolean): Headers {
  const next = new Headers(headers)
  next.delete(SHARE_BUSY_HEADER)
  if (busy) {
    next.set(SHARE_BUSY_HEADER, "1")
  }
  return next
}

/**
 * Proxy handler to log HTTP requests and set up request context
 */
export async function proxy(request: NextRequest) {
  const requestId = generateRequestId()

  // Extract user ID from session if available (set by auth callbacks)
  let userId: string | undefined

  // Run the request within a context
  return runWithRequestContext(requestId, userId, async () => {
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

    // Create response: the same page, with a 404 status for an invalid Rewind
    // year or a share token that shares nothing
    const { pathname } = request.nextUrl
    const share = await checkSharePath(pathname, request.headers)
    const init =
      share === null ? {} : { request: { headers: shareRequestHeaders(request.headers, share === "busy") } }
    const notFound = isInvalidWrappedYearPath(pathname) || share === "missing"
    const response = notFound
      ? NextResponse.rewrite(request.nextUrl, { ...init, status: 404 })
      : NextResponse.next(init)

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


