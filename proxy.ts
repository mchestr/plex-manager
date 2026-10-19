/**
 * Next.js proxy (formerly middleware) for request logging and request ID tracking
 * Logs incoming HTTP requests and sets up request context for async operations
 *
 * It also keeps members below full access out of the `(app)` pages on every
 * request, client-side navigations and prefetches included, which the
 * `(app)` layout alone cannot do (P4.5, FR-51), and forwards the pathname to
 * the pages as the `x-pm-pathname` request header.
 *
 * The proxy is bundled apart from the app, so in production it holds its own
 * PrismaClient and pg pool (lib/prisma.ts reuses a client through globalThis
 * only outside production) and, with REDIS_URL, its own rate-limiter Redis
 * client. Importing lib/prisma.ts also means a missing DATABASE_URL fails every
 * proxied request, not only the pages that read the database.
 */

import { getAccessLevel } from "@/lib/access"
import { isMemberAppPath, needsSubscribeRedirect } from "@/lib/access-paths"
import { getEnv, usesSecureCookies } from "@/lib/env"
import { prisma } from "@/lib/prisma"
import { PATHNAME_HEADER } from "@/lib/request-headers"
import { clientIp } from "@/lib/security/client-ip"
import { consume } from "@/lib/security/rate-limit"
import { sanitizeText } from "@/lib/utils/log-redaction"
import { createLogger, generateRequestId, runWithRequestContext } from "@/lib/utils/logger"
import { shareTokenSchema, yearParamSchema } from "@/lib/validations/params"
import { SHARE_BUSY_HEADER } from "@/lib/wrapped/share-page-limit"
import { getToken } from "next-auth/jwt"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

const logger = createLogger("HTTP")

/** The only query keys the request log carries; every other key may hold a credential (SEC-54). */
const LOGGED_QUERY_KEYS = ["year", "page", "tab"] as const

/** The allow-listed query values of a request, or `undefined` when it has none. */
function loggedQuery(searchParams: URLSearchParams): Record<string, string> | undefined {
  const entries = LOGGED_QUERY_KEYS.flatMap((key) => {
    const value = searchParams.get(key)
    return value === null ? [] : [[key, value] as const]
  })
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

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
 * Whether a signed-in member must be sent to `/subscribe` from this path: a
 * `lapsed` member may open only the read-only Rewind pages, and a `none`
 * member no `(app)` page (`lib/access-paths.ts`).
 *
 * The session token's `accessLevel` claim filters cheaply, so a `full`
 * member's request costs no query. The cookie is only rewritten when the
 * session route runs, so a `lapsed` or `none` claim can be stale; it is
 * confirmed from the database before the redirect, so a member who renewed is
 * not sent away. A token without the claim (issued before P4.5), or a failed
 * read, decides nothing here: the `(app)` layout still checks full loads.
 */
async function needsMemberRedirect(request: NextRequest): Promise<boolean> {
  const { pathname } = request.nextUrl
  // Page loads only: a Server Action POST checks entitlement itself
  if ((request.method !== "GET" && request.method !== "HEAD") || !isMemberAppPath(pathname)) {
    return false
  }
  try {
    const token = await getToken({
      req: request,
      secret: getEnv().NEXTAUTH_SECRET,
      secureCookie: usesSecureCookies(),
    })
    const claimed = token?.accessLevel
    if (!token?.sub || !claimed || !needsSubscribeRedirect(pathname, claimed)) {
      return false
    }
    return needsSubscribeRedirect(pathname, await getAccessLevel(token.sub))
  } catch (error) {
    logger.error("Access level check failed", error)
    return false
  }
}

/**
 * The request headers a page receives: the client's, with the proxy's
 * {@link PATHNAME_HEADER} and, on a share page, its busy verdict in place of
 * any value the client sent for either.
 */
function pageRequestHeaders(
  headers: Headers,
  pathname: string,
  share: Awaited<ReturnType<typeof checkSharePath>>
): Headers {
  const next = new Headers(headers)
  next.set(PATHNAME_HEADER, pathname)
  next.delete(SHARE_BUSY_HEADER)
  if (share === "busy") {
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
    // No URL, client IP or query beyond the allow-list: the bearer segment of
    // share and invite paths is masked (SEC-54)
    const query = loggedQuery(request.nextUrl.searchParams)
    logger.debug("Incoming request", {
      method: request.method,
      pathname: sanitizeText(request.nextUrl.pathname),
      ...(query && { query }),
    })

    const { pathname } = request.nextUrl
    if (await needsMemberRedirect(request)) {
      // RSC navigations and prefetches get the same redirect; the router follows it
      const redirect = NextResponse.redirect(new URL("/subscribe", request.url))
      redirect.headers.set("X-Request-ID", requestId)
      return redirect
    }

    // Create response: the same page, with a 404 status for an invalid Rewind
    // year or a share token that shares nothing
    const share = await checkSharePath(pathname, request.headers)
    const init = { request: { headers: pageRequestHeaders(request.headers, pathname, share) } }
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
     * Match every request path, API routes included, except the following.
     * Every `(app)` page must stay matched for the lapsed-member redirect;
     * `__tests__/proxy.test.ts` checks each route folder.
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)).*)",
  ],
}


