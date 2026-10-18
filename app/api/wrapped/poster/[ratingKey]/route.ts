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
  resolveSessionPosterAccess,
  shareTokenAllowsRatingKey,
} from "@/lib/wrapped/poster-access"

export const dynamic = "force-dynamic"

const logger = createLogger("WRAPPED_POSTER_API")

const RATING_KEY_PATTERN = /^\d{1,12}$/
const POSTER_WIDTH = 400
const POSTER_HEIGHT = 600
const UPSTREAM_TIMEOUT_MS = 3000

/** Session responses: the browser may keep them, a shared cache must not. */
const SESSION_CACHE_CONTROL = "private, max-age=86400"
/** Share-token responses: the URL carries the token, so any cache may keep them. */
const SHARE_CACHE_CONTROL = "public, max-age=86400, s-maxage=86400"
const NOT_FOUND_CACHE_CONTROL = "private, max-age=60"

interface PosterServer {
  url: string
  token: string
  adminPlexUserId: string | null
}

function posterNotFound() {
  return NextResponse.json(createSafeError(ErrorCode.NOT_FOUND, "Poster not available"), {
    status: getStatusCode(ErrorCode.NOT_FOUND),
    headers: { "Cache-Control": NOT_FOUND_CACHE_CONTROL },
  })
}

/**
 * Fetches the resized poster from the Plex photo transcoder. Returns `null`
 * when Plex cannot produce it: a non-2xx answer, a timeout or a network error.
 */
async function fetchPoster(
  server: PosterServer,
  ratingKey: string
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  const transcodeUrl = new URL("/photo/:/transcode", server.url)
  transcodeUrl.searchParams.set("width", String(POSTER_WIDTH))
  transcodeUrl.searchParams.set("height", String(POSTER_HEIGHT))
  transcodeUrl.searchParams.set("minSize", "1")
  transcodeUrl.searchParams.set("upscale", "1")
  transcodeUrl.searchParams.set("url", `/library/metadata/${ratingKey}/thumb`)

  try {
    const upstream = await fetchWithTimeout(transcodeUrl.toString(), {
      headers: { "X-Plex-Token": server.token },
      timeoutMs: UPSTREAM_TIMEOUT_MS,
    })
    if (!upstream.ok) {
      logger.debug("Plex could not produce the poster", { ratingKey, status: upstream.status })
      return null
    }
    return {
      body: await upstream.arrayBuffer(),
      contentType: upstream.headers.get("content-type") || "image/jpeg",
    }
  } catch (error) {
    logger.debug("Poster request to Plex failed", {
      ratingKey,
      error: error instanceof Error ? error.name : String(error),
    })
    return null
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
 * - **Misses** (Plex 404, timeout, network error, or a denied key) are 404s
 *   cached privately for 60 s; Plex misses are also remembered in-process for
 *   5 minutes, so slides fall back to text at once.
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
      return NextResponse.json(
        createSafeError(ErrorCode.VALIDATION_ERROR, "Invalid rating key"),
        { status: getStatusCode(ErrorCode.VALIDATION_ERROR) }
      )
    }

    const session = await getServerSession(authOptions)
    const shareToken = request.nextUrl.searchParams.get("share")
    if (!session) {
      const allowed = shareToken
        ? await shareTokenAllowsRatingKey(shareToken, ratingKey)
        : false
      if (!allowed) {
        return NextResponse.json(
          createSafeError(ErrorCode.UNAUTHORIZED, "Authentication required"),
          { status: getStatusCode(ErrorCode.UNAUTHORIZED) }
        )
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

    let servedAs: "private" | "share" = "share"
    if (session) {
      const access = await resolveSessionPosterAccess(
        { id: session.user.id, isAdmin: session.user.isAdmin },
        plexServer,
        ratingKey,
        shareToken
      )
      if (access === "deny") {
        return posterNotFound()
      }
      servedAs = access
    }

    const poster = await fetchPoster(plexServer, ratingKey)
    if (!poster) {
      rememberPosterMiss(ratingKey)
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
    return NextResponse.json(
      createSafeError(ErrorCode.INTERNAL_ERROR, "Failed to fetch poster"),
      { status: getStatusCode(ErrorCode.INTERNAL_ERROR) }
    )
  }
}
