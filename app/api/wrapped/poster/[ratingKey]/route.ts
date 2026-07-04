import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createSafeError, ErrorCode, getStatusCode, logError } from "@/lib/security/error-handler"
import { posterRateLimiter } from "@/lib/security/rate-limit"
import { fetchWithTimeout } from "@/lib/utils/fetch-with-timeout"
import type { WrappedData } from "@/types/wrapped"

export const dynamic = "force-dynamic"

const RATING_KEY_PATTERN = /^\d{1,12}$/
const POSTER_WIDTH = 400
const POSTER_HEIGHT = 600

/**
 * Check whether a share token grants access to this poster: the token must
 * belong to a completed wrapped whose top movies/shows include the rating
 * key. This keeps the Plex token server-side while preventing library
 * enumeration through a leaked share link.
 */
async function shareTokenAllowsRatingKey(
  token: string,
  ratingKey: string
): Promise<boolean> {
  const wrapped = await prisma.plexWrapped.findUnique({
    where: { shareToken: token },
    select: { status: true, data: true },
  })
  if (!wrapped || wrapped.status !== "completed") {
    return false
  }

  try {
    const data = JSON.parse(wrapped.data) as WrappedData
    const keys = [
      ...(data.statistics?.topMovies ?? []),
      ...(data.statistics?.topShows ?? []),
    ].map((item) => item.ratingKey)
    return keys.includes(ratingKey)
  } catch {
    return false
  }
}

/**
 * GET /api/wrapped/poster/[ratingKey]?share=<token>
 *
 * Proxies poster art from the active Plex server so the Plex token never
 * reaches the client. Access requires either an authenticated session or a
 * valid share token covering the rating key (for public shared wraps).
 * Responses are cacheable — poster art is effectively immutable per key.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ratingKey: string }> }
) {
  try {
    const rateLimitResponse = await posterRateLimiter(request)
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
    if (!session) {
      const shareToken = request.nextUrl.searchParams.get("share")
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

    const plexServer = await prisma.plexServer.findFirst({
      where: { isActive: true },
    })
    if (!plexServer) {
      return NextResponse.json(
        createSafeError(ErrorCode.NOT_FOUND, "No active Plex server configured"),
        { status: getStatusCode(ErrorCode.NOT_FOUND) }
      )
    }

    // Plex photo transcoder resizes server-side so we never ship full-res art
    const transcodeUrl = new URL("/photo/:/transcode", plexServer.url)
    transcodeUrl.searchParams.set("width", String(POSTER_WIDTH))
    transcodeUrl.searchParams.set("height", String(POSTER_HEIGHT))
    transcodeUrl.searchParams.set("minSize", "1")
    transcodeUrl.searchParams.set("upscale", "1")
    transcodeUrl.searchParams.set("url", `/library/metadata/${ratingKey}/thumb`)

    const upstream = await fetchWithTimeout(transcodeUrl.toString(), {
      headers: { "X-Plex-Token": plexServer.token },
      timeoutMs: 10000,
    })

    if (!upstream.ok) {
      return NextResponse.json(
        createSafeError(ErrorCode.NOT_FOUND, "Poster not available"),
        { status: getStatusCode(ErrorCode.NOT_FOUND) }
      )
    }

    const body = await upstream.arrayBuffer()
    return new NextResponse(body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    })
  } catch (error) {
    logError("WRAPPED_POSTER_API", error)
    return NextResponse.json(
      createSafeError(ErrorCode.INTERNAL_ERROR, "Failed to fetch poster"),
      { status: getStatusCode(ErrorCode.INTERNAL_ERROR) }
    )
  }
}
