/**
 * Ending a member's affiliate status: a revoke (an admin's decision, with a
 * 30-day wait before they may apply again), or the end that follows a loss
 * of access (no wait).
 *
 * | Path | PENDING | APPROVED |
 * |---|---|---|
 * | revoke | - | REVOKED, with the reason the member sees |
 * | disable, removal, unshare, the Stripe access revoke | CLOSED | ENDED, with an `endCause` |
 *
 * Either way `openUserId` goes to null and the member's open (unexpired)
 * invites are cancelled (`cancelledAt = now`, `label = null`), which frees the places;
 * the people they invited stay members. Each runs in one Serializable
 * transaction, so it conflicts with a parallel redemption or make-invite
 * instead of leaving an open invite behind. Enabling a disabled member again
 * does not bring the status back.
 *
 * @module lib/affiliates/end-status
 */

import "server-only"

import { inSerializable } from "@/lib/db/serializable"
import type { AffiliateEndCause } from "@/lib/generated/prisma/client"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import { AuditEventType, recordAuditEvent } from "@/lib/security/audit-log"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("AFFILIATES")

/** Cancels the affiliate's open invites (not used, not cancelled, not expired); returns how many. */
async function cancelOpenInvites(tx: PrismaTransactionClient, userId: string, now: Date): Promise<number> {
  const { count } = await tx.invite.updateMany({
    where: { kind: "AFFILIATE", affiliateUserId: userId, joinedAt: null, cancelledAt: null, expiresAt: { gt: now } },
    data: { cancelledAt: now, label: null },
  })
  return count
}

export type RevokeResult = { ok: true; invitesCancelled: number } | { ok: false }

/**
 * Revokes an APPROVED application. `ok: false` when it is no longer approved
 * (someone else decided first).
 */
export async function revokeAffiliate(
  applicationId: string,
  { reason, actorId }: { reason: string | null; actorId: string }
): Promise<RevokeResult> {
  return inSerializable(async (tx) => {
    const application = await tx.affiliateApplication.findUnique({ where: { id: applicationId }, select: { userId: true, status: true } })
    if (application?.status !== "APPROVED") return { ok: false } as const
    const now = new Date()
    await tx.affiliateApplication.update({
      where: { id: applicationId },
      data: { status: "REVOKED", reason, endedAt: now, openUserId: null },
    })
    const invitesCancelled = await cancelOpenInvites(tx, application.userId, now)
    await recordAuditEvent(
      AuditEventType.AFFILIATE_REVOKED,
      actorId,
      { targetUserId: application.userId, applicationId, reasonLength: reason?.length ?? 0, invitesCancelled },
      tx
    )
    return { ok: true, invitesCancelled } as const
  })
}

/**
 * The APPROVED application of the affiliate whose invite `inviteeId` joined
 * with, or null. Read it before removing the invitee: removal clears the join
 * record.
 */
export async function inviterApplicationId(inviteeId: string): Promise<string | null> {
  const join = await prisma.invite.findUnique({ where: { joinedUserId: inviteeId }, select: { affiliateUserId: true } })
  if (!join?.affiliateUserId) return null
  const application = await prisma.affiliateApplication.findUnique({ where: { openUserId: join.affiliateUserId }, select: { id: true, status: true } })
  return application?.status === "APPROVED" ? application.id : null
}

/**
 * Revokes the inviter's status after the invitee's disable or removal
 * succeeded, without failing that action: `true` when revoked, `null` when
 * there was nothing to revoke, `false` when the revoke failed.
 */
export async function revokeInviterAfter(
  applicationId: string | null,
  options: { reason: string | null; actorId: string }
): Promise<boolean | null> {
  if (!applicationId) return null
  try {
    return (await revokeAffiliate(applicationId, options)).ok ? true : null
  } catch (error) {
    logger.error("affiliate.inviter_revoke_failed", error, { applicationId })
    return false
  }
}

/**
 * Ends the member's open application after a loss of access: PENDING becomes
 * CLOSED and APPROVED becomes ENDED. Does nothing for a member without one.
 */
export async function endAffiliateStatus(userId: string, cause: AffiliateEndCause, actorId: string): Promise<void> {
  const open = await prisma.affiliateApplication.findUnique({ where: { openUserId: userId }, select: { id: true } })
  if (!open) return
  await inSerializable(async (tx) => {
    const application = await tx.affiliateApplication.findUnique({ where: { openUserId: userId }, select: { id: true, status: true } })
    if (!application) return
    const now = new Date()
    await tx.affiliateApplication.update({
      where: { id: application.id },
      data: { status: application.status === "APPROVED" ? "ENDED" : "CLOSED", endCause: cause, endedAt: now, openUserId: null },
    })
    const invitesCancelled = await cancelOpenInvites(tx, userId, now)
    await recordAuditEvent(
      AuditEventType.AFFILIATE_ENDED,
      actorId,
      { targetUserId: userId, applicationId: application.id, cause, invitesCancelled },
      tx
    )
  })
}
