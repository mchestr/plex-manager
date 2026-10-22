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
import { hasMembershipPage } from "@/lib/member/membership-page"
import { PATHNAME_HEADER } from "@/lib/request-headers"
import { sanitizeText } from "@/lib/utils/log-redaction"
import { createLogger, generateRequestId, runWithRequestContext } from "@/lib/utils/logger"
import { gateSharePath } from "@/lib/rewind/share/share-gate"
import { SHARE_RETRY_AFTER_S, shareStatusHtml } from "@/lib/rewind/share/status-html"
import { yearParamSchema } from "@/lib/validations/params"
import { getToken } from "next-auth/jwt"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

const logger = createLogger("HTTP")

const HEALTH_PATH = "/api/health"

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

/** `/rewind/<segment>`: one segment, so `/rewind/s/<token>` never matches. */
const REWIND_YEAR_PATH = /^\/rewind\/([^/]+)$/

/**
 * Whether the path is `/rewind/<year>` with a year the route rejects.
 *
 * The route renders its not-found page itself, but `app/loading.tsx` streams
 * every page, so the status is already sent as 200 by then. Answering here
 * gives the same page with a real 404 (P0.14).
 */
function isInvalidRewindYearPath(pathname: string): boolean {
  const segment = REWIND_YEAR_PATH.exec(pathname)?.[1]
  return segment !== undefined && !yearParamSchema.safeParse(segment).success
}

/** The session token of a page load, or null without one. */
async function pageToken(request: NextRequest) {
  return getToken({ req: request, secret: getEnv().NEXTAUTH_SECRET, secureCookie: usesSecureCookies() })
}

/**
 * Whether the path is `/membership` for a signed-in member who has no such
 * page: Stripe is off and they have no subscription row (P10.22). The page
 * renders its not-found itself, but streamed behind `app/loading.tsx`, so this
 * gives it the 404 status, as for a Rewind year. A failed check decides nothing.
 */
async function isMissingMembershipPage(request: NextRequest): Promise<boolean> {
  if (request.nextUrl.pathname !== "/membership" || (request.method !== "GET" && request.method !== "HEAD")) {
    return false
  }
  try {
    const userId = (await pageToken(request))?.sub
    return userId ? !(await hasMembershipPage(userId)) : false
  } catch (error) {
    logger.error("Membership page check failed", error)
    return false
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
    const token = await pageToken(request)
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

/** The request headers a page receives: the client's, with the proxy's {@link PATHNAME_HEADER} in place of any value the client sent. */
function pageRequestHeaders(headers: Headers, pathname: string): Headers {
  const next = new Headers(headers)
  next.set(PATHNAME_HEADER, pathname)
  return next
}

/**
 * The share page's static busy (429) or unavailable (503) page
 * (`lib/rewind/share/status-html.ts`).
 */
function shareStatusResponse(pathname: string, status: 429 | 503): NextResponse {
  return new NextResponse(shareStatusHtml(pathname), {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
      ...(status === 503 ? { "Retry-After": String(SHARE_RETRY_AFTER_S) } : {}),
    },
  })
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
    const { pathname } = request.nextUrl

    // No URL, client IP or query beyond the allow-list: the bearer segment of
    // share and invite paths is masked (SEC-54). The health check, which the
    // image's HEALTHCHECK polls every 30 s, is not logged.
    if (pathname !== HEALTH_PATH) {
      const query = loggedQuery(request.nextUrl.searchParams)
      logger.debug("Incoming request", {
        method: request.method,
        pathname: sanitizeText(pathname),
        ...(query && { query }),
      })
    }
    if (await needsMemberRedirect(request)) {
      // RSC navigations and prefetches get the same redirect; the router follows it
      const redirect = NextResponse.redirect(new URL("/subscribe", request.url))
      redirect.headers.set("X-Request-ID", requestId)
      return redirect
    }

    // A share path is gated first (lib/rewind/share/share-gate.ts): 429 when
    // over the limit, 503 when the database is down
    const share = await gateSharePath(pathname, request.headers)
    if (share === "busy" || share === "down") {
      const status = shareStatusResponse(pathname, share === "busy" ? 429 : 503)
      status.headers.set("X-Request-ID", requestId)
      return status
    }

    // Create response: the same page, with a 404 status for an invalid Rewind
    // year, a share token that shares nothing or a membership page the member lacks
    const init = { request: { headers: pageRequestHeaders(request.headers, pathname) } }
    const notFound =
      isInvalidRewindYearPath(pathname) || share === "missing" || (await isMissingMembershipPage(request))
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


