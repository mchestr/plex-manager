/**
 * Looks up a shared Rewind by its share token, straight from the database
 * (P0.11, extended for v3 links in P7.5).
 *
 * The share page and its metadata read through this helper; React `cache()`
 * makes them share one lookup per request. It follows the rule in
 * `lib/wrapped/data/share-token.ts`:
 *
 * - `v3`: a live `RewindShare` found by `sha256(token)`, projected with
 *   `toShareSafe()` and the context `loadShareContext()` reads now, so a
 *   hidden title or a flag change leaves the page at once;
 * - `v2`: a surviving `PlexWrapped.shareToken`, projected with
 *   `toShareSafeV2`, only until the 2026 season closes;
 * - `null` for everything else, and for every token while
 *   `Config.rewindPublicLinks` is off.
 *
 * The ids in the result stay on the server: the page uses them for the visit
 * count and the owner check, and renders only `share`.
 *
 * @module lib/wrapped/data/get-share-safe
 */

import "server-only"

import { cache } from "react"

import { prisma } from "@/lib/prisma"
import { shareTokenSchema } from "@/lib/validations/params"
import { readWrappedStatus } from "@/lib/wrapped/data/parse-stored"
import { findLiveShareByTokenHash } from "@/lib/wrapped/data/share-asset"
import { loadShareContext } from "@/lib/wrapped/data/share-context"
import { toShareSafe } from "@/lib/wrapped/data/share-safe"
import type { ShareSafeRewindV3 } from "@/lib/wrapped/data/share-safe-schema"
import { toShareSafeV2, type ShareSafeRewindV2 } from "@/lib/wrapped/data/share-safe-v2"
import { hashShareToken, publicLinksOn, v2LinksOpen } from "@/lib/wrapped/data/share-token"

interface ShareLookupV3 {
  kind: "v3"
  /** The public projection, the only part a response may carry. */
  share: ShareSafeRewindV3
  shareId: string
  wrappedId: string
  ownerUserId: string
  /** The card and poster URLs carry it, never the token. */
  assetKey: string
  year: number
  expiresAt: Date | null
}

interface ShareLookupV2 {
  kind: "v2"
  share: ShareSafeRewindV2
  wrappedId: string
  ownerUserId: string
  year: number
}

export type ShareSafeLookup = ShareLookupV3 | ShareLookupV2

/**
 * The share-safe projection of what `token` shares, or `null` when it shares
 * nothing. A token that is not 43 base64url characters returns `null` without
 * a database call.
 *
 * @throws When a database call fails, or the stored row cannot be projected
 */
export const getShareSafeRewind = cache(async (token: string): Promise<ShareSafeLookup | null> => {
  if (!shareTokenSchema.safeParse(token).success) return null
  if (!(await publicLinksOn())) return null

  const live = await findLiveShareByTokenHash(hashShareToken(token))
  if (live) {
    return {
      kind: "v3",
      share: toShareSafe(live.rewind, live.options, await loadShareContext(live.owner)),
      shareId: live.shareId,
      wrappedId: live.wrappedId,
      ownerUserId: live.owner.userId,
      assetKey: live.assetKey,
      year: live.owner.year,
      expiresAt: live.expiresAt,
    }
  }

  const wrapped = await prisma.plexWrapped.findUnique({
    where: { shareToken: token },
    select: {
      id: true,
      userId: true,
      year: true,
      status: true,
      summary: true,
      archetype: true,
      data: true,
      user: { select: { name: true } },
    },
  })
  if (!wrapped || readWrappedStatus(wrapped.status, wrapped.id) !== "completed") return null
  if (!(await v2LinksOpen())) return null

  return {
    kind: "v2",
    share: toShareSafeV2(wrapped, wrapped.user),
    wrappedId: wrapped.id,
    ownerUserId: wrapped.userId,
    year: wrapped.year,
  }
})
