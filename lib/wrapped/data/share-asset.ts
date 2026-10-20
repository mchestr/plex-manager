/**
 * A v3 share link looked up by its asset key, the separate 16-byte key that
 * card and poster URLs carry instead of the token (design 6.2). A key is live
 * only while its `RewindShare` is neither revoked nor expired and its Rewind
 * is a completed v3 row; a rotated link's old row is revoked, so its key dies
 * with it.
 *
 * @module lib/wrapped/data/share-asset
 */

import "server-only"

import { prisma } from "@/lib/prisma"
import { parseStoredRewind, readWrappedStatus } from "@/lib/wrapped/data/parse-stored"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"
import { loadShareContext } from "@/lib/wrapped/data/share-context"
import { toShareSafe } from "@/lib/wrapped/data/share-safe"
import { assetKeySchema, ShareOptions } from "@/lib/wrapped/data/share-safe-schema"

export interface LiveShare {
  shareId: string
  rewind: RewindDataV3
  options: ShareOptions
  owner: { userId: string; year: number }
}

/** The live share behind `assetKey`, or null for a malformed, unknown, revoked or expired key. */
export async function findLiveShare(assetKey: string, now: Date = new Date()): Promise<LiveShare | null> {
  if (!assetKeySchema.safeParse(assetKey).success) return null
  const share = await prisma.rewindShare.findUnique({
    where: { assetKey },
    select: {
      id: true,
      pages: true,
      signed: true,
      includeArt: true,
      dailyDetail: true,
      cardFacts: true,
      expiresAt: true,
      revokedAt: true,
      wrapped: { select: { id: true, userId: true, year: true, status: true, data: true } },
    },
  })
  if (!share || share.revokedAt || (share.expiresAt && share.expiresAt <= now)) return null
  if (readWrappedStatus(share.wrapped.status, share.wrapped.id) !== "completed") return null
  const stored = parseStoredRewind(share.wrapped.data)
  const options = ShareOptions.safeParse({
    pages: share.pages,
    signed: share.signed,
    includeArt: share.includeArt,
    dailyDetail: share.dailyDetail,
    cardFacts: share.cardFacts,
  })
  if (stored.version !== 3 || !options.success) return null
  return { shareId: share.id, rewind: stored.data, options: options.data, owner: { userId: share.wrapped.userId, year: share.wrapped.year } }
}

/**
 * Whether the share behind `assetKey` publishes the poster `ratingKey`: only
 * art keys its projection publishes, so a hidden title or art switched off
 * stops serving at once.
 */
export async function assetKeyAllowsRatingKey(assetKey: string, ratingKey: string): Promise<boolean> {
  const live = await findLiveShare(assetKey)
  if (!live) return false
  const shared = toShareSafe(live.rewind, live.options, await loadShareContext(live.owner))
  return shared.pages.some((page) => page.art?.some((art) => art.ratingKey === ratingKey))
}
