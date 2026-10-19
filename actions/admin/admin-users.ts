"use server"

import { adminAction } from "@/lib/actions/define-action"
import { ok, type ActionErrorCode, type ActionFailure, type ActionResult } from "@/lib/actions/result"
import { requireAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { endUserSessions } from "@/lib/session-revocation"
import { createLogger } from "@/lib/utils/logger"
import { userIdSchema } from "@/lib/validations/shared-schemas"
import { z } from "zod"

const logger = createLogger("ADMIN")

/** Why an admin action on a user was refused. */
type UserActionRefusal = "SELF" | "OWNER" | "LAST_ADMIN" | "NOT_FOUND"

interface UserActionResult {
  success: boolean
  error?: string
  code?: UserActionRefusal
  message?: string
}

/** Whether `plexUserId` owns the active Plex server, whom every login promotes. */
async function isPlexServerOwner(plexUserId: string | null): Promise<boolean> {
  if (!plexUserId) {
    return false
  }
  const plexServer = await prisma.plexServer.findFirst({
    where: { isActive: true },
    select: { adminPlexUserId: true },
  })
  return plexServer?.adminPlexUserId === plexUserId
}

async function revalidateUserPages(userId: string) {
  const { revalidatePath } = await import("next/cache")
  revalidatePath(`/admin/users/${userId}`)
  revalidatePath("/admin/users")
}

/**
 * Get user by ID (admin only)
 */
export async function getUserById(userId: string) {
  await requireAdmin()

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
    },
  })

  return user
}

/**
 * Update user admin status (admin only).
 *
 * Refuses to demote the caller (`SELF`), the Plex server owner, whom the next
 * login would promote again (`OWNER`), and the last remaining admin
 * (`LAST_ADMIN`). A demotion ends the user's sessions.
 */
export async function updateUserAdminStatus(userId: string, isAdmin: boolean): Promise<UserActionResult> {
  const session = await requireAdmin()

  try {
    // Prevent users from removing their own admin status
    if (session.user.id === userId && !isAdmin) {
      return {
        success: false,
        code: "SELF",
        error: "You cannot remove your own admin privileges",
      }
    }

    // Get current user to check if status is changing
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true, plexUserId: true },
    })

    if (!currentUser) {
      return {
        success: false,
        code: "NOT_FOUND",
        error: "User not found",
      }
    }

    // Only update if status is actually changing
    if (currentUser.isAdmin === isAdmin) {
      return {
        success: true,
        message: `User is already ${isAdmin ? "an admin" : "a regular user"}`,
      }
    }

    if (!isAdmin) {
      if (await isPlexServerOwner(currentUser.plexUserId)) {
        return {
          success: false,
          code: "OWNER",
          error: "The Plex server owner is always an admin",
        }
      }
      if ((await prisma.user.count({ where: { isAdmin: true } })) <= 1) {
        return {
          success: false,
          code: "LAST_ADMIN",
          error: "You cannot remove the last admin",
        }
      }
    }

    // Update user admin status
    await prisma.user.update({
      where: { id: userId },
      data: { isAdmin },
    })

    // Log audit event
    logAuditEvent(
      isAdmin ? AuditEventType.ADMIN_PRIVILEGE_GRANTED : AuditEventType.ADMIN_PRIVILEGE_REVOKED,
      session.user.id,
      {
        targetUserId: userId,
        previousAdminStatus: !isAdmin,
        newAdminStatus: isAdmin,
      }
    )

    if (!isAdmin) {
      await endUserSessions(userId, "demoted", session.user.id)
    }

    await revalidateUserPages(userId)

    return { success: true }
  } catch (error) {
    logger.error("Error updating user admin status", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update user admin status",
    }
  }
}

/** The action codes plus the refusals the user admin actions return. */
type UserActionCode = ActionErrorCode | UserActionRefusal

/**
 * Disable or re-enable a user's account (admin only, audited).
 *
 * Disabling sets `User.disabledAt` and ends the user's sessions; a disabled
 * user cannot sign in. Enabling clears it. Refuses the caller (`SELF`) and the
 * Plex server owner (`OWNER`).
 */
export const setUserDisabled = adminAction({
  input: z.object({ userId: userIdSchema, disabled: z.boolean() }),
  fallbackError: "Failed to update the account",
  handler: async ({ userId, disabled }, { userId: actorId }): Promise<ActionResult<null, UserActionCode>> => {
    if (actorId === userId) {
      return refused("SELF", "You cannot disable your own account")
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plexUserId: true, disabledAt: true },
    })
    if (!user) {
      return refused("NOT_FOUND", "User not found")
    }

    if ((user.disabledAt !== null) === disabled) {
      return ok(null)
    }

    if (disabled && (await isPlexServerOwner(user.plexUserId))) {
      return refused("OWNER", "The Plex server owner cannot be disabled")
    }

    await prisma.user.update({
      where: { id: userId },
      data: { disabledAt: disabled ? new Date() : null },
    })

    logAuditEvent(disabled ? AuditEventType.USER_DISABLED : AuditEventType.USER_ENABLED, actorId, {
      targetUserId: userId,
    })

    if (disabled) {
      await endUserSessions(userId, "disabled", actorId)
    }

    await revalidateUserPages(userId)

    return ok(null)
  },
})

function refused(code: UserActionRefusal, error: string): ActionFailure<UserActionCode> {
  return { success: false, code, error }
}
