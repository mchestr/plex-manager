import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createSafeError, ErrorCode, getStatusCode, logError } from "@/lib/security/error-handler"
import { limitRequest } from "@/lib/security/rate-limit"
import { fetchWithTimeout } from "@/lib/utils/fetch-with-timeout"
import { toShareSafeV2 } from "@/lib/wrapped/data/share-safe-v2"

export const dynamic = "force-dynamic"

const RATING_KEY_PATTERN = /^\d{1,12}$/
const POSTER_WIDTH = 400
const POSTER_HEIGHT = 600

/**
 * Check whether a share token grants access to this poster: the token must
 * belong to a completed wrapped whose share-safe projection lists the rating
 * key among its top movies or shows. Using the projection keeps a share link
 * from confirming titles the share page hides (the stored lists hold up to
 * 10, the projection 5), and keeps the Plex token server-side while
 * preventing library enumeration through a leaked share link.
 */
async function shareTokenAllowsRatingKey(
  token: string,
  ratingKey: string
): Promise<boolean> {
  const wrapped = await prisma.plexWrapped.findUnique({
    where: { shareToken: token },
    select: { year: true, status: true, summary: true, archetype: true, data: true },
  })
  if (!wrapped || wrapped.status !== "completed") {
    return false
  }

  try {
    const { topMovies, topShows } = toShareSafeV2(wrapped, { name: null })
    return [...topMovies, ...topShows].some((title) => title.ratingKey === ratingKey)
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
 * Responses are cacheable — poster art is effectively immutable per key —
 * and carry noindex, since art reached through a share link is public but not
 * meant for search results.
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
        "X-Robots-Tag": "noindex",
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
