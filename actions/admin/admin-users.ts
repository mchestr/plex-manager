"use server"

import { adminAction } from "@/lib/actions/define-action"
import { ok, type ActionErrorCode, type ActionFailure, type ActionResult } from "@/lib/actions/result"
import { isPlexServerOwner } from "@/lib/members/owner"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { enqueueRoleSync } from "@/lib/discord/role-sync"
import { endUserSessions } from "@/lib/session-revocation"
import { parseRole, roleKeySchema } from "@/lib/permissions"
import { userIdSchema } from "@/lib/validations/shared-schemas"
import { z } from "zod"

/** Why an admin action on a user was refused. */
type UserActionRefusal = "SELF" | "OWNER" | "LAST_ADMIN" | "NOT_FOUND" | "ADMIN"

async function revalidateUserPages(userId: string) {
  const { revalidatePath } = await import("next/cache")
  revalidatePath(`/admin/users/${userId}`)
  revalidatePath("/admin/users")
}

/** The action codes plus the refusals the user admin actions return. */
type UserActionCode = ActionErrorCode | UserActionRefusal

/**
 * Update user admin status (admin only, audited).
 *
 * Refuses to demote the caller (`SELF`), the Plex server owner, whom the next
 * login would promote again (`OWNER`), and the last remaining admin
 * (`LAST_ADMIN`). A demotion ends the user's sessions. Setting the status the
 * user already has succeeds without a change.
 */
export const updateUserAdminStatus = adminAction({
  input: z.object({ userId: userIdSchema, isAdmin: z.boolean() }),
  fallbackError: "Failed to update user admin status",
  handler: async ({ userId, isAdmin }, { userId: actorId }): Promise<ActionResult<null, UserActionCode>> => {
    if (actorId === userId && !isAdmin) {
      return refused("SELF", "You cannot remove your own admin privileges")
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true, plexUserId: true },
    })
    if (!currentUser) {
      return refused("NOT_FOUND", "User not found")
    }

    if (currentUser.isAdmin === isAdmin) {
      return ok(null)
    }

    if (!isAdmin) {
      if (await isPlexServerOwner(currentUser.plexUserId)) {
        return refused("OWNER", "The Plex server owner is always an admin")
      }
      if ((await prisma.user.count({ where: { isAdmin: true } })) <= 1) {
        return refused("LAST_ADMIN", "You cannot remove the last admin")
      }
    }

    // An admin holds every permission, so a promotion clears the role: a later demotion must not bring it back
    await prisma.user.update({ where: { id: userId }, data: isAdmin ? { isAdmin, role: null } : { isAdmin } })

    logAuditEvent(isAdmin ? AuditEventType.ADMIN_PRIVILEGE_GRANTED : AuditEventType.ADMIN_PRIVILEGE_REVOKED, actorId, {
      targetUserId: userId,
      previousAdminStatus: !isAdmin,
      newAdminStatus: isAdmin,
    })

    if (!isAdmin) {
      await endUserSessions(userId, "demoted", actorId)
    }

    await revalidateUserPages(userId)

    return ok(null)
  },
})

/**
 * Assign a built-in role to a user, or remove it with `role: null` (admin
 * only, audited). Only an admin can call it, so a role holder cannot grant
 * roles, to themselves or anyone. An admin already holds every permission, so
 * refusing them a role (`ADMIN`) keeps the two kinds of access apart. Removing
 * a role ends the user's sessions, so the access stops at once; setting the
 * role the user already has succeeds without a change.
 */
export const setUserRole = adminAction({
  input: z.object({ userId: userIdSchema, role: roleKeySchema.nullable() }),
  fallbackError: "Failed to update the user's role",
  handler: async ({ userId, role }, { userId: actorId }): Promise<ActionResult<null, UserActionCode>> => {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true, role: true } })
    if (!user) {
      return refused("NOT_FOUND", "User not found")
    }
    if (user.isAdmin) {
      return refused("ADMIN", "Admins already have every permission")
    }

    const previous = parseRole(user.role)
    if (previous === role) {
      return ok(null)
    }

    await prisma.user.update({ where: { id: userId }, data: { role } })

    logAuditEvent(AuditEventType.USER_ROLE_CHANGED, actorId, {
      targetUserId: userId,
      previousRole: previous,
      newRole: role,
    })

    if (previous !== null) {
      await endUserSessions(userId, "demoted", actorId)
    }

    await revalidateUserPages(userId)

    return ok(null)
  },
})

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
    } else {
      await enqueueRoleSync(userId, "enabled")
    }

    await revalidateUserPages(userId)

    return ok(null)
  },
})

function refused(code: UserActionRefusal, error: string): ActionFailure<UserActionCode> {
  return { success: false, code, error }
}
