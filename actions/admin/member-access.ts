"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { type ActionErrorCode, type ActionResult, fail, ok } from "@/lib/actions/result"
import { setJellyfinAccountDisabled } from "@/lib/connections/jellyfin-users"
import { enqueueRoleSync } from "@/lib/discord/role-sync"
import { isJellyfinAdmin } from "@/lib/jellyfin-auth"
import { eraseMember, type EraseCode, type EraseReport } from "@/lib/members/erase"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { endUserSessions } from "@/lib/session-revocation"
import { userIdSchema } from "@/lib/validations/shared-schemas"
import { getActiveService } from "@/lib/data/active-service"

type RemoveMemberCode = ActionErrorCode | EraseCode

/** Copy for a refused Jellyfin change. */
const JELLYFIN_FAILURE = {
  JELLYFIN_ADMIN: "Jellyfin administrators keep their access. Change their role in Jellyfin first.",
  JELLYFIN_UNAVAILABLE: "Jellyfin refused the change or could not be reached. Try again later.",
} as const

/**
 * Turns a member's Jellyfin account off or on (P11.10, GAP-27).
 *
 * Only `IsDisabled` changes on the Jellyfin policy, so their libraries stay as
 * they were. Refuses the caller and any Jellyfin administrator, including one
 * whose status Jellyfin could not confirm. Turning access off ends the
 * member's sessions (which also re-syncs their Discord role); turning it on
 * re-syncs the role. Each change is audited.
 */
export const setMemberJellyfinAccess = adminAction({
  input: z.object({ userId: userIdSchema, enabled: z.boolean() }),
  fallbackError: "Could not change Jellyfin access",
  handler: async ({ userId, enabled }, { userId: actorId }) => {
    if (userId === actorId) {
      return fail("FORBIDDEN", "You cannot change your own Jellyfin access")
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { jellyfinUserId: true } })
    if (!user) return fail("NOT_FOUND", "User not found")
    if (!user.jellyfinUserId) return fail("VALIDATION", "This member has no Jellyfin account")

    const server = await getActiveService("jellyfin")
    if (!server) return fail("UPSTREAM_UNAVAILABLE", "No Jellyfin server is configured")

    const adminStatus = await isJellyfinAdmin(server, user.jellyfinUserId)
    if (adminStatus !== "not-admin") {
      return fail(
        "FORBIDDEN",
        adminStatus === "admin"
          ? JELLYFIN_FAILURE.JELLYFIN_ADMIN
          : "Jellyfin couldn't confirm this account isn't an administrator. Try again later."
      )
    }

    const result = await setJellyfinAccountDisabled(server, user.jellyfinUserId, !enabled)
    if (!result.success) {
      return fail(result.code === "JELLYFIN_ADMIN" ? "FORBIDDEN" : "UPSTREAM_UNAVAILABLE", JELLYFIN_FAILURE[result.code])
    }
    if (result.status === "not_found") return fail("NOT_FOUND", "The Jellyfin account no longer exists")

    logAuditEvent(enabled ? AuditEventType.JELLYFIN_ACCESS_ENABLED : AuditEventType.JELLYFIN_ACCESS_DISABLED, actorId, {
      targetUserId: userId,
      jellyfinUserId: user.jellyfinUserId,
    })

    if (enabled) {
      await enqueueRoleSync(userId, "access_granted")
    } else {
      await endUserSessions(userId, "unshared", actorId)
    }

    revalidatePath(`/admin/users/${userId}`)
    revalidatePath("/admin/users")
    return ok(null)
  },
})

/**
 * What removing a member would do (admin only): `eraseMember`'s dry run, with
 * the external effects it plans and the rows it would delete or anonymise.
 * Writes nothing. The remove dialog lists it before the admin confirms.
 *
 * @param input - `{ userId }`
 */
export const previewMemberRemoval = adminAction({
  input: z.object({ userId: userIdSchema }),
  fallbackError: "Could not count the member's data",
  handler: async ({ userId }, { userId: actorId }): Promise<ActionResult<EraseReport, RemoveMemberCode>> =>
    eraseMember(userId, { actorId, dryRun: true }),
})

/**
 * Removes a member and their data (admin only, audited as `MEMBER_ERASED`;
 * P11.13, GAP-31). `confirmName` must be the member's display name, typed
 * (case and outer spaces ignored), or the action refuses with `VALIDATION`.
 * Limited to 10 per hour per admin. See `lib/members/erase.ts` for the order
 * and the refusals.
 *
 * @param input - `{ userId, confirmName }`
 */
export const removeMember = adminAction({
  input: z.object({ userId: userIdSchema, confirmName: z.string().max(200) }),
  rateLimit: { name: "admin:remove-member" },
  fallbackError: "Could not remove the member",
  handler: async ({ userId, confirmName }, { userId: actorId }): Promise<ActionResult<EraseReport, RemoveMemberCode>> => {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } })
    if (!user) return fail("NOT_FOUND", "That member no longer exists.")
    const displayName = user.name ?? user.email ?? "Unknown member"
    if (confirmName.trim().toLowerCase() !== displayName.toLowerCase()) {
      return fail("VALIDATION", "Type the member's name exactly to confirm.", {
        fieldErrors: { confirmName: ["The name doesn't match"] },
      })
    }

    const result = await eraseMember(userId, { actorId, dryRun: false })
    if (result.success) {
      revalidatePath("/admin/users")
    }
    return result
  },
})
