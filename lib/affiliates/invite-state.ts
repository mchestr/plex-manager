/**
 * Whether an affiliate invite can be used now, and if not, why. The invite
 * page and the redemption transaction both ask this, so a code the page shows
 * as usable is one the redemption accepts.
 *
 * An affiliate invite can be used while all of these are true:
 *
 * | Check | Refusal |
 * |---|---|
 * | the switch reads as on (`readAffiliateSettings`) | `switch_off` |
 * | the affiliate did not cancel it | `cancelled` |
 * | nobody joined with it | `used` |
 * | it has not expired | `expired` |
 * | it holds at least one library | `no_libraries` |
 * | its affiliate exists, is not disabled and is approved | `not_affiliate` |
 *
 * A paid affiliate's invites still work: only new invites wait.
 *
 * @module lib/affiliates/invite-state
 */

import "server-only"

import { readAffiliateSettings } from "@/lib/affiliates/settings"
import type { Prisma } from "@/lib/generated/prisma/client"
import { parsePlexLibrarySectionIds } from "@/lib/invites/plex-library-ids"
import type { PrismaTransactionClient } from "@/lib/prisma"

export type AffiliateInviteRefusal = "switch_off" | "cancelled" | "used" | "expired" | "no_libraries" | "not_affiliate"

/** The invite fields {@link affiliateInviteRefusal} reads. */
const affiliateInviteStateSelect = {
  affiliateUserId: true,
  cancelledAt: true,
  joinedAt: true,
  expiresAt: true,
  useCount: true,
  maxUses: true,
  librarySectionIds: true,
} as const satisfies Prisma.InviteSelect

type AffiliateInviteState = Prisma.InviteGetPayload<{ select: typeof affiliateInviteStateSelect }>

async function isApprovedAffiliate(db: PrismaTransactionClient, userId: string | null): Promise<boolean> {
  if (!userId) return false
  const user = await db.user.findUnique({ where: { id: userId }, select: { disabledAt: true } })
  if (!user || user.disabledAt) return false
  const application = await db.affiliateApplication.findUnique({ where: { openUserId: userId }, select: { status: true } })
  return application?.status === "APPROVED"
}

/**
 * Why the affiliate invite cannot be used at `now`, or null when it can. Pass
 * the transaction client from inside the redemption transaction, so a
 * concurrent revoke or switch-off conflicts with the redemption.
 */
export async function affiliateInviteRefusal(
  db: PrismaTransactionClient,
  invite: AffiliateInviteState,
  now: Date
): Promise<AffiliateInviteRefusal | null> {
  if (!(await readAffiliateSettings(db)).on) return "switch_off"
  if (invite.cancelledAt) return "cancelled"
  if (invite.joinedAt || invite.useCount >= invite.maxUses) return "used"
  if (!invite.expiresAt || invite.expiresAt < now) return "expired"
  if (!parsePlexLibrarySectionIds(invite.librarySectionIds)?.length) return "no_libraries"
  if (!(await isApprovedAffiliate(db, invite.affiliateUserId))) return "not_affiliate"
  return null
}
