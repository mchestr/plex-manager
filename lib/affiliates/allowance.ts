/**
 * How many affiliate invites a member may hold, and when a place comes back.
 * Pure, so the make-invite transaction, the Invites page and their tests
 * share it.
 *
 * ## Held invites
 *
 * An affiliate invite holds a place while it is one of these:
 *
 * | Invite | Holds a place until |
 * |---|---|
 * | joined (`joinedAt` set) | 30 days after the join |
 * | open (not joined, not cancelled, not expired) | it expires (48 hours) or is cancelled |
 *
 * Free places are the allowance (`affiliateAllowance`) less the held
 * invites. The server cap (`Config.affiliateServerCap`) counts the held
 * invites of every affiliate; admin invites never count. A null cap means no
 * cap, and 0 stops every new affiliate invite. Open invites keep their place
 * under a lowered allowance or cap.
 *
 * @module lib/affiliates/allowance
 */

import type { Prisma } from "@/lib/generated/prisma/client"

const DAY_MS = 24 * 60 * 60 * 1000
const WINDOW_MS = 30 * DAY_MS

/** How long an affiliate invite can be used. */
export const AFFILIATE_INVITE_LIFE_MS = 48 * 60 * 60 * 1000

/** The affiliate invites that hold a place at `now`, for every affiliate. Add `affiliateUserId` for one. */
export function heldInvitesWhere(now: Date): Prisma.InviteWhereInput {
  return {
    kind: "AFFILIATE",
    OR: [{ joinedAt: { gte: new Date(now.getTime() - WINDOW_MS) } }, { joinedAt: null, cancelledAt: null, expiresAt: { gt: now } }],
  }
}

export interface HeldInvite {
  joinedAt: Date | null
  expiresAt: Date | null
}

/**
 * The date one more place is sure to be free under `limit` (an allowance or
 * the server cap): the join, 30 days on, that brings the held count back
 * under it. Open invites give no date: one that someone joins with holds its
 * place for 30 more days. Null when `limit` is 0 or the joins alone cannot
 * bring the count under it.
 */
export function nextPlaceBack(held: readonly HeldInvite[], limit: number): Date | null {
  if (limit <= 0) return null
  const needed = Math.max(1, held.length - limit + 1)
  const backs = held.flatMap((invite) => (invite.joinedAt ? [invite.joinedAt.getTime() + WINDOW_MS] : [])).sort((a, b) => a - b)
  return backs.length >= needed ? new Date(backs[needed - 1]!) : null
}

/** Free places: the allowance less the held invites, never below 0. */
export function freePlaces(allowance: number, held: number): number {
  return Math.max(0, allowance - held)
}

/** Whether the server cap stops a new affiliate invite. */
export function serverCapReached(cap: number | null, serverHeld: number): boolean {
  return cap !== null && serverHeld >= cap
}
