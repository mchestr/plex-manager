/**
 * Ending a user's sessions (SEC-10).
 *
 * Sessions are stateless JWTs, so they cannot be deleted. Instead each token
 * carries the `User.sessionVersion` it was issued under (`token.sv`), and the
 * JWT callback in `lib/auth.ts` re-reads the row at most every five minutes.
 * {@link endUserSessions} increments the version, so every token issued before
 * it stops matching and the next recheck ends that session with
 * {@link SessionRevokedError}.
 *
 * @module
 */

import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("SESSION_REVOCATION")

/**
 * Why a user's sessions were ended. P4.11 adds its own reason; P4.18's role
 * syncs reuse these (`RoleSyncReason` in `lib/queue/types.ts`).
 */
export type SessionRevocationReason = "unshared" | "demoted" | "disabled" | "subscription_revoked" | "removed"

/** The audit actor for revocations that no admin triggered, such as a Stripe job. */
export const SYSTEM_ACTOR = "system"

/**
 * Thrown from the JWT callback when a session must end: the user row is gone,
 * the user is disabled, or the token's version is stale. next-auth's session
 * route then clears the cookie and answers `{}`, and `getServerSession`
 * returns null.
 */
export class SessionRevokedError extends Error {
  constructor(reason: "missing-user" | "disabled" | "version-mismatch") {
    super(`Session revoked: ${reason}`)
    this.name = "SessionRevokedError"
  }
}

/**
 * Ends every session of `userId` within the JWT recheck interval, audits
 * `SESSIONS_REVOKED`, and queues a re-sync of their Discord linked role, since
 * every reason here changes their access (P4.18). A user row that no longer
 * exists is a no-op: its sessions already end at the next recheck.
 *
 * @param userId - The user whose sessions end.
 * @param reason - Why, recorded in the audit event.
 * @param actorId - The admin who caused it, or {@link SYSTEM_ACTOR}.
 */
export async function endUserSessions(
  userId: string,
  reason: SessionRevocationReason,
  actorId: string
): Promise<void> {
  const { count } = await prisma.user.updateMany({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
  })
  if (count === 0) {
    return
  }
  logAuditEvent(AuditEventType.SESSIONS_REVOKED, actorId, { targetUserId: userId, reason })

  // Loaded on use: lib/auth.ts imports this module. A role sync never fails the revocation.
  await import("@/lib/discord/role-sync")
    .then(({ enqueueRoleSync }) => enqueueRoleSync(userId, reason))
    .catch((error: unknown) => logger.warn("discord.role_sync_enqueue_failed", { userId, reason, error }))
}

/**
 * Whether a `SESSIONS_REVOKED` event for `userId` was recorded at or after
 * `since`, so a retried disable knows its sessions already ended.
 */
export async function sessionsEndedSince(userId: string, since: Date): Promise<boolean> {
  const event = await prisma.auditLog.findFirst({
    where: { type: AuditEventType.SESSIONS_REVOKED, targetUserId: userId, createdAt: { gte: since } },
    select: { id: true },
  })
  return event !== null
}
