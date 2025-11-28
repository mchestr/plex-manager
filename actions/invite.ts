"use server"

import { requireAdmin } from "@/lib/admin"
import {
  acceptPlexInvite,
  getPlexUserInfo,
  inviteUserToPlexServer
} from "@/lib/connections/plex"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { Prisma } from "@prisma/client"

const logger = createLogger("INVITE")

// Constants
const INVITE_CODE_LENGTH = 8
const INVITE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // Removed: 0, O, I, l, 1
const DEFAULT_INVITE_EXPIRATION_HOURS = 48
const PLEX_PROPAGATION_DELAY_MS = 2000
const TRANSACTION_TIMEOUT_MS = 10000

// Types
interface PlexUser {
  id: string
  username: string
  email: string
  thumb?: string | null
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
  maxUses: number
  useCount: number
  expiresAt: Date | null
  librarySectionIds: string | null
  allowDownloads: boolean
}

interface ValidateAndUseResult {
  success: boolean
  error?: string
  invite?: InviteData
}

/**
 * Atomically validate and use an invite within a single transaction.
 * Uses Serializable isolation level to prevent TOCTOU race conditions.
 * This ensures that concurrent requests cannot both pass validation.
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
            maxUses: updatedInvite.maxUses,
            useCount: updatedInvite.useCount,
            expiresAt: updatedInvite.expiresAt,
            librarySectionIds: updatedInvite.librarySectionIds,
            allowDownloads: updatedInvite.allowDownloads,
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
    // Handle Prisma serialization failures (concurrent transactions)
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2034") {
        // Transaction conflict due to concurrent write
        return { success: false, error: "Please try again" }
      }
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
    maxUses?: number
    expiresIn?: string // "1d", "7d", "30d", "never"
    librarySectionIds?: number[] // If undefined/null, all libraries are shared
    allowDownloads?: boolean // Default: false
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

    const invite = await prisma.invite.create({
      data: {
        code,
        createdBy: session.user.id,
        maxUses: options.maxUses || 1,
        expiresAt,
        librarySectionIds: options.librarySectionIds && options.librarySectionIds.length > 0
          ? JSON.stringify(options.librarySectionIds)
          : null,
        allowDownloads: options.allowDownloads ?? false,
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

    // Atomically validate and mark the invite as used
    // This prevents race conditions where multiple requests could use the same invite
    const inviteResult = await validateAndUseInvite(code)
    if (!inviteResult.success || !inviteResult.invite) {
      return { success: false, error: inviteResult.error }
    }
    const invite = inviteResult.invite

    // Build invite settings from stored invite data
    const inviteSettings = {
      librarySectionIds: invite.librarySectionIds
        ? (JSON.parse(invite.librarySectionIds) as number[])
        : undefined,
      allowDownloads: invite.allowDownloads,
    }

    const plexInviteResult = await inviteUserToPlexServer(
      {
        url: plexServer.url,
        token: plexServer.token,
      },
      plexUser.email,
      inviteSettings
    )

    if (!plexInviteResult.success) {
      return { success: false, error: plexInviteResult.error || "Failed to invite user to Plex server" }
    }

    await acceptInviteWithPropagationDelay(plexAuthToken, plexInviteResult.inviteID)
    await recordInviteUsage(invite.id, plexUser)

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
