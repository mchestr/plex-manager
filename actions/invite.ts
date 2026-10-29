"use server"

import { z } from "zod"
import { publicAction } from "@/lib/actions/define-action"
import { formAction } from "@/lib/actions/form-action"
import { fail, ok, type ActionResult } from "@/lib/actions/result"
import {
  createJellyfinUser,
  setJellyfinUserPolicy,
  deleteJellyfinUser,
} from "@/lib/connections/jellyfin"
import type { JellyfinConfig, JellyfinInviteSettings } from "@/lib/connections/jellyfin-core"
import {
  INVITE_EXEMPTION,
  rollbackInviteUsage,
  validateAndUseInvite,
} from "@/lib/invites/redemption"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { ServerType } from "@/lib/generated/prisma/client"
import { logAuditEvent, AuditEventType } from "@/lib/security/audit-log"
import { inviteCodeSchema } from "@/lib/validations/invite"
import { jellyfinInviteCredentialsSchema, jellyfinInviteFormSchema } from "@/lib/validations/jellyfin"

const logger = createLogger("INVITE")

// Jellyfin user data for invite processing
interface JellyfinAuthData {
  username: string
  password: string
}

const JELLYFIN_REDEEM_FAILED = "Your account could not be created. Please try again."
const JELLYFIN_ENABLE_FAILED = "Your account was created. Ask the server owner to enable it."

// Jellyfin virtual-folder ids are 32-hex GUIDs (`ItemId` from /Library/VirtualFolders)
const jellyfinLibraryIdsSchema = z.array(z.string().regex(/^[0-9a-f]{32}$/i))

/**
 * Get active Jellyfin server configuration
 */
async function getActiveJellyfinServer() {
  const jellyfinServer = await prisma.jellyfinServer.findFirst({
    where: { isActive: true },
  orderBy: { updatedAt: "desc" },
  })

  if (!jellyfinServer) {
    return { success: false as const, error: "No active Jellyfin server configured" }
  }

  return { success: true as const, data: jellyfinServer }
}

/**
 * Find or create user from Jellyfin user data
 */
async function findOrCreateJellyfinUser(
  tx: PrismaTransactionClient,
  jellyfinUserId: string,
  username: string
): Promise<{ id: string }> {
  let user = await tx.user.findUnique({
    where: { jellyfinUserId },
  })

  if (user) {
    if (!user.isExempt) {
      user = await tx.user.update({
        where: { id: user.id },
        data: INVITE_EXEMPTION,
      })
    }
    return user
  }

  // Create new user
  user = await tx.user.create({
    data: {
      name: username,
      jellyfinUserId,
      primaryAuthService: "jellyfin",
      ...INVITE_EXEMPTION,
    },
  })

  return user
}

/**
 * Record Jellyfin invite usage and create/update user
 */
async function recordJellyfinInviteUsage(
  inviteId: string,
  jellyfinUserId: string,
  username: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const user = await findOrCreateJellyfinUser(tx, jellyfinUserId, username)

    await tx.inviteUsage.create({
      data: {
        inviteId,
        userId: user.id,
      },
    })
  })
}

/**
 * Parse an invite's stored Jellyfin library ids. `null` means every library;
 * a value that is not a JSON array of 32-hex ids is rejected.
 */
function parseJellyfinLibraryIds(
  raw: string | null
): { success: true; data: string[] | undefined } | { success: false } {
  if (raw === null) {
    return { success: true, data: undefined }
  }
  try {
    const parsed = jellyfinLibraryIdsSchema.safeParse(JSON.parse(raw))
    return parsed.success ? { success: true, data: parsed.data } : { success: false }
  } catch {
    return { success: false }
  }
}

interface JellyfinRedemption {
  inviteId: string
  username: string
  jellyfinUserId: string
  /** The account is confirmed disabled (step 2 of the redemption succeeded). */
  disabled: boolean
  /** The invite's policy, reused if the account has to be disabled again. */
  policy: JellyfinInviteSettings
}

/**
 * Undo a failed Jellyfin redemption, all or nothing (GAP-28).
 *
 * Deletes the account and checks the result. If the delete fails, an account
 * not yet known to be disabled is disabled instead. The invite's use is only
 * restored once the account is confirmed deleted or disabled; otherwise the
 * invite stays consumed and `INVITE_ROLLBACK_FAILED` records the Jellyfin user
 * id so an admin can remove the account by hand.
 */
async function compensateJellyfinInvite(
  config: JellyfinConfig,
  redemption: JellyfinRedemption,
  reason: string
): Promise<void> {
  const { inviteId, username, jellyfinUserId } = redemption
  const deleted = await deleteJellyfinUser(config, jellyfinUserId)

  let contained = deleted.success
  if (!deleted.success) {
    contained = redemption.disabled
    if (!contained) {
      const disabled = await setJellyfinUserPolicy(config, jellyfinUserId, {
        ...redemption.policy,
        isDisabled: true,
      })
      contained = disabled.success
    }
  }

  if (!contained) {
    logger.error("Jellyfin invite compensation failed; account left active", undefined, {
      inviteId,
      jellyfinUserId,
    })
    logAuditEvent(AuditEventType.INVITE_ROLLBACK_FAILED, "system", {
      inviteId,
      jellyfinUsername: username,
      jellyfinUserId,
      reason,
      rollbackError: "Jellyfin account could not be deleted or disabled",
    })
    return
  }

  if (!deleted.success) {
    logAuditEvent(AuditEventType.INVITE_JELLYFIN_FAILURE, "system", {
      inviteId,
      jellyfinUsername: username,
      jellyfinUserId,
      stage: "compensate",
      error: "Jellyfin account disabled but not deleted",
    })
  }

  await rollbackInviteUsage(inviteId, username, reason)
}

/**
 * Process a Jellyfin invite: Create user on Jellyfin server with appropriate permissions.
 * Uses atomic validation to prevent TOCTOU race conditions.
 *
 * The account is created, given the invite's libraries while disabled, recorded
 * (user row and `InviteUsage` in one transaction), and only then enabled. A
 * failure before the record is compensated by `compensateJellyfinInvite`; a
 * failed enable leaves the recorded account disabled for the owner to enable.
 *
 * This function implements:
 * - Retry logic with exponential backoff for transaction conflicts (P2034)
 * - Compensating transaction (rollback) if Jellyfin operations fail after invite is consumed
 * - Audit logging for security-sensitive events
 *
 * The invite form posts {@link redeemJellyfinInviteForm}, which calls this.
 *
 * @internal
 */
export const processJellyfinInvite = publicAction({
  // The credentials are validated before the invite is consumed, so a rejected name costs no use
  input: z.object({ code: inviteCodeSchema, credentials: jellyfinInviteCredentialsSchema }),
  rateLimit: { name: "invite:redeem" },
  fallbackError: JELLYFIN_REDEEM_FAILED,
  handler: ({ code, credentials }) => redeemJellyfinInvite(code, credentials),
})

/**
 * {@link processJellyfinInvite} as the invite form's `<form action>` (P10.7):
 * the fields are checked, the passwords matched, and only the username comes
 * back for the form to keep after an error.
 */
export const redeemJellyfinInviteForm = formAction(processJellyfinInvite, {
  schema: jellyfinInviteFormSchema,
  toInput: ({ code, username, password }) => ({ code, credentials: { username, password } }),
  keep: ["username"],
})

async function redeemJellyfinInvite(
  code: string,
  { username, password }: JellyfinAuthData
): Promise<ActionResult<{ jellyfinUserId: string; username: string; serverUrl: string | null }>> {
  // Set once the Jellyfin account exists and until it is recorded, so the outer
  // catch knows whether there is an account to compensate.
  let pending: { config: JellyfinConfig; redemption: JellyfinRedemption } | null = null

  try {
    // Get server config first (before consuming the invite)
    const serverResult = await getActiveJellyfinServer()
    if (!serverResult.success) {
      return fail("NOT_FOUND", serverResult.error)
    }
    const jellyfinServer = serverResult.data

    // Atomically validate and mark the invite as used, retried on transaction conflicts
    const inviteResult = await validateAndUseInvite(code, ServerType.JELLYFIN, {
      onConflict: (attempt) => {
        logAuditEvent(AuditEventType.INVITE_TRANSACTION_CONFLICT, "system", {
          inviteCodePrefix: code.slice(0, 2),
          jellyfinUsername: username,
          attempt,
        })
      },
    })

    if (!inviteResult.success) {
      return { success: false, code: inviteResult.code, error: inviteResult.error }
    }
    const invite = inviteResult.invite

    // Audit log that the invite was consumed
    logAuditEvent(AuditEventType.INVITE_CONSUMED, "system", {
      inviteId: invite.id,
      inviteCodePrefix: invite.code.slice(0, 2),
      serverType: "JELLYFIN",
      jellyfinUsername: username,
    })

    // Parsed before any account exists, so a malformed value creates nothing
    const libraryIds = parseJellyfinLibraryIds(invite.jellyfinLibraryIds)
    if (!libraryIds.success) {
      logAuditEvent(AuditEventType.INVITE_JELLYFIN_FAILURE, "system", {
        inviteId: invite.id,
        jellyfinUsername: username,
        stage: "parse_libraries",
        error: "Invite library ids are malformed",
      })
      await rollbackInviteUsage(invite.id, username, "Invite library ids are malformed")
      return { success: false, code: "INTERNAL", error: JELLYFIN_REDEEM_FAILED }
    }

    const jellyfinConfig: JellyfinConfig = {
      url: jellyfinServer.url,
      apiKey: jellyfinServer.apiKey,
    }
    const policy: JellyfinInviteSettings = {
      libraryIds: libraryIds.data,
      allowDownloads: invite.allowDownloads,
      enableRemoteAccess: true,
    }

    // Step 1: Create the Jellyfin user
    const createResult = await createJellyfinUser(jellyfinConfig, username, password)

    if (!createResult.success || !createResult.userId) {
      const failureReason = createResult.error || "Failed to create Jellyfin user"

      logAuditEvent(AuditEventType.INVITE_JELLYFIN_FAILURE, "system", {
        inviteId: invite.id,
        jellyfinUsername: username,
        stage: "create_user",
        error: failureReason,
      })

      await rollbackInviteUsage(invite.id, username, failureReason)
      return { success: false, code: "INTERNAL", error: JELLYFIN_REDEEM_FAILED }
    }

    const jellyfinUserId = createResult.userId
    const redemption: JellyfinRedemption = {
      inviteId: invite.id,
      username,
      jellyfinUserId,
      disabled: false,
      policy,
    }
    pending = { config: jellyfinConfig, redemption }

    // Step 2: Apply the invite's libraries with the account disabled
    const policyResult = await setJellyfinUserPolicy(jellyfinConfig, jellyfinUserId, {
      ...policy,
      isDisabled: true,
    })

    if (!policyResult.success) {
      const failureReason = policyResult.error || "Failed to set Jellyfin user permissions"

      logAuditEvent(AuditEventType.INVITE_JELLYFIN_FAILURE, "system", {
        inviteId: invite.id,
        jellyfinUsername: username,
        jellyfinUserId,
        stage: "set_policy",
        error: failureReason,
      })

      pending = null
      await compensateJellyfinInvite(jellyfinConfig, redemption, failureReason)
      return { success: false, code: "INTERNAL", error: JELLYFIN_REDEEM_FAILED }
    }
    redemption.disabled = true

    // Step 3: Record the user row and the invite usage
    try {
      await recordJellyfinInviteUsage(invite.id, jellyfinUserId, username)
    } catch (recordError) {
      const failureReason = String(recordError)

      logAuditEvent(AuditEventType.INVITE_JELLYFIN_FAILURE, "system", {
        inviteId: invite.id,
        jellyfinUsername: username,
        jellyfinUserId,
        stage: "record_usage",
        error: failureReason,
      })

      pending = null
      await compensateJellyfinInvite(jellyfinConfig, redemption, failureReason)
      return { success: false, code: "INTERNAL", error: JELLYFIN_REDEEM_FAILED }
    }
    pending = null

    // Step 4: Enable the account now that the app knows about it
    const enableResult = await setJellyfinUserPolicy(jellyfinConfig, jellyfinUserId, {
      ...policy,
      isDisabled: false,
    })

    if (!enableResult.success) {
      logAuditEvent(AuditEventType.INVITE_JELLYFIN_FAILURE, "system", {
        inviteId: invite.id,
        jellyfinUsername: username,
        jellyfinUserId,
        stage: "enable",
        error: enableResult.error || "Failed to enable Jellyfin user",
      })
      return { success: false, code: "INTERNAL", error: JELLYFIN_ENABLE_FAILED }
    }

    logger.info("Jellyfin invite processed successfully", {
      inviteId: invite.id,
      jellyfinUserId,
      username,
    })

    return ok({
      jellyfinUserId,
      username,
      // A member gets the public URL only; the internal one is often a LAN address
      serverUrl: jellyfinServer.publicUrl || null,
    })
  } catch (error) {
    logger.error("Error processing Jellyfin invite", error)

    if (pending) {
      await compensateJellyfinInvite(pending.config, pending.redemption, "Unexpected error")
    }

    return { success: false, code: "INTERNAL", error: JELLYFIN_REDEEM_FAILED }
  }
}
