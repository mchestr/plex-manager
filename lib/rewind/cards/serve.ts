/**
 * What both card routes do once a request is authorised (design 6.4): project
 * the Rewind, read the disk cache, and only on a miss spend a Redis limit
 * point and render. Every response sends `X-Robots-Tag: noindex`.
 *
 * Order matters: authorise (the caller), then the cache, then the limiter,
 * then the render, so cache hits never spend a point and a revoked link is
 * refused before its PNG on disk is looked at.
 *
 * @module lib/rewind/cards/serve
 */

import "server-only"

import { NextResponse } from "next/server"

import { consume, type LimitName } from "@/lib/security/rate-limit"
import { createLogger } from "@/lib/utils/logger"
import { parseStoredRewind, readWrappedStatus } from "@/lib/wrapped/data/parse-stored"
import { cardInput, toShareSafe, type CardInput, type CardSize } from "@/lib/wrapped/data/share-safe"
import type { ShareContext, ShareOptions, SharePageType } from "@/lib/wrapped/data/share-safe-schema"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"

import { cardCacheKey, readCachedCard, writeCachedCard } from "./cache"
import { hasCard } from "./index"
import { renderCardPng } from "./render"

const logger = createLogger("REWIND_CARDS")

const NOINDEX = { "X-Robots-Tag": "noindex" } as const
const NO_STORE = { ...NOINDEX, "Cache-Control": "private, no-store" }

/** The one answer for anything unauthorised, unknown or unpublished. */
export function cardNotFound(): NextResponse {
  return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404, headers: NO_STORE })
}

/** A 500 that says nothing, with noindex. */
export function cardError(): NextResponse {
  return NextResponse.json({ error: "Could not draw the card", code: "INTERNAL_ERROR" }, { status: 500, headers: NO_STORE })
}

/** The stored v3 Rewind of a completed row, or null for anything else. */
export function completedV3(row: { id: string; status: string; data: string | null }): RewindDataV3 | null {
  if (readWrappedStatus(row.status, row.id) !== "completed") return null
  const stored = parseStoredRewind(row.data)
  return stored.version === 3 ? stored.data : null
}

/** A 400 for a malformed request, with noindex. */
export function cardBadRequest(message: string): NextResponse {
  return NextResponse.json({ error: message, code: "VALIDATION_ERROR" }, { status: 400, headers: NO_STORE })
}

function png(body: Buffer, cacheControl: string): NextResponse {
  return new NextResponse(new Uint8Array(body), {
    headers: { "Content-Type": "image/png", "Cache-Control": cacheControl, ...NOINDEX },
  })
}

export interface ServeCardRequest {
  rewind: RewindDataV3
  options: ShareOptions
  ctx: ShareContext
  page: SharePageType
  size: CardSize
  /** The limit a render spends: `rw:card:session` by user id, `rw:card:share` by share id. */
  limit: { name: Extract<LimitName, `rw:card:${string}`>; subject: string }
  cacheControl: string
}

/** The card input of an authorised request, or null when the page is not published or has no card. */
export function projectCard({ rewind, options, ctx, page, size }: Omit<ServeCardRequest, "limit" | "cacheControl">): CardInput | null {
  if (!hasCard(page)) return null
  const shared = toShareSafe(rewind, options, ctx)
  return cardInput(shared, page, size, { factsHash: rewind.factsHash, options, ctx })
}

/** Serves an authorised card request: cache, then limiter, then render. */
export async function serveCard(request: ServeCardRequest): Promise<NextResponse> {
  const input = projectCard(request)
  if (!input) return cardNotFound()

  const key = cardCacheKey(input)
  const cached = await readCachedCard(key)
  if (cached) return png(cached, request.cacheControl)

  const limit = await consume(request.limit.name, request.limit.subject)
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMIT_EXCEEDED", retryAfter: limit.retryAfterSec },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfterSec) } }
    )
  }

  const rendered = await renderCardPng(input)
  if (!rendered) return cardNotFound()
  await writeCachedCard(key, rendered).catch((error: unknown) => logger.warn("Could not cache a card", { error: String(error) }))
  return png(rendered, request.cacheControl)
}
