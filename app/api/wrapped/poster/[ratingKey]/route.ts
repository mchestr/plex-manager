import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createSafeError, ErrorCode, getStatusCode, logError } from "@/lib/security/error-handler"
import { limitRequest } from "@/lib/security/rate-limit"
import { fetchWithTimeout } from "@/lib/utils/fetch-with-timeout"
import { createLogger } from "@/lib/utils/logger"
import {
  isKnownPosterMiss,
  rememberPosterMiss,
  remainingMs,
  resolveSessionPosterAccess,
} from "@/lib/wrapped/poster-access"
import { shareTokenAllowsRatingKey } from "@/lib/wrapped/poster-keys"

export const dynamic = "force-dynamic"

const logger = createLogger("WRAPPED_POSTER_API")

const RATING_KEY_PATTERN = /^\d{1,12}$/
const POSTER_WIDTH = 400
const POSTER_HEIGHT = 600
/** Every upstream call of one request (lookups and the poster) shares this budget. */
const UPSTREAM_TIMEOUT_MS = 3000
/**
 * A failed poster fetch is remembered as a miss only if it had at least this
 * long: with less, lookups used up the budget and the failure says little
 * about the poster.
 */
const MIN_MISS_TIMEOUT_MS = 2000

/** Session responses: the browser may keep them, a shared cache must not. */
const SESSION_CACHE_CONTROL = "private, max-age=86400"
/**
 * Share-token responses: the URL carries the token, so any cache may keep them,
 * but only for 5 minutes, so a stopped link stops serving posters soon after.
 */
const SHARE_CACHE_CONTROL = "public, max-age=300"
const NOT_FOUND_CACHE_CONTROL = "private, max-age=60"
/** Errors (400, 401, 500): never stored, so a shared cache cannot replay one to other viewers. */
const ERROR_CACHE_CONTROL = "private, no-store"

interface PosterServer {
  url: string
  token: string
  adminPlexUserId: string | null
}

/**
 * A poster fetch: `missing` when Plex answered with a non-2xx status,
 * `failed` when the request timed out or failed on the network.
 */
type PosterFetch =
  | { status: "ok"; body: ArrayBuffer; contentType: string }
  | { status: "missing" }
  | { status: "failed" }

function errorResponse(code: ErrorCode, message: string) {
  return NextResponse.json(createSafeError(code, message), {
    status: getStatusCode(code),
    headers: { "Cache-Control": ERROR_CACHE_CONTROL },
  })
}

function posterNotFound() {
  return NextResponse.json(createSafeError(ErrorCode.NOT_FOUND, "Poster not available"), {
    status: getStatusCode(ErrorCode.NOT_FOUND),
    headers: { "Cache-Control": NOT_FOUND_CACHE_CONTROL },
  })
}

/**
 * Fetches the resized poster from the Plex photo transcoder. The timeout
 * covers reading the image too.
 */
async function fetchPoster(
  server: PosterServer,
  ratingKey: string,
  timeoutMs: number
): Promise<PosterFetch> {
  const transcodeUrl = new URL("/photo/:/transcode", server.url)
  transcodeUrl.searchParams.set("width", String(POSTER_WIDTH))
  transcodeUrl.searchParams.set("height", String(POSTER_HEIGHT))
  transcodeUrl.searchParams.set("minSize", "1")
  transcodeUrl.searchParams.set("upscale", "1")
  transcodeUrl.searchParams.set("url", `/library/metadata/${ratingKey}/thumb`)

  try {
    const upstream = await fetchWithTimeout(transcodeUrl.toString(), {
      headers: { "X-Plex-Token": server.token },
      timeoutMs,
      timeoutCoversBody: true,
    })
    if (!upstream.ok) {
      logger.debug("Plex could not produce the poster", { ratingKey, status: upstream.status })
      return { status: "missing" }
    }
    return {
      status: "ok",
      body: await upstream.arrayBuffer(),
      contentType: upstream.headers.get("content-type") || "image/jpeg",
    }
  } catch (error) {
    logger.debug("Poster request to Plex failed", {
      ratingKey,
      error: error instanceof Error ? error.name : String(error),
    })
    return { status: "failed" }
  }
}

/**
 * GET /api/wrapped/poster/[ratingKey]?share=<token>
 *
 * Proxies poster art from the active Plex server so the Plex token never
 * reaches the client.
 *
 * - **Sessions** may fetch only keys `resolveSessionPosterAccess` allows
 *   (admin or owner, the viewer's own Rewind, a covering share token, or a
 *   library section shared with the viewer); anything else is a 404. Their
 *   responses are `private`.
 * - **Signed-out requests** need a share token covering the key (401
 *   otherwise). Their responses are `public` with `X-Robots-Tag: noindex`.
 * - **Upstream calls** (the access lookups, then the poster) share one 3 s
 *   deadline, bodies included.
 * - **Misses** (Plex 404, timeout, network error, or a denied key) are 404s
 *   cached privately for 60 s; Plex misses are also remembered in-process for
 *   5 minutes, so slides fall back to text at once. Denials are not.
 * - **Errors** (400, 401, 500) send `private, no-store`.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ratingKey: string }> }
) {
  try {
    const rateLimitResponse = await limitRequest("poster", request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const { ratingKey } = await context.params
    if (!RATING_KEY_PATTERN.test(ratingKey)) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, "Invalid rating key")
    }

    const session = await getServerSession(authOptions)
    const shareToken = request.nextUrl.searchParams.get("share")
    if (!session) {
      const allowed = shareToken
        ? await shareTokenAllowsRatingKey(shareToken, ratingKey)
        : false
      if (!allowed) {
        return errorResponse(ErrorCode.UNAUTHORIZED, "Authentication required")
      }
    }

    // A session sees the same 404 for a denied key and a known miss, so
    // answering from the negative cache before the access check leaks nothing.
    if (isKnownPosterMiss(ratingKey)) {
      return posterNotFound()
    }

    const plexServer = await prisma.plexServer.findFirst({
      where: { isActive: true },
      select: { url: true, token: true, adminPlexUserId: true },
    })
    if (!plexServer) {
      return posterNotFound()
    }

    const deadline = Date.now() + UPSTREAM_TIMEOUT_MS
    let servedAs: "private" | "share" = "share"
    if (session) {
      const access = await resolveSessionPosterAccess(
        { id: session.user.id, isAdmin: session.user.isAdmin },
        plexServer,
        ratingKey,
        { shareToken, deadline }
      )
      if (access === "deny") {
        return posterNotFound()
      }
      servedAs = access
    }

    const timeoutMs = remainingMs(deadline)
    if (timeoutMs === 0) {
      return posterNotFound()
    }
    const poster = await fetchPoster(plexServer, ratingKey, timeoutMs)
    if (poster.status !== "ok") {
      if (poster.status === "missing" || timeoutMs >= MIN_MISS_TIMEOUT_MS) {
        rememberPosterMiss(ratingKey)
      }
      return posterNotFound()
    }

    const headers: Record<string, string> = {
      "Content-Type": poster.contentType,
      "Cache-Control": servedAs === "share" ? SHARE_CACHE_CONTROL : SESSION_CACHE_CONTROL,
    }
    if (servedAs === "share") {
      headers["X-Robots-Tag"] = "noindex"
    }
    return new NextResponse(poster.body, { headers })
  } catch (error) {
    logError("WRAPPED_POSTER_API", error)
    return errorResponse(ErrorCode.INTERNAL_ERROR, "Failed to fetch poster")
  }
}
