/**
 * Recording a Plex invite redemption, and undoing that record. The Plex
 * redemption records first and shares the server after, so a share never
 * exists without its user row, its `InviteUsage` and its exemption. When the
 * share fails, {@link undoInviteUse} removes only what the record added. For
 * an affiliate invite the record also links the invitee to the invite
 * (`Invite.joinedUserId`), and the exemption note names a member invite.
 *
 * @module lib/invites/redemption-record
 */

import "server-only"

import { AFFILIATE_INVITE_EXEMPTION, INVITE_EXEMPTION } from "@/lib/invites/redemption"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import { isUniqueEmailConflict } from "@/lib/prisma-errors"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("INVITE")

export interface PlexIdentity {
  id: string
  username: string
  email: string
  thumb?: string | null
}

/** What {@link recordInviteUse} wrote, so that {@link undoInviteUse} can remove it. */
export interface RecordedUse {
  inviteId: string
  userId: string
  usageId: string
  /** The redemption created the row, so the undo deletes it. */
  createdUser: boolean
  /** The redemption set the exemption, so the undo clears it. */
  exempted: boolean
}

type FoundUser = Pick<RecordedUse, "userId" | "createdUser" | "exempted">

type Exemption = typeof INVITE_EXEMPTION

/**
 * Find or create the user for a Plex identity, matched by `plexUserId` only.
 *
 * Matching by email would let a row that claimed the address first (a
 * Jellyfin user can rename themselves to any address) absorb this Plex
 * identity. `email` is the address to store, or null when another row already
 * holds it: a new row is then created without one, and an existing row keeps
 * the email it has.
 */
async function findOrCreateUser(
  tx: PrismaTransactionClient,
  plexUser: PlexIdentity,
  email: string | null,
  exemption: Exemption
): Promise<FoundUser> {
  const user = await tx.user.findUnique({
    where: { plexUserId: plexUser.id },
  })

  if (user) {
    await tx.user.update({
      where: { id: user.id },
      data: {
        ...(email === null ? {} : { email, emailVerified: new Date() }),
        image: plexUser.thumb,
        ...(user.isExempt ? {} : exemption),
      },
    })
    return { userId: user.id, createdUser: false, exempted: !user.isExempt }
  }

  const created = await tx.user.create({
    data: {
      name: plexUser.username,
      email,
      plexUserId: plexUser.id,
      image: plexUser.thumb,
      emailVerified: email === null ? null : new Date(),
      primaryAuthService: "plex",
      ...exemption,
    },
  })
  return { userId: created.id, createdUser: true, exempted: true }
}

/**
 * Record the use of an invite: create or update the user row and add the
 * `InviteUsage`, in one transaction. For an affiliate invite, also link the
 * invitee to the invite.
 *
 * If another row already holds the Plex email, the write is retried once
 * without it, so that row can neither absorb nor block the redeeming user. The
 * retry runs in a new transaction because PostgreSQL aborts a transaction once
 * a statement in it fails.
 */
export async function recordInviteUse(
  inviteId: string,
  plexUser: PlexIdentity,
  { affiliate = false }: { affiliate?: boolean } = {}
): Promise<RecordedUse> {
  const exemption = affiliate ? AFFILIATE_INVITE_EXEMPTION : INVITE_EXEMPTION
  const record = (email: string | null) =>
    prisma.$transaction(async (tx): Promise<RecordedUse> => {
      const user = await findOrCreateUser(tx, plexUser, email, exemption)
      const usage = await tx.inviteUsage.create({
        data: { inviteId, userId: user.userId },
        select: { id: true },
      })
      if (affiliate) {
        await tx.invite.update({ where: { id: inviteId }, data: { joinedUserId: user.userId } })
      }
      return { inviteId, usageId: usage.id, ...user }
    })

  try {
    return await record(plexUser.email)
  } catch (error) {
    if (!isUniqueEmailConflict(error)) {
      throw error
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: plexUser.email },
      select: { id: true },
    })
    logger.warn("invite.email_conflict", {
      existingUserId: existingUser?.id ?? null,
      plexUserId: plexUser.id,
    })
    return record(null)
  }
}

/**
 * Remove what {@link recordInviteUse} wrote, in one transaction: a row it
 * created is deleted (its `InviteUsage` goes with it, and the foreign key
 * clears an affiliate invite's link to it); otherwise the `InviteUsage` and
 * that link are removed and an exemption it set is cleared. The email and
 * image it copied from Plex stay.
 *
 * Returns false, with an `INVITE_ROLLBACK_FAILED` audit entry, if the undo
 * fails. The caller then keeps the invite's use counted.
 */
export async function undoInviteUse(recorded: RecordedUse, reason: string): Promise<boolean> {
  try {
    await prisma.$transaction(async (tx) => {
      if (recorded.createdUser) {
        await tx.user.delete({ where: { id: recorded.userId } })
        return
      }
      await tx.inviteUsage.delete({ where: { id: recorded.usageId } })
      await tx.invite.updateMany({
        where: { id: recorded.inviteId, joinedUserId: recorded.userId },
        data: { joinedUserId: null },
      })
      if (recorded.exempted) {
        await tx.user.update({ where: { id: recorded.userId }, data: { isExempt: false, exemptNote: null } })
      }
    })
    return true
  } catch (error) {
    logger.error("Failed to undo an invite record", error, { inviteId: recorded.inviteId, userId: recorded.userId })
    logAuditEvent(AuditEventType.INVITE_ROLLBACK_FAILED, "system", {
      inviteId: recorded.inviteId,
      userId: recorded.userId,
      stage: "undo_record",
      reason,
      rollbackError: String(error),
    })
    return false
  }
}
