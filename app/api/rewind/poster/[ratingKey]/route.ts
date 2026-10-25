import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { parseRouteParams, parseSearchParams, requireEntitlement, withRequestContext } from "@/lib/actions/route"
import { rewindInks, type InkName } from "@/lib/design/tokens"
import { prisma } from "@/lib/prisma"
import type { TonePair } from "@/lib/rewind/media/tone"
import { posterCachePath, readCachedPoster, writeCachedPoster } from "@/lib/rewind/poster/disk-cache"
import { fetchPlexPoster } from "@/lib/rewind/poster/fetch"
import { renderPoster } from "@/lib/rewind/poster/image"
import { createSafeError, ErrorCode, getStatusCode, logError } from "@/lib/security/error-handler"
import { limitRequest } from "@/lib/security/rate-limit"
import { ratingKeySchema, shareTokenSchema } from "@/lib/validations/params"
import { assetKeyAllowsRatingKey } from "@/lib/wrapped/data/share-asset"
import { assetKeySchema } from "@/lib/wrapped/data/share-safe-schema"
import { isKnownPosterMiss, rememberPosterMiss, remainingMs, resolveSessionPosterAccess } from "@/lib/wrapped/poster-access"
import { shareTokenAllowsRatingKey } from "@/lib/wrapped/poster-keys"
import { getSession } from "@/lib/data/session"

const INKS = Object.keys(rewindInks) as [InkName, ...InkName[]]
const InkSchema = z.enum(INKS)
/** `<spot>.<field>`: two Rewind inks. */
const PairSchema = z
  .string()
  .regex(/^[a-z]+\.[a-z]+$/)
  .transform((value) => value.split("."))
  .pipe(z.tuple([InkSchema, InkSchema]))
  .transform(([spot, field]): TonePair => ({ spot, field }))

const paramsSchema = z.object({ ratingKey: ratingKeySchema })
const querySchema = z.object({
  w: z.enum(["96", "160", "240", "480"]).default("480").transform(Number),
  tone: z.union([z.literal("none"), PairSchema]).default("none"),
  clash: PairSchema.optional(),
  share: shareTokenSchema.optional(),
  /** A v3 share's asset key (P5.10), never its token. */
  s: assetKeySchema.optional(),
})

/** Every upstream call of one request (lookups and the poster) shares this budget. */
const UPSTREAM_TIMEOUT_MS = 3000
/** A failed fetch with less time than this says little about the poster, so it is not remembered as a miss. */
const MIN_MISS_TIMEOUT_MS = 2000

/** Every poster, for sessions and shares alike: never `public`, so no shared cache serves it after a link stops (SEC-21). */
const POSTER_CACHE_CONTROL = "private, max-age=31536000, immutable"
const NOT_FOUND_CACHE_CONTROL = "private, max-age=60"
/** Errors (400, 401, 500): never stored. */
const ERROR_CACHE_CONTROL = "private, no-store"

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

function posterResponse(body: Buffer, servedAs: "private" | "share") {
  const headers: Record<string, string> = { "Content-Type": "image/webp", "Cache-Control": POSTER_CACHE_CONTROL }
  if (servedAs === "share") headers["X-Robots-Tag"] = "noindex"
  return new NextResponse(new Uint8Array(body), { headers })
}

/**
 * GET /api/rewind/poster/[ratingKey]?w=96|160|240|480&tone=none|<spot>.<field>&clash=<spot>.<field>&share=<token>
 *
 * Poster art from the active Plex server as sized WebP (Rewind design 5.8),
 * so the Plex token never reaches the client.
 *
 * - **Access** (P0.16, SEC-21): sessions may fetch only keys
 *   `resolveSessionPosterAccess` allows (admin or owner, the viewer's own
 *   Rewind, v3 page data included, a covering share token, or a library
 *   section shared with the viewer); anything else is a 404. A signed-out
 *   request needs a share token covering the key (401 otherwise); a session
 *   below `read` entitlement is treated as signed out, with a 403 when it
 *   brings no token. Share responses send `X-Robots-Tag: noindex`.
 * - **Tone**: `none` is full colour (WebP 76); a pair of inks is the
 *   duotone (WebP 72). A hero's `clash` pair is served instead of full
 *   colour when the art would clash with its page.
 * - **Asset keys** (`s`, a v3 share's): serve only the art that share's
 *   projection publishes, as a share. A key that does not cover the poster
 *   leaves a signed-in viewer to their own access checks below.
 * - **Rate limits**: a share link spends a `poster` point before its token
 *   lookup; a session spends a `poster:access` point (2000 per 15 minutes)
 *   before its access checks, and a cache miss spends a `poster` point.
 * - **Disk cache**: a served variant is kept under `REWIND_CACHE_DIR`, and a
 *   hit is answered before the `poster` limit, with
 *   `private, max-age=31536000, immutable` like every poster.
 * - **Upstream calls** (access lookups, then the poster) share one 3 s
 *   deadline. Misses (Plex 404, timeout, network error, a denied key) are
 *   404s cached privately for 60 s, and Plex misses are remembered for 5
 *   minutes so a page falls back to its title cards at once.
 * - **Errors** (400, 401, 500) send `private, no-store`.
 */
async function handleGet(request: NextRequest, context: { params: Promise<{ ratingKey: string }> }) {
  try {
    const params = parseRouteParams(paramsSchema, await context.params, { "Cache-Control": ERROR_CACHE_CONTROL })
    if (!params.ok) return params.response
    const { ratingKey } = params.data

    const query = parseSearchParams(querySchema, request.nextUrl, { "Cache-Control": ERROR_CACHE_CONTROL })
    if (!query.ok) return query.response
    const { w, tone, clash } = query.data
    const shareToken = query.data.share ?? null
    const assetKey = query.data.s ?? null

    let session = await getSession()
    if (session) {
      // A lapsed member keeps their own Rewind's posters (FR-51); one without
      // even that is answered as signed out, so a covering share link still works.
      const entitled = await requireEntitlement(session, "read", { headers: { "Cache-Control": ERROR_CACHE_CONTROL } })
      if (!entitled.ok) {
        if (!shareToken && !assetKey) return entitled.response
        session = null
      }
    }
    // A share link is limited before its token lookup, so an unknown token costs
    // a request a point instead of an unlimited database read.
    // A v3 share's asset key covers only the art its projection publishes, for
    // any viewer, signed in or not, and is answered as a share.
    let limited = false
    if (assetKey || !session) {
      if (!assetKey && !shareToken) return errorResponse(ErrorCode.UNAUTHORIZED, "Authentication required")
      const rateLimitResponse = await limitRequest("poster", request)
      if (rateLimitResponse) return rateLimitResponse
      limited = true
      const assetAllowed = assetKey ? await assetKeyAllowsRatingKey(assetKey, ratingKey) : false
      if (assetAllowed) session = null
      if (!session && !assetAllowed && !(shareToken && (await shareTokenAllowsRatingKey(shareToken, ratingKey)))) {
        return errorResponse(ErrorCode.UNAUTHORIZED, "Authentication required")
      }
    }

    if (session) {
      const rateLimitResponse = await limitRequest("poster:access", request)
      if (rateLimitResponse) return rateLimitResponse
    }

    // A session sees the same 404 for a denied key and a known miss, so answering
    // from the negative cache before the access check leaks nothing.
    if (isKnownPosterMiss(ratingKey)) return posterNotFound()

    const plexServer = await prisma.plexServer.findFirst({
      where: { isActive: true },
      select: { url: true, token: true, adminPlexUserId: true },
    })
    if (!plexServer) return posterNotFound()

    const deadline = Date.now() + UPSTREAM_TIMEOUT_MS
    let servedAs: "private" | "share" = "share"
    if (session) {
      const access = await resolveSessionPosterAccess({ id: session.user.id, isAdmin: session.user.isAdmin }, plexServer, ratingKey, { shareToken, deadline })
      if (access === "deny") return posterNotFound()
      servedAs = access
    }

    const toneKey = tone === "none" ? (clash ? `none~${clash.spot}.${clash.field}` : "none") : `${tone.spot}.${tone.field}`
    const file = posterCachePath(ratingKey, toneKey, w)
    const cached = await readCachedPoster(file)
    if (cached) return posterResponse(cached, servedAs)

    if (!limited) {
      const rateLimitResponse = await limitRequest("poster", request)
      if (rateLimitResponse) return rateLimitResponse
    }

    const timeoutMs = remainingMs(deadline)
    if (timeoutMs === 0) return posterNotFound()
    const poster = await fetchPlexPoster(plexServer, ratingKey, w, timeoutMs)
    if (poster.status !== "ok") {
      if (poster.status === "missing" || timeoutMs >= MIN_MISS_TIMEOUT_MS) rememberPosterMiss(ratingKey)
      return posterNotFound()
    }

    let body: Buffer
    try {
      body = await renderPoster(poster.body, { w, tone: tone === "none" ? null : tone, clash: clash ?? null })
    } catch {
      // Plex answered with something that is not an image
      rememberPosterMiss(ratingKey)
      return posterNotFound()
    }
    await writeCachedPoster(file, body)
    return posterResponse(body, servedAs)
  } catch (error) {
    logError("REWIND_POSTER_API", error)
    return errorResponse(ErrorCode.INTERNAL_ERROR, "Failed to fetch poster")
  }
}

export const GET = withRequestContext(handleGet)
