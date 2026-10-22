"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { setJellyfinAccountDisabled } from "@/lib/connections/jellyfin-users"
import { enqueueRoleSync } from "@/lib/discord/role-sync"
import { isJellyfinAdmin } from "@/lib/jellyfin-auth"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { endUserSessions } from "@/lib/session-revocation"
import { userIdSchema } from "@/lib/validations/shared-schemas"

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

    const server = await prisma.jellyfinServer.findFirst({ where: { isActive: true }, select: { url: true, apiKey: true } })
    if (!server) return fail("UPSTREAM_UNAVAILABLE", "No Jellyfin server is configured")

    const adminStatus = await isJellyfinAdmin(server, user.jellyfinUserId)
    if (adminStatus !== "not-admin") {
      return fail(
        "FORBIDDEN",
        adminStatus === "admin"
          ? "Jellyfin administrators keep their access. Change their role in Jellyfin first."
          : "Jellyfin couldn't confirm this account isn't an administrator. Try again later."
      )
    }

    const result = await setJellyfinAccountDisabled(server, user.jellyfinUserId, !enabled)
    if (!result.success) return fail("UPSTREAM_UNAVAILABLE", result.error)

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
