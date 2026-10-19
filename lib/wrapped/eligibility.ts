/**
 * Whether a member can have a Rewind at all (FR-48, RWP-08).
 *
 * ## Overview
 *
 * A Rewind is built from Tautulli's Plex watch history, so a member without a
 * Plex identity (a Jellyfin-only sign-in) or without a row in Tautulli's user
 * list can never get one. The dashboard card used to offer them a Generate
 * button that always failed and left a failed row behind. The card and
 * `requestRewindGeneration` now ask this module first.
 *
 * Eligibility is keyed on `plexUserId`, never on `primaryAuthService`, so a
 * member who signs in with Jellyfin but has a linked Plex identity is eligible.
 *
 * ## Process
 *
 * 1. No `plexUserId`: `NO_PLEX_IDENTITY`, with no database or network call.
 * 2. A cached answer for this member and `plexUserId` that has not expired is
 *    returned as is.
 * 3. No active Tautulli: eligible, so generation reports the missing
 *    configuration itself.
 * 4. `findTautulliUser` (the P0.9 lookup, by plex.tv account ID only): a match
 *    is eligible and a miss is `NO_TAUTULLI_MATCH`. Both are cached for
 *    {@link ELIGIBILITY_CACHE_MS}.
 *
 * ## Special cases
 *
 * - A Tautulli error, including `get_users`'s 10-second timeout, fails open as
 *   eligible: generation then reports its own error. That answer is cached for
 *   {@link FAIL_OPEN_CACHE_MS} only, so the member's match is found soon after
 *   Tautulli recovers.
 * - The cache lives in this process (`createTtlCache`, at most 10,000
 *   members). A changed `plexUserId` misses it, and a member an admin has
 *   just added to Tautulli waits at most 10 minutes.
 * - `requestRewindGeneration` runs this check before it spends any rate-limit
 *   point. The cache, including the fail-open entry, is what keeps a member's
 *   repeated calls (a rate-limited member's among them) from reaching
 *   Tautulli each time, and the timeout bounds the call that does.
 *
 * @module lib/wrapped/eligibility
 */

import "server-only"

import { findTautulliUser, type TautulliUserRow } from "@/lib/connections/tautulli"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { createTtlCache } from "@/lib/utils/ttl-cache"

const logger = createLogger("REWIND_ELIGIBILITY")

/** Why a member cannot have a Rewind. */
type RewindIneligibleReason = "NO_PLEX_IDENTITY" | "NO_TAUTULLI_MATCH"

export type RewindEligibility =
  | { eligible: true }
  | { eligible: false; reason: RewindIneligibleReason }

/**
 * {@link RewindEligibility} for a generation run. `tautulliUser` is the
 * member's row when this check has just fetched it, so the run can read the
 * member's history without a second `get_users`. It is null for a cached or
 * fail-open answer: a cached row may be 10 minutes old, and the run's own
 * lookup then decides.
 */
export type RewindEligibilityCheck =
  | { eligible: true; tautulliUser: TautulliUserRow | null }
  | { eligible: false; reason: RewindIneligibleReason }

/**
 * How long one member's Tautulli answer is reused.
 *
 * @internal
 */
export const ELIGIBILITY_CACHE_MS = 10 * 60 * 1000

/**
 * How long a fail-open answer is reused while Tautulli errors or hangs.
 *
 * @internal
 */
export const FAIL_OPEN_CACHE_MS = 60 * 1000

const ELIGIBLE: RewindEligibility = { eligible: true }
const ELIGIBLE_UNMATCHED: RewindEligibilityCheck = { eligible: true, tautulliUser: null }

interface CachedEligibility {
  plexUserId: string
  result: RewindEligibility
}

/** One entry per member id. */
const cachedByMember = createTtlCache<string, CachedEligibility>({
  ttlMs: ELIGIBILITY_CACHE_MS,
  maxEntries: 10_000,
})

/**
 * Decide whether `user` can have a Rewind, and return the member's Tautulli
 * row when the decision fetched it just now. The generation actions use this;
 * pages use {@link getRewindEligibility}.
 *
 * @param user - the member's id and plex.tv account ID (`User.plexUserId`)
 */
export async function checkRewindEligibility(user: {
  id: string
  plexUserId: string | null
}): Promise<RewindEligibilityCheck> {
  const { id, plexUserId } = user
  if (!plexUserId) {
    return { eligible: false, reason: "NO_PLEX_IDENTITY" }
  }

  const cached = cachedByMember.get(id)
  if (cached && cached.plexUserId === plexUserId) {
    const { result } = cached
    return result.eligible ? ELIGIBLE_UNMATCHED : result
  }

  const tautulli = await prisma.tautulli.findFirst({
    where: { isActive: true },
    select: { url: true, apiKey: true },
  })
  if (!tautulli) {
    return ELIGIBLE_UNMATCHED
  }

  const lookup = await findTautulliUser(tautulli, { plexUserId })
  if (!lookup.ok && lookup.code === "TAUTULLI_ERROR") {
    logger.debug("Tautulli lookup failed; treating the member as eligible", { userId: id })
    cachedByMember.set(id, { plexUserId, result: ELIGIBLE }, FAIL_OPEN_CACHE_MS)
    return ELIGIBLE_UNMATCHED
  }

  if (lookup.ok) {
    cachedByMember.set(id, { plexUserId, result: ELIGIBLE })
    return { eligible: true, tautulliUser: lookup.user }
  }
  const miss = { eligible: false, reason: "NO_TAUTULLI_MATCH" } as const
  cachedByMember.set(id, { plexUserId, result: miss })
  return miss
}

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
  const check = await checkRewindEligibility(user)
  return check.eligible ? ELIGIBLE : check
}
