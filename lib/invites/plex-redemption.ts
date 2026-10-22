/**
 * Redeeming a Plex invite for a Plex account: the invite is consumed in one
 * serializable transaction (a Jellyfin code is refused before its use is
 * counted, SEC-29), the account is shared and auto-accepted, and the user row
 * and `InviteUsage` are recorded; a failure after the use was counted restores
 * it. The Plex provider's `authorize` runs it with the token it read from
 * plex.tv itself, so no client ever holds the token (SEC-11).
 *
 * @module lib/invites/plex-redemption
 */

import "server-only"

import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/result"
import { acceptPlexInvite, getPlexUserInfo, inviteUserToPlexServer } from "@/lib/connections/plex"
import { ServerType } from "@/lib/generated/prisma/client"
import {
  INVITE_EXEMPTION,
  rollbackInviteUsage,
  validateAndUseInvite,
  withRetry,
} from "@/lib/invites/redemption"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import { isUniqueEmailConflict } from "@/lib/prisma-errors"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("INVITE")

const PLEX_PROPAGATION_DELAY_MS = 2000

const PLEX_REDEEM_FAILED = "We couldn't finish setting up your access. Please try again or ask the server owner."

interface PlexUser {
  id: string
  username: string
  email: string
  thumb?: string | null
}

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
  plexUser: PlexUser,
  email: string | null
): Promise<{ id: string }> {
  const user = await tx.user.findUnique({
    where: { plexUserId: plexUser.id },
  })

  if (user) {
    return tx.user.update({
      where: { id: user.id },
      data: {
        ...(email === null ? {} : { email, emailVerified: new Date() }),
        image: plexUser.thumb,
        ...(user.isExempt ? {} : INVITE_EXEMPTION),
      },
    })
  }

  return tx.user.create({
    data: {
      name: plexUser.username,
      email,
      plexUserId: plexUser.id,
      image: plexUser.thumb,
      emailVerified: email === null ? null : new Date(),
      ...INVITE_EXEMPTION,
    },
  })
}

/**
 * Record invite usage and create/update user.
 *
 * If another row already holds the Plex email, the write is retried once
 * without it, so that row can neither absorb nor block the redeeming user. The
 * retry runs in a new transaction because PostgreSQL aborts a transaction once
 * a statement in it fails.
 */
async function recordInviteUsage(inviteId: string, plexUser: PlexUser): Promise<void> {
  const record = (email: string | null) =>
    prisma.$transaction(async (tx) => {
      const user = await findOrCreateUser(tx, plexUser, email)

      await tx.inviteUsage.create({
        data: {
          inviteId,
          userId: user.id,
        },
      })
    })

  try {
    await record(plexUser.email)
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
    await record(null)
  }
}

/**
 * Wait for Plex to propagate changes
 */
function waitForPlexPropagation(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, PLEX_PROPAGATION_DELAY_MS))
}

/**
 * Accept invite and handle propagation delay
 */
async function acceptInviteWithPropagationDelay(
  plexAuthToken: string,
  inviteID: number | undefined
): Promise<void> {
  if (!inviteID) {
    logger.warn("No invite ID returned from invite request, cannot auto-accept")
    await waitForPlexPropagation()
    return
  }

  const acceptResult = await acceptPlexInvite(plexAuthToken, inviteID)
  if (!acceptResult.success) {
    logger.warn("Failed to automatically accept invite", { error: acceptResult.error })
  }

  await waitForPlexPropagation()
}

/**
 * Get active Plex server configuration
 */
async function getActivePlexServer() {
  const plexServer = await prisma.plexServer.findFirst({
    where: { isActive: true },
  })

  if (!plexServer) {
    return { success: false as const, error: "No active Plex server configured" }
  }

  return { success: true as const, data: plexServer }
}

/**
 * Redeem a Plex invite for the account behind `plexAuthToken`: invite it to
 * the server, accept the share on its behalf and record the use.
 *
 * - Retries the validate-and-use transaction on conflicts (P2034).
 * - Restores the invite's use if a Plex step or the record fails after it was
 *   counted, with audit entries for each failure.
 * - Is idempotent per account: a Plex account that already redeemed this code
 *   (a second sign-in attempt with the same PIN) succeeds without spending
 *   another use.
 *
 * Never throws; failures are action codes with fixed copy.
 */
export async function redeemPlexInvite(code: string, plexAuthToken: string): Promise<ActionResult<null>> {
  try {
    // Get user info and server config first (before consuming the invite)
    const userInfoResult = await getPlexUserInfo(plexAuthToken)
    if (!userInfoResult.success || !userInfoResult.data) {
      logger.warn("Could not read the Plex account for an invite", { error: userInfoResult.error })
      return fail("UPSTREAM_UNAVAILABLE", "We couldn't read your Plex account. Please try again.")
    }
    const plexUser = userInfoResult.data

    const earlierUse = await prisma.inviteUsage.findFirst({
      where: { invite: { code }, user: { plexUserId: plexUser.id } },
      select: { id: true },
    })
    if (earlierUse) {
      logger.info("Invite already redeemed by this Plex account", { inviteCodePrefix: code.slice(0, 2) })
      return ok(null)
    }

    const serverResult = await getActivePlexServer()
    if (!serverResult.success) {
      return fail("NOT_FOUND", serverResult.error)
    }
    const plexServer = serverResult.data

    // Atomically validate and mark the invite as used with retry logic for transaction conflicts
    // This prevents race conditions where multiple requests could use the same invite
    const inviteResult = await withRetry(
      () => validateAndUseInvite(code, ServerType.PLEX),
      {
        onConflict: (attempt) => {
          // Log transaction conflict for monitoring/alerting
          logAuditEvent(AuditEventType.INVITE_TRANSACTION_CONFLICT, "system", {
            inviteCodePrefix: code.slice(0, 2),
            plexUserEmail: plexUser.email,
            attempt,
          })
        },
      }
    )
    if (!inviteResult.success) {
      return { success: false, code: inviteResult.code, error: inviteResult.error }
    }
    const invite = inviteResult.invite

    // Audit log that the invite was consumed
    logAuditEvent(AuditEventType.INVITE_CONSUMED, "system", {
      inviteId: invite.id,
      inviteCodePrefix: invite.code.slice(0, 2),
      plexUserEmail: plexUser.email,
    })

    // Build invite settings from stored invite data
    const inviteSettings = {
      librarySectionIds: invite.librarySectionIds
        ? (JSON.parse(invite.librarySectionIds) as number[])
        : undefined,
      allowDownloads: invite.allowDownloads,
    }

    // Attempt Plex operations - if these fail, we need to rollback the invite usage
    const plexInviteResult = await inviteUserToPlexServer(
      {
        url: plexServer.url,
        token: plexServer.token,
        machineIdentifier: plexServer.machineIdentifier,
      },
      plexUser.email,
      inviteSettings
    )

    if (!plexInviteResult.success) {
      // Plex invite failed - rollback the invite usage
      const failureReason = plexInviteResult.error || "Failed to invite user to Plex server"

      logAuditEvent(AuditEventType.INVITE_PLEX_FAILURE, "system", {
        inviteId: invite.id,
        plexUserEmail: plexUser.email,
        stage: "invite_to_server",
        error: failureReason,
      })

      await rollbackInviteUsage(invite.id, plexUser.email, failureReason)
      return fail("UPSTREAM_UNAVAILABLE", PLEX_REDEEM_FAILED)
    }

    try {
      await acceptInviteWithPropagationDelay(plexAuthToken, plexInviteResult.inviteID)
    } catch (acceptError) {
      // Accept failed - rollback the invite usage
      const failureReason = String(acceptError)

      logAuditEvent(AuditEventType.INVITE_PLEX_FAILURE, "system", {
        inviteId: invite.id,
        plexUserEmail: plexUser.email,
        stage: "accept_invite",
        error: failureReason,
      })

      await rollbackInviteUsage(invite.id, plexUser.email, failureReason)
      return fail("UPSTREAM_UNAVAILABLE", PLEX_REDEEM_FAILED)
    }

    try {
      await recordInviteUsage(invite.id, plexUser)
    } catch (recordError) {
      // Recording usage failed - rollback the invite usage
      // Note: The user may already be on Plex, but we should still restore the invite
      const failureReason = String(recordError)

      logAuditEvent(AuditEventType.INVITE_PLEX_FAILURE, "system", {
        inviteId: invite.id,
        plexUserEmail: plexUser.email,
        stage: "record_usage",
        error: failureReason,
      })

      await rollbackInviteUsage(invite.id, plexUser.email, failureReason)
      return fail("INTERNAL", PLEX_REDEEM_FAILED)
    }

    return ok(null)
  } catch (error) {
    return toActionError(error, PLEX_REDEEM_FAILED)
  }
}
