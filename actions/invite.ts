"use server"

import { requireAdmin } from "@/lib/admin"
import {
  acceptPlexInvite,
  getPlexUserInfo,
  inviteUserToPlexServer
} from "@/lib/connections/plex"
import {
  createJellyfinUser,
  setJellyfinUserPolicy,
  deleteJellyfinUser,
} from "@/lib/connections/jellyfin"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { Prisma, ServerType } from "@/lib/generated/prisma/client"
import { logAuditEvent, AuditEventType } from "@/lib/security/audit-log"

const logger = createLogger("INVITE")

// Constants
const INVITE_CODE_LENGTH = 8
const INVITE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // Removed: 0, O, I, l, 1
const DEFAULT_INVITE_EXPIRATION_HOURS = 48
const PLEX_PROPAGATION_DELAY_MS = 2000
const TRANSACTION_TIMEOUT_MS = 10000

// Retry configuration for transaction conflicts
const MAX_TRANSACTION_RETRIES = 3
const INITIAL_RETRY_DELAY_MS = 100

// Types
interface PlexUser {
  id: string
  username: string
  email: string
  thumb?: string | null
}

/**
 * Check if an error is a Prisma transaction conflict (P2034)
 */
function isTransactionConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2034"
  }
  return false
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Execute a function with exponential backoff retry on transaction conflicts
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number
    initialDelayMs?: number
    onConflict?: (attempt: number) => void
  } = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? MAX_TRANSACTION_RETRIES
  const initialDelay = options.initialDelayMs ?? INITIAL_RETRY_DELAY_MS

  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      if (!isTransactionConflict(error) || attempt >= maxRetries) {
        throw error
      }

      // Log transaction conflict for monitoring
      options.onConflict?.(attempt + 1)

      // Exponential backoff with jitter
      const delay = initialDelay * Math.pow(2, attempt) * (0.5 + Math.random() * 0.5)
      logger.warn("Transaction conflict, retrying", {
        attempt: attempt + 1,
        maxRetries,
        delayMs: Math.round(delay),
      })
      await sleep(delay)
    }
  }

  throw lastError
}

/**
 * Generate a random invite code with unambiguous characters
 */
function generateInviteCode(length = INVITE_CODE_LENGTH): string {
  let result = ""
  for (let i = 0; i < length; i++) {
    result += INVITE_CODE_CHARS.charAt(Math.floor(Math.random() * INVITE_CODE_CHARS.length))
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

// Types for invite with full data
interface InviteData {
  id: string
  code: string
  serverType: ServerType
  maxUses: number
  useCount: number
  expiresAt: Date | null
  // Plex-specific
  librarySectionIds: string | null
  allowDownloads: boolean
  // Jellyfin-specific
  jellyfinLibraryIds: string | null
}

// Jellyfin user data for invite processing
interface JellyfinAuthData {
  username: string
  password: string
}

interface ValidateAndUseResult {
  success: boolean
  error?: string
  invite?: InviteData
}

/**
 * Rollback invite usage by decrementing the use count
 * Used as a compensating transaction when Plex operations fail
 */
async function rollbackInviteUsage(
  inviteId: string,
  plexUserEmail: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      // Decrement the use count to restore the invite
      await tx.invite.update({
        where: { id: inviteId },
        data: { useCount: { decrement: 1 } },
      })
    })

    logger.info("Invite usage rolled back successfully", {
      inviteId,
      plexUserEmail,
      reason,
    })

    // Audit log the rollback
    logAuditEvent(AuditEventType.INVITE_ROLLBACK, "system", {
      inviteId,
      plexUserEmail,
      reason,
    })

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"

    logger.error("Failed to rollback invite usage", error, {
      inviteId,
      plexUserEmail,
      reason,
    })

    // Audit log the failed rollback - this is a critical issue
    logAuditEvent(AuditEventType.INVITE_ROLLBACK_FAILED, "system", {
      inviteId,
      plexUserEmail,
      reason,
      rollbackError: errorMessage,
    })

    return { success: false, error: errorMessage }
  }
}

/**
 * Atomically validate and use an invite within a single transaction.
 * Uses Serializable isolation level to prevent TOCTOU race conditions.
 * This ensures that concurrent requests cannot both pass validation.
 * Note: This function re-throws P2034 transaction conflicts for retry handling
 */
async function validateAndUseInvite(code: string): Promise<ValidateAndUseResult> {
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // Find invite by code inside the transaction
        const invite = await tx.invite.findUnique({
          where: { code },
        })

        if (!invite) {
          return { success: false as const, error: "Invalid invite code" }
        }

        // Validate expiration
        if (invite.expiresAt && invite.expiresAt < new Date()) {
          return { success: false as const, error: "Invite has expired" }
        }

        // Validate max uses
        if (invite.useCount >= invite.maxUses) {
          return { success: false as const, error: "Invite has reached maximum uses" }
        }

        // Atomically increment the use count
        const updatedInvite = await tx.invite.update({
          where: { id: invite.id },
          data: { useCount: { increment: 1 } },
        })

        return {
          success: true as const,
          invite: {
            id: updatedInvite.id,
            code: updatedInvite.code,
            serverType: updatedInvite.serverType,
            maxUses: updatedInvite.maxUses,
            useCount: updatedInvite.useCount,
            expiresAt: updatedInvite.expiresAt,
            librarySectionIds: updatedInvite.librarySectionIds,
            allowDownloads: updatedInvite.allowDownloads,
            jellyfinLibraryIds: updatedInvite.jellyfinLibraryIds,
          },
        }
      },
      {
        timeout: TRANSACTION_TIMEOUT_MS,
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    )

    return result
  } catch (error) {
    // Re-throw P2034 errors for retry handling at the caller level
    if (isTransactionConflict(error)) {
      throw error
    }
    const errorMessage = error instanceof Error ? error.message : "Failed to process invite"
    logger.error("Error validating and using invite", { error: errorMessage, code })
    return { success: false, error: errorMessage }
  }
}

/**
 * Find or create user from Plex user data
 */
async function findOrCreateUser(
  tx: Prisma.TransactionClient,
  plexUser: PlexUser
): Promise<{ id: string }> {
  let user = await tx.user.findUnique({
    where: { plexUserId: plexUser.id },
  })

  if (user) {
    user = await tx.user.update({
      where: { id: user.id },
      data: {
        email: plexUser.email,
        image: plexUser.thumb,
        emailVerified: new Date(),
      },
    })
    return user
  }

  const userByEmail = await tx.user.findUnique({
    where: { email: plexUser.email },
  })

  if (userByEmail) {
    user = await tx.user.update({
      where: { id: userByEmail.id },
      data: {
        plexUserId: plexUser.id,
        image: plexUser.thumb,
        emailVerified: new Date(),
      },
    })
    return user
  }

  user = await tx.user.create({
    data: {
      name: plexUser.username,
      email: plexUser.email,
      plexUserId: plexUser.id,
      image: plexUser.thumb,
      emailVerified: new Date(),
    },
  })

  return user
}

/**
 * Record invite usage and create/update user
 */
async function recordInviteUsage(inviteId: string, plexUser: PlexUser): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const user = await findOrCreateUser(tx, plexUser)

    await tx.inviteUsage.create({
      data: {
        inviteId,
        userId: user.id,
      },
    })
  })
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
 * Create a new invite code (admin only)
 */
export async function createInvite(
  options: {
    code?: string
    serverType?: "PLEX" | "JELLYFIN" // Default: PLEX
    maxUses?: number
    expiresIn?: string // "1d", "7d", "30d", "never"
    // Plex-specific options
    librarySectionIds?: number[] // If undefined/null, all libraries are shared
    allowDownloads?: boolean // Default: false
    // Jellyfin-specific options
    jellyfinLibraryIds?: string[] // If undefined/null, all libraries are granted
  } = {}
) {
  const session = await requireAdmin()

  try {
    // Use provided code or generate one
    const code = options.code?.trim().toUpperCase() || generateInviteCode()

    // Check if code already exists
    const existing = await prisma.invite.findUnique({
      where: { code },
    })

    if (existing) {
      return { success: false, error: "Invite code already exists" }
    }

    const expiresAt = calculateExpirationDate(options.expiresIn)
    const serverType = options.serverType === "JELLYFIN" ? ServerType.JELLYFIN : ServerType.PLEX

    const invite = await prisma.invite.create({
      data: {
        code,
        serverType,
        createdBy: session.user.id,
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

    return { success: true, data: invite }
  } catch (error) {
    logger.error("Error creating invite", error)
    return { success: false, error: "Failed to create invite" }
  }
}

/**
 * Get all invites (admin only)
 */
export async function getInvites() {
  await requireAdmin()

  try {
    const invites = await prisma.invite.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        usages: {
          include: {
            user: true
          }
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
export async function getInviteDetails(id: string) {
  await requireAdmin()

  try {
    const invite = await prisma.invite.findUnique({
      where: { id },
      include: {
        usages: {
          include: {
            user: true
          },
          orderBy: { usedAt: "desc" }
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
 * For actually consuming an invite, use processInvite() which uses atomic
 * validation via validateAndUseInvite() to prevent TOCTOU race conditions.
 */
export async function validateInvite(code: string) {
  try {
    const invite = await prisma.invite.findUnique({
      where: { code },
    })

    if (!invite) {
      return { success: false, error: "Invalid invite code" }
    }

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return { success: false, error: "Invite has expired" }
    }

    if (invite.useCount >= invite.maxUses) {
      return { success: false, error: "Invite has reached maximum uses" }
    }

    return { success: true, data: invite }
  } catch (error) {
    logger.error("Error validating invite", error)
    return { success: false, error: "Failed to validate invite" }
  }
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
 * Process an invite: Invite user to Plex server and accept it.
 * Uses atomic validation to prevent TOCTOU race conditions.
 *
 * This function implements:
 * - Retry logic with exponential backoff for transaction conflicts (P2034)
 * - Compensating transaction (rollback) if Plex operations fail after invite is consumed
 * - Audit logging for security-sensitive events
 */
export async function processInvite(code: string, plexAuthToken: string) {
  try {
    // Get user info and server config first (before consuming the invite)
    const userInfoResult = await getPlexUserInfo(plexAuthToken)
    if (!userInfoResult.success || !userInfoResult.data) {
      return { success: false, error: userInfoResult.error || "Failed to get Plex user info" }
    }
    const plexUser = userInfoResult.data

    const serverResult = await getActivePlexServer()
    if (!serverResult.success) {
      return serverResult
    }
    const plexServer = serverResult.data

    // Atomically validate and mark the invite as used with retry logic for transaction conflicts
    // This prevents race conditions where multiple requests could use the same invite
    const inviteResult = await withRetry(
      () => validateAndUseInvite(code),
      {
        onConflict: (attempt) => {
          // Log transaction conflict for monitoring/alerting
          logAuditEvent(AuditEventType.INVITE_TRANSACTION_CONFLICT, "system", {
            inviteCode: code,
            plexUserEmail: plexUser.email,
            attempt,
          })
        },
      }
    )
    if (!inviteResult.success || !inviteResult.invite) {
      return { success: false, error: inviteResult.error }
    }
    const invite = inviteResult.invite

    // Audit log that the invite was consumed
    logAuditEvent(AuditEventType.INVITE_CONSUMED, "system", {
      inviteId: invite.id,
      inviteCode: invite.code,
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
      return { success: false, error: failureReason }
    }

    try {
      await acceptInviteWithPropagationDelay(plexAuthToken, plexInviteResult.inviteID)
    } catch (acceptError) {
      // Accept failed - rollback the invite usage
      const failureReason = acceptError instanceof Error
        ? acceptError.message
        : "Failed to accept Plex invite"

      logAuditEvent(AuditEventType.INVITE_PLEX_FAILURE, "system", {
        inviteId: invite.id,
        plexUserEmail: plexUser.email,
        stage: "accept_invite",
        error: failureReason,
      })

      await rollbackInviteUsage(invite.id, plexUser.email, failureReason)
      return { success: false, error: failureReason }
    }

    try {
      await recordInviteUsage(invite.id, plexUser)
    } catch (recordError) {
      // Recording usage failed - rollback the invite usage
      // Note: The user may already be on Plex, but we should still restore the invite
      const failureReason = recordError instanceof Error
        ? recordError.message
        : "Failed to record invite usage"

      logAuditEvent(AuditEventType.INVITE_PLEX_FAILURE, "system", {
        inviteId: invite.id,
        plexUserEmail: plexUser.email,
        stage: "record_usage",
        error: failureReason,
      })

      await rollbackInviteUsage(invite.id, plexUser.email, failureReason)
      return { success: false, error: failureReason }
    }

    return { success: true }
  } catch (error) {
    logger.error("Error processing invite", error)

    if (error instanceof Error) {
      const isInviteError =
        error.message.includes("Invite") ||
        error.message.includes("maximum uses") ||
        error.message.includes("expired")

      return { success: false, error: isInviteError ? error.message : error.message }
    }

    return { success: false, error: "An unexpected error occurred" }
  }
}

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
  tx: Prisma.TransactionClient,
  jellyfinUserId: string,
  username: string
): Promise<{ id: string }> {
  let user = await tx.user.findUnique({
    where: { jellyfinUserId },
  })

  if (user) {
    return user
  }

  // Create new user
  user = await tx.user.create({
    data: {
      name: username,
      jellyfinUserId,
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
 * Process a Jellyfin invite: Create user on Jellyfin server with appropriate permissions.
 * Uses atomic validation to prevent TOCTOU race conditions.
 *
 * This function implements:
 * - Retry logic with exponential backoff for transaction conflicts (P2034)
 * - Compensating transaction (rollback) if Jellyfin operations fail after invite is consumed
 * - Audit logging for security-sensitive events
 */
export async function processJellyfinInvite(code: string, authData: JellyfinAuthData) {
  try {
    const { username, password } = authData

    // Basic validation
    if (!username || !password) {
      return { success: false, error: "Username and password are required" }
    }

    if (username.length < 3) {
      return { success: false, error: "Username must be at least 3 characters" }
    }

    if (password.length < 8) {
      return { success: false, error: "Password must be at least 8 characters" }
    }

    // Get server config first (before consuming the invite)
    const serverResult = await getActiveJellyfinServer()
    if (!serverResult.success) {
      return serverResult
    }
    const jellyfinServer = serverResult.data

    // Atomically validate and mark the invite as used with retry logic for transaction conflicts
    const inviteResult = await withRetry(
      () => validateAndUseInvite(code),
      {
        onConflict: (attempt) => {
          logAuditEvent(AuditEventType.INVITE_TRANSACTION_CONFLICT, "system", {
            inviteCode: code,
            jellyfinUsername: username,
            attempt,
          })
        },
      }
    )

    if (!inviteResult.success || !inviteResult.invite) {
      return { success: false, error: inviteResult.error }
    }
    const invite = inviteResult.invite

    // Verify this is a Jellyfin invite
    if (invite.serverType !== ServerType.JELLYFIN) {
      await rollbackInviteUsage(invite.id, username, "Invite is not for Jellyfin server")
      return { success: false, error: "This invite is for Plex, not Jellyfin" }
    }

    // Audit log that the invite was consumed
    logAuditEvent(AuditEventType.INVITE_CONSUMED, "system", {
      inviteId: invite.id,
      inviteCode: invite.code,
      serverType: "JELLYFIN",
      jellyfinUsername: username,
    })

    const jellyfinConfig = {
      url: jellyfinServer.url,
      apiKey: jellyfinServer.apiKey,
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
      return { success: false, error: failureReason }
    }

    const jellyfinUserId = createResult.userId

    // Step 2: Set library access permissions
    const libraryIds = invite.jellyfinLibraryIds
      ? (JSON.parse(invite.jellyfinLibraryIds) as string[])
      : undefined

    const policyResult = await setJellyfinUserPolicy(jellyfinConfig, jellyfinUserId, {
      libraryIds,
      allowDownloads: invite.allowDownloads,
      enableRemoteAccess: true,
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

      // Compensating transaction: delete the user we just created
      await deleteJellyfinUser(jellyfinConfig, jellyfinUserId)
      await rollbackInviteUsage(invite.id, username, failureReason)
      return { success: false, error: failureReason }
    }

    // Step 3: Record invite usage
    try {
      await recordJellyfinInviteUsage(invite.id, jellyfinUserId, username)
    } catch (recordError) {
      const failureReason = recordError instanceof Error
        ? recordError.message
        : "Failed to record invite usage"

      logAuditEvent(AuditEventType.INVITE_JELLYFIN_FAILURE, "system", {
        inviteId: invite.id,
        jellyfinUsername: username,
        jellyfinUserId,
        stage: "record_usage",
        error: failureReason,
      })

      // Note: User is already created on Jellyfin, but we should still restore the invite
      await rollbackInviteUsage(invite.id, username, failureReason)
      return { success: false, error: failureReason }
    }

    logger.info("Jellyfin invite processed successfully", {
      inviteId: invite.id,
      jellyfinUserId,
      username,
    })

    return {
      success: true,
      data: {
        jellyfinUserId,
        username,
        serverUrl: jellyfinServer.publicUrl || jellyfinServer.url,
      },
    }
  } catch (error) {
    logger.error("Error processing Jellyfin invite", error)

    if (error instanceof Error) {
      const isInviteError =
        error.message.includes("Invite") ||
        error.message.includes("maximum uses") ||
        error.message.includes("expired")

      return { success: false, error: isInviteError ? error.message : error.message }
    }

    return { success: false, error: "An unexpected error occurred" }
  }
}
