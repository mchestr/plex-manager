"use server"

import { revalidatePath } from "next/cache"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { getAllPlexServerUsers } from "@/lib/connections/plex"
import { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { createLogger } from "@/lib/utils/logger"
import { getActiveService } from "@/lib/data/active-service"

const logger = createLogger("IMPORT_PLEX_USERS")

/** Why one Plex user was not created, in words an admin can act on; the database's text is only logged. */
function importFailure(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return "another account already uses their email"
  }
  return "could not be created"
}

/**
 * Import this server's Plex members into the database (GAP-06, admin only):
 * users with an accepted share of this server and the owner's managed users
 * (created without an email). A pending invite is reported, not imported, and
 * friends who share only another server are never seen. A user who fails is
 * reported in `errors` and the rest still import.
 */
export const importPlexUsers = adminAction({
  fallbackError: "Failed to import users",
  handler: async (_input, { userId: adminId }) => {
    const plexServer = await getActiveService("plex")
    if (!plexServer) {
      return fail("NOT_FOUND", "No active Plex server configured")
    }

    const usersResult = await getAllPlexServerUsers({
      url: plexServer.url,
      token: plexServer.token,
      machineIdentifier: plexServer.machineIdentifier,
    })
    if (!usersResult.success || !usersResult.data) {
      return fail("UPSTREAM_UNAVAILABLE", "Plex didn't return its users. Try again in a few minutes.")
    }

    const plexUsers = usersResult.data.filter((plexUser) => !plexUser.pending)
    const pending = usersResult.data.length - plexUsers.length
    let imported = 0
    let skipped = 0
    let managed = 0
    const errors: string[] = []
    const createdUserIds: string[] = []

    // One query for every user already imported, instead of one per Plex user
    const existing = await prisma.user.findMany({
      where: { plexUserId: { in: plexUsers.map((plexUser) => plexUser.id) } },
      select: { plexUserId: true },
    })
    const existingIds = new Set(existing.map((user) => user.plexUserId))

    // One create per user, so an email collision is reported for that user only
    for (const plexUser of plexUsers) {
      if (existingIds.has(plexUser.id)) {
        skipped++
        continue
      }
      try {
        const created = await prisma.user.create({
          data: {
            plexUserId: plexUser.id,
            name: plexUser.name,
            // A managed user has no plex.tv account, so no email
            email: plexUser.managed ? null : plexUser.email || null,
            image: plexUser.thumb || null,
            isAdmin: plexServer.adminPlexUserId === plexUser.id,
            primaryAuthService: "plex",
          },
        })
        createdUserIds.push(created.id)
        imported++
        if (plexUser.managed) managed++
      } catch (error) {
        logger.warn("Could not import a Plex user", { plexUserId: plexUser.id, error })
        errors.push(`${plexUser.name} (${plexUser.id}): ${importFailure(error)}`)
      }
    }

    logAuditEvent(AuditEventType.MEMBERS_IMPORTED, adminId, {
      imported,
      skipped,
      managed,
      pending,
      failed: errors.length,
      createdUserIds,
    })
    revalidatePath("/admin/users")
    return ok({ imported, skipped, managed, pending, errors })
  },
})
