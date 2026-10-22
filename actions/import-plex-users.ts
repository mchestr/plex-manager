"use server"

import { requireAdmin } from "@/lib/admin"
import { getAllPlexServerUsers } from "@/lib/connections/plex"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { revalidatePath } from "next/cache"

const logger = createLogger("IMPORT_PLEX_USERS")

/**
 * Import this server's Plex members into the database (GAP-06): users with an
 * accepted share of this server and the owner's managed users (created
 * without an email). A pending invite is reported, not imported, and friends
 * who share only another server are never seen.
 */
export async function importPlexUsers(): Promise<{
  success: boolean
  imported: number
  skipped: number
  /** Managed users among the imported ones. */
  managed: number
  /** Pending invites, left out until they are accepted. */
  pending: number
  errors: string[]
}> {
  try {
    await requireAdmin()

    // Get active Plex server configuration
    const plexServer = await prisma.plexServer.findFirst({
      where: { isActive: true },
    })

    if (!plexServer) {
      return {
        success: false,
        imported: 0,
        skipped: 0,
        managed: 0,
        pending: 0,
        errors: ["No active Plex server configured"],
      }
    }

    // Fetch users from Plex server
    const usersResult = await getAllPlexServerUsers({
      url: plexServer.url,
      token: plexServer.token,
      machineIdentifier: plexServer.machineIdentifier,
    })

    if (!usersResult.success || !usersResult.data) {
      return {
        success: false,
        imported: 0,
        skipped: 0,
        managed: 0,
        pending: 0,
        errors: [usersResult.error || "Failed to fetch Plex users"],
      }
    }

    const plexUsers = usersResult.data.filter((plexUser) => !plexUser.pending)
    const pending = usersResult.data.length - plexUsers.length
    let imported = 0
    let skipped = 0
    let managed = 0
    const errors: string[] = []

    // One query for every user already imported, instead of one per Plex user
    const existing = await prisma.user.findMany({
      where: { plexUserId: { in: plexUsers.map((plexUser) => plexUser.id) } },
      select: { plexUserId: true },
    })
    const existingIds = new Set(existing.map((user) => user.plexUserId))

    // One create per user, so an email collision is reported for that user only
    for (const plexUser of plexUsers) {
      try {
        if (existingIds.has(plexUser.id)) {
          skipped++
          continue
        }

        // Check if this user is the admin
        const isAdmin = plexServer.adminPlexUserId === plexUser.id

        // Create new user
        await prisma.user.create({
          data: {
            plexUserId: plexUser.id,
            name: plexUser.name,
            // A managed user has no plex.tv account, so no email
            email: plexUser.managed ? null : plexUser.email || null,
            image: plexUser.thumb || null,
            isAdmin,
          },
        })

        imported++
        if (plexUser.managed) managed++
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        errors.push(`${plexUser.name} (${plexUser.id}): ${errorMessage}`)
      }
    }

    // Revalidate the users page
    revalidatePath("/admin/users")

    return {
      success: true,
      imported,
      skipped,
      managed,
      pending,
      errors,
    }
  } catch (error) {
    logger.error("Error importing Plex users", error)
    return {
      success: false,
      imported: 0,
      skipped: 0,
      managed: 0,
      pending: 0,
      errors: [error instanceof Error ? error.message : "Failed to import users"],
    }
  }
}
