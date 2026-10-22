"use server"

import { revalidatePath } from "next/cache"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { getAllPlexServerUsers } from "@/lib/connections/plex"
import { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("IMPORT_PLEX_USERS")

/** Why one Plex user was not created, in words an admin can act on; the database's text is only logged. */
function importFailure(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return "another account already uses their email"
  }
  return "could not be created"
}

/**
 * Import the Plex server's users (admin only): creates a `User` for each one
 * without an account. A user who fails is reported in `errors` and the rest
 * still import.
 */
export const importPlexUsers = adminAction({
  fallbackError: "Failed to import users",
  handler: async () => {
    const plexServer = await prisma.plexServer.findFirst({ where: { isActive: true } })
    if (!plexServer) {
      return fail("NOT_FOUND", "No active Plex server configured")
    }

    const usersResult = await getAllPlexServerUsers({ url: plexServer.url, token: plexServer.token })
    if (!usersResult.success || !usersResult.data) {
      return fail("UPSTREAM_UNAVAILABLE", "Plex didn't return its users. Try again in a few minutes.")
    }

    const plexUsers = usersResult.data
    let imported = 0
    let skipped = 0
    const errors: string[] = []

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
        await prisma.user.create({
          data: {
            plexUserId: plexUser.id,
            name: plexUser.name,
            email: plexUser.email || null,
            image: plexUser.thumb || null,
            isAdmin: plexServer.adminPlexUserId === plexUser.id,
          },
        })
        imported++
      } catch (error) {
        logger.warn("Could not import a Plex user", { plexUserId: plexUser.id, error })
        errors.push(`${plexUser.name} (${plexUser.id}): ${importFailure(error)}`)
      }
    }

    revalidatePath("/admin/users")
    return ok({ imported, skipped, errors })
  },
})
