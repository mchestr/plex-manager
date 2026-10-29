/**
 * Member removal's affiliate rows (see `docs/privacy.md`). The member's
 * `AffiliateApplication` rows go with the `User` row by cascade. The invite
 * links are `SetNull`, so an affiliate invite outlives either end:
 *
 * - an UNUSED affiliate invite the member made is deleted here, before the
 *   `User` row goes;
 * - a USED one stays as the invitee's join record, and the cascade sets its
 *   `affiliateUserId` to null;
 * - the invite the member joined with stays, and the cascade sets its
 *   `joinedUserId` to null, so only its date is left.
 *
 * @module lib/members/erase-affiliates
 */

import "server-only"

import { prisma, type PrismaTransactionClient } from "@/lib/prisma"

/** Affiliate rows removal deletes, or keeps without the member's id. */
export type AffiliateCounts = Record<"affiliateApplication" | "affiliateInvite" | "affiliateInviteKept" | "affiliateJoinKept", number>

const unusedInvites = (userId: string) => ({ kind: "AFFILIATE" as const, affiliateUserId: userId, joinedAt: null })

/** How many affiliate rows removal deletes or keeps. */
export async function countAffiliateRows(userId: string): Promise<AffiliateCounts> {
  const [affiliateApplication, affiliateInvite, affiliateInviteKept, affiliateJoinKept] = await Promise.all([
    prisma.affiliateApplication.count({ where: { userId } }),
    prisma.invite.count({ where: unusedInvites(userId) }),
    prisma.invite.count({ where: { kind: "AFFILIATE", affiliateUserId: userId, joinedAt: { not: null } } }),
    prisma.invite.count({ where: { joinedUserId: userId } }),
  ])
  return { affiliateApplication, affiliateInvite, affiliateInviteKept, affiliateJoinKept }
}

/** Deletes the member's unused affiliate invites; the foreign key would only set their inviter to null. */
export async function deleteUnusedAffiliateInvites(tx: PrismaTransactionClient, userId: string): Promise<void> {
  await tx.invite.deleteMany({ where: unusedInvites(userId) })
}
