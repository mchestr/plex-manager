/**
 * Whether a member can have a Rewind at all (FR-48, RWP-08).
 *
 * ## Overview
 *
 * A Rewind is built from Tautulli's Plex watch history, so a member without a
 * Plex identity (a Jellyfin-only sign-in) or without a row in Tautulli's user
 * list can never get one. The dashboard card used to offer them a Generate
 * button that always failed and left a failed row behind. The card and
 * `generatePlexWrapped` now ask this module first.
 *
 * Eligibility is keyed on `plexUserId`, never on `primaryAuthService`, so a
 * member who signs in with Jellyfin but has a linked Plex identity is eligible.
 *
 * ## Process
 *
 * 1. No `plexUserId`: `NO_PLEX_IDENTITY`, with no database or network call.
 * 2. A cached answer for this member and `plexUserId`, younger than
 *    {@link ELIGIBILITY_CACHE_MS}, is returned as is.
 * 3. No active Tautulli: eligible, so generation reports the missing
 *    configuration itself.
 * 4. `findTautulliUser` (the P0.9 lookup, by plex.tv account ID only): a match
 *    is eligible and a miss is `NO_TAUTULLI_MATCH`. Both are cached.
 *
 * ## Special cases
 *
 * - A Tautulli error fails open as eligible and is not cached: generation then
 *   reports its own error, and the next check asks Tautulli again.
 * - The cache lives in this process. A changed `plexUserId` misses it, and a
 *   member an admin has just added to Tautulli waits at most 10 minutes.
 * - `generatePlexWrapped` runs this check before it spends any rate-limit
 *   point, so the cache is also what keeps a member's repeated calls from
 *   reaching Tautulli each time.
 *
 * @module lib/wrapped/eligibility
 */

import "server-only"

import { findTautulliUser } from "@/lib/connections/tautulli"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("REWIND_ELIGIBILITY")

/** Why a member cannot have a Rewind. */
export type RewindIneligibleReason = "NO_PLEX_IDENTITY" | "NO_TAUTULLI_MATCH"

export type RewindEligibility =
  | { eligible: true }
  | { eligible: false; reason: RewindIneligibleReason }

/** How long one member's Tautulli answer is reused. */
export const ELIGIBILITY_CACHE_MS = 10 * 60 * 1000

const ELIGIBLE: RewindEligibility = { eligible: true }

interface CachedEligibility {
  plexUserId: string
  result: RewindEligibility
  expiresAt: number
}

/** One entry per member id, so the map is bounded by the member count. */
const cachedByMember = new Map<string, CachedEligibility>()

/**
 * Decide whether `user` can have a Rewind.
 *
 * @param user - the member's id and plex.tv account ID (`User.plexUserId`)
 * @returns `{ eligible: true }`, or the reason the member cannot have one
 *
 * @example
 * ```ts
 * await getRewindEligibility({ id: "jellyfin-member", plexUserId: null })
 * // { eligible: false, reason: "NO_PLEX_IDENTITY" }, without asking Tautulli
 * ```
 */
export async function getRewindEligibility(user: {
  id: string
  plexUserId: string | null
}): Promise<RewindEligibility> {
  const { id, plexUserId } = user
  if (!plexUserId) {
    return { eligible: false, reason: "NO_PLEX_IDENTITY" }
  }

  const now = Date.now()
  const cached = cachedByMember.get(id)
  if (cached && cached.plexUserId === plexUserId && cached.expiresAt > now) {
    return cached.result
  }

  const tautulli = await prisma.tautulli.findFirst({
    where: { isActive: true },
    select: { url: true, apiKey: true },
  })
  if (!tautulli) {
    return ELIGIBLE
  }

  const lookup = await findTautulliUser(tautulli, { plexUserId })
  if (!lookup.ok && lookup.code === "TAUTULLI_ERROR") {
    logger.debug("Tautulli lookup failed; treating the member as eligible", { userId: id })
    return ELIGIBLE
  }

  const result: RewindEligibility = lookup.ok ? ELIGIBLE : { eligible: false, reason: "NO_TAUTULLI_MATCH" }
  cachedByMember.set(id, { plexUserId, result, expiresAt: now + ELIGIBILITY_CACHE_MS })
  return result
}
