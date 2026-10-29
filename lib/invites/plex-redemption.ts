/**
 * Redeeming a Plex invite for a Plex account: the invite is consumed in one
 * serializable transaction (a Jellyfin code is refused before its use is
 * counted, SEC-29), the user row and `InviteUsage` are recorded, and only then
 * is the account shared and auto-accepted. A failed record restores the use
 * and shares nothing; a failed share undoes the record, then restores the use.
 * The Plex provider's `authorize` runs it with the token it read from plex.tv
 * itself, so no client ever holds the token (SEC-11).
 *
 * @module lib/invites/plex-redemption
 */

import "server-only"

import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/result"
import { acceptPlexInvite, getPlexUserInfo, inviteUserToPlexServer } from "@/lib/connections/plex"
import { ServerType } from "@/lib/generated/prisma/client"
import { rollbackInviteUsage, validateAndUseInvite, withRetry } from "@/lib/invites/redemption"
import { recordInviteUse, undoInviteUse, type RecordedUse } from "@/lib/invites/redemption-record"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("INVITE")

const PLEX_PROPAGATION_DELAY_MS = 2000

const PLEX_REDEEM_FAILED = "We couldn't finish setting up your access. Please try again or ask the server owner."

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
  orderBy: { updatedAt: "desc" },
  })

  if (!plexServer) {
    return { success: false as const, error: "No active Plex server configured" }
  }

  return { success: true as const, data: plexServer }
}

/**
 * Undo a recorded redemption whose share failed. The use is restored only once
 * the record is gone; if the undo fails, the use stays counted and
 * `undoInviteUse` audits the user id for an admin.
 */
async function undoRedemption(recorded: RecordedUse, plexUserEmail: string, reason: string): Promise<void> {
  if (await undoInviteUse(recorded, reason)) {
    await rollbackInviteUsage(recorded.inviteId, plexUserEmail, reason)
  }
}

/**
 * Redeem a Plex invite for the account behind `plexAuthToken`: record the use,
 * invite the account to the server and accept the share on its behalf.
 *
 * - Retries the validate-and-use transaction on conflicts (P2034).
 * - Records the user row, its exemption and the `InviteUsage` before the
 *   share, so a shared account always has its record. A failed record restores
 *   the use and shares nothing; a failed share undoes the record and restores
 *   the use. Each failure has an audit entry.
 * - Keeps the redemption when the auto-accept fails: the share exists, and the
 *   member can accept it in Plex.
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

    // A disabled account gets nothing through an invite: refuse before the use, the share and the exemption.
    // Sign-in refuses the account too, but only after this function returns
    const existing = await prisma.user.findUnique({ where: { plexUserId: plexUser.id }, select: { disabledAt: true } })
    if (existing?.disabledAt) {
      logger.warn("invite.disabled_redeemer", { inviteCodePrefix: code.slice(0, 2) })
      return fail("FORBIDDEN", "This account is disabled.")
    }

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

    // Build invite settings from stored invite data, before anything is recorded
    const inviteSettings = {
      librarySectionIds: invite.librarySectionIds
        ? (JSON.parse(invite.librarySectionIds) as number[])
        : undefined,
      allowDownloads: invite.allowDownloads,
    }

    // Record the user row and the use before the share, so no share exists without its record
    let recorded: RecordedUse
    try {
      recorded = await recordInviteUse(invite.id, plexUser)
    } catch (recordError) {
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
      const failureReason = plexInviteResult.error || "Failed to invite user to Plex server"

      logAuditEvent(AuditEventType.INVITE_PLEX_FAILURE, "system", {
        inviteId: invite.id,
        plexUserEmail: plexUser.email,
        stage: "invite_to_server",
        error: failureReason,
      })

      await undoRedemption(recorded, plexUser.email, failureReason)
      return fail("UPSTREAM_UNAVAILABLE", PLEX_REDEEM_FAILED)
    }

    try {
      await acceptInviteWithPropagationDelay(plexAuthToken, plexInviteResult.inviteID)
    } catch (acceptError) {
      // The share exists and is recorded, so the redemption stands: the member can accept the share in Plex
      logAuditEvent(AuditEventType.INVITE_PLEX_FAILURE, "system", {
        inviteId: invite.id,
        plexUserEmail: plexUser.email,
        stage: "accept_invite",
        error: String(acceptError),
      })
    }

    return ok(null)
  } catch (error) {
    return toActionError(error, PLEX_REDEEM_FAILED)
  }
}
