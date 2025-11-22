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

interface InviteValidationResult {
  success: boolean
  error?: string
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

/**
 * Validate invite within a transaction (atomic check and mark as used)
 */
async function markInviteAsUsed(inviteId: string): Promise<InviteValidationResult> {
  try {
    await prisma.$transaction(
      async (tx) => {
        const currentInvite = await tx.invite.findUnique({
          where: { id: inviteId },
        })

        if (!currentInvite) {
          throw new Error("Invite not found")
        }

        if (currentInvite.useCount >= currentInvite.maxUses) {
          throw new Error("Invite has reached maximum uses")
        }

        if (currentInvite.expiresAt && currentInvite.expiresAt < new Date()) {
          throw new Error("Invite has expired")
        }

        await tx.invite.update({
          where: { id: inviteId },
          data: { useCount: { increment: 1 } },
        })
      },
      { timeout: TRANSACTION_TIMEOUT_MS }
    )

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to mark invite as used"
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
 * Process an invite: Invite user to Plex server and accept it
 */
export async function processInvite(code: string, plexAuthToken: string) {
  try {
    const inviteCheck = await validateInvite(code)
    if (!inviteCheck.success || !inviteCheck.data) {
      return inviteCheck
    }
    const invite = inviteCheck.data

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

    const markUsedResult = await markInviteAsUsed(invite.id)
    if (!markUsedResult.success) {
      return { success: false, error: markUsedResult.error }
    }

    // Build invite settings from stored invite data
    const inviteSettings = {
      librarySectionIds: invite.librarySectionIds
        ? (JSON.parse(invite.librarySectionIds) as number[])
        : undefined,
      allowDownloads: invite.allowDownloads,
    }

    const inviteResult = await inviteUserToPlexServer(
      {
        hostname: plexServer.hostname,
        port: plexServer.port,
        protocol: plexServer.protocol,
        token: plexServer.token,
      },
      plexUser.email,
      inviteSettings
    )

    if (!inviteResult.success) {
      return { success: false, error: inviteResult.error || "Failed to invite user to Plex server" }
    }

    await acceptInviteWithPropagationDelay(plexAuthToken, inviteResult.inviteID)
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
