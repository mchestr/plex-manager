"use server"

import { randomInt } from "crypto"
import { z } from "zod"
import { adminAction, publicAction } from "@/lib/actions/define-action"
import { fail, ok, type ActionResult } from "@/lib/actions/result"
import { requireAdmin } from "@/lib/admin"
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
  withRetry,
} from "@/lib/invites/redemption"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { ServerType } from "@/lib/generated/prisma/client"
import { logAuditEvent, AuditEventType } from "@/lib/security/audit-log"
import { inviteCodeSchema } from "@/lib/validations/invite"
import { jellyfinInviteCredentialsSchema } from "@/lib/validations/jellyfin"
import { publicUserSelect, type InviteWithUsages } from "@/lib/dto/user"

const logger = createLogger("INVITE")

// Constants
const INVITE_CODE_LENGTH = 8
const INVITE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // Removed: 0, O, I, l, 1
const DEFAULT_INVITE_EXPIRATION_HOURS = 48

/** The "Expires" options of the create-invite form. */
const EXPIRES_IN_OPTIONS = ["1d", "48h", "7d", "30d", "never"] as const

/** What an admin may set on a new invite (SEC-56). */
const createInviteSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z2-9]{6,32}$/, "Custom codes are 6 to 32 letters and digits 2-9")
    .optional(),
  serverType: z.enum(["PLEX", "JELLYFIN"]).optional(),
  maxUses: z.number().int().min(1).max(1000).optional(),
  expiresIn: z.enum(EXPIRES_IN_OPTIONS).optional(),
  // Plex-specific: undefined shares every library
  librarySectionIds: z.array(z.number().int().nonnegative()).max(100).optional(),
  allowDownloads: z.boolean().optional(),
  // Jellyfin-specific: undefined grants every library
  jellyfinLibraryIds: z.array(z.string().min(1).max(64)).max(100).optional(),
})

/**
 * Generate a random invite code with unambiguous characters.
 * Uses crypto.randomInt — invite codes grant server access, so they must not
 * be predictable from previously observed codes.
 */
function generateInviteCode(length = INVITE_CODE_LENGTH): string {
  let result = ""
  for (let i = 0; i < length; i++) {
    result += INVITE_CODE_CHARS.charAt(randomInt(INVITE_CODE_CHARS.length))
  }
  return result
}

/**
 * Calculate expiration date from duration string
 */
function calculateExpirationDate(expiresIn?: string): Date | null {
  if (!expiresIn || expiresIn === "never") {
    return null
  }

  const now = new Date()
  const hoursInDay = 24 * 60 * 60 * 1000

  switch (expiresIn) {
    case "1d":
      return new Date(now.getTime() + hoursInDay)
    case "7d":
      return new Date(now.getTime() + 7 * hoursInDay)
    case "30d":
      return new Date(now.getTime() + 30 * hoursInDay)
    default:
      return new Date(now.getTime() + DEFAULT_INVITE_EXPIRATION_HOURS * 60 * 60 * 1000)
  }
}


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
 * Create a new invite code (admin only). Input is checked by
 * `createInviteSchema`; the server type defaults to Plex.
 */
export const createInvite = adminAction({
  input: createInviteSchema,
  fallbackError: "Failed to create invite",
  handler: async (options, { userId }) => {
    // Use provided code or generate one
    const code = options.code || generateInviteCode()

    // Check if code already exists
    const existing = await prisma.invite.findUnique({
      where: { code },
    })

    if (existing) {
      return fail("CONFLICT", "Invite code already exists")
    }

    const expiresAt = calculateExpirationDate(options.expiresIn)
    const serverType = options.serverType === "JELLYFIN" ? ServerType.JELLYFIN : ServerType.PLEX

    const invite = await prisma.invite.create({
      data: {
        code,
        serverType,
        createdBy: userId,
        maxUses: options.maxUses || 1,
        expiresAt,
        // Plex-specific fields
        librarySectionIds: options.librarySectionIds && options.librarySectionIds.length > 0
          ? JSON.stringify(options.librarySectionIds)
          : null,
        allowDownloads: options.allowDownloads ?? false,
        // Jellyfin-specific fields
        jellyfinLibraryIds: options.jellyfinLibraryIds && options.jellyfinLibraryIds.length > 0
          ? JSON.stringify(options.jellyfinLibraryIds)
          : null,
      },
    })

    return ok(invite)
  },
})

/**
 * Get all invites (admin only)
 */
export async function getInvites(): Promise<
  { success: true; data: InviteWithUsages[] } | { success: false; error: string }
> {
  await requireAdmin()

  try {
    const invites = await prisma.invite.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        usages: {
          include: {
            user: { select: publicUserSelect },
          },
        },
      },
    })

    return { success: true, data: invites }
  } catch (error) {
    logger.error("Error fetching invites", error)
    return { success: false, error: "Failed to fetch invites" }
  }
}

/**
 * Get a single invite by ID with details (admin only)
 */
export async function getInviteDetails(id: string): Promise<
  { success: true; data: InviteWithUsages } | { success: false; error: string }
> {
  await requireAdmin()

  try {
    const invite = await prisma.invite.findUnique({
      where: { id },
      include: {
        usages: {
          include: {
            user: { select: publicUserSelect },
          },
          orderBy: { usedAt: "desc" },
        },
      },
    })

    if (!invite) {
      return { success: false, error: "Invite not found" }
    }

    return { success: true, data: invite }
  } catch (error) {
    logger.error("Error fetching invite details", error)
    return { success: false, error: "Failed to fetch invite details" }
  }
}

/**
 * Delete an invite (admin only)
 */
export async function deleteInvite(id: string) {
  await requireAdmin()

  try {
    await prisma.invite.delete({
      where: { id },
    })

    return { success: true }
  } catch (error) {
    logger.error("Error deleting invite", error)
    return { success: false, error: "Failed to delete invite" }
  }
}

/**
 * Validate an invite code (public)
 *
 * NOTE: This performs non-atomic validation for UI/display purposes only.
 * Redemption consumes the invite atomically through validateAndUseInvite()
 * (lib/invites/redemption.ts): the Plex path runs inside the Plex sign-in's
 * authorize (lib/invites/plex-redemption.ts), the Jellyfin path below.
 */
export const validateInvite = publicAction({
  input: inviteCodeSchema,
  rateLimit: { name: "invite:validate" },
  fallbackError: "Failed to validate invite",
  handler: async (code) => {
    const invite = await prisma.invite.findUnique({
      where: { code },
      select: { serverType: true, expiresAt: true, useCount: true, maxUses: true },
    })

    if (!invite) {
      return fail("INVITE_INVALID", "Invalid invite code")
    }

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return fail("INVITE_INVALID", "Invite has expired")
    }

    if (invite.useCount >= invite.maxUses) {
      return fail("INVITE_INVALID", "Invite has reached maximum uses")
    }

    // The invite page needs only these; the code's settings stay on the server
    return ok({ serverType: invite.serverType, expiresAt: invite.expiresAt })
  },
})

/**
 * Get active Jellyfin server configuration
 */
async function getActiveJellyfinServer() {
  const jellyfinServer = await prisma.jellyfinServer.findFirst({
    where: { isActive: true },
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
 */
export const processJellyfinInvite = publicAction({
  // The credentials are validated before the invite is consumed, so a rejected name costs no use
  input: z.object({ code: inviteCodeSchema, credentials: jellyfinInviteCredentialsSchema }),
  rateLimit: { name: "invite:redeem" },
  fallbackError: JELLYFIN_REDEEM_FAILED,
  handler: ({ code, credentials }) => redeemJellyfinInvite(code, credentials),
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

    // Atomically validate and mark the invite as used with retry logic for transaction conflicts
    const inviteResult = await withRetry(
      () => validateAndUseInvite(code, ServerType.JELLYFIN),
      {
        onConflict: (attempt) => {
          logAuditEvent(AuditEventType.INVITE_TRANSACTION_CONFLICT, "system", {
            inviteCodePrefix: code.slice(0, 2),
            jellyfinUsername: username,
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
