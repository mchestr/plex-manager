"use server"

import { requireAdmin } from "@/lib/admin"
import { getAllPlexServerUsers } from "@/lib/connections/plex"
import { prisma } from "@/lib/prisma"
import { getActivePlexService } from "@/lib/services/service-helpers"
import { createLogger } from "@/lib/utils/logger"
import { revalidatePath } from "next/cache"

const logger = createLogger("IMPORT_PLEX_USERS")

/**
 * Import users from Plex server into the database
 * Creates User records for Plex users that don't already exist
 */
export async function importPlexUsers(): Promise<{
  success: boolean
  imported: number
  skipped: number
  errors: string[]
}> {
  try {
    await requireAdmin()

    // Get active Plex service configuration
    const plexService = await getActivePlexService()

    if (!plexService) {
      return {
        success: false,
        imported: 0,
        skipped: 0,
        errors: ["No active Plex server configured"],
      }
    }

    // Fetch users from Plex server
    const usersResult = await getAllPlexServerUsers({
      url: plexService.url ?? "",
      token: plexService.config.token,
    })

    if (!usersResult.success || !usersResult.data) {
      return {
        success: false,
        imported: 0,
        skipped: 0,
        errors: [usersResult.error || "Failed to fetch Plex users"],
      }
    }

    const plexUsers = usersResult.data
    let imported = 0
    let skipped = 0
    const errors: string[] = []

    // Process each Plex user
    for (const plexUser of plexUsers) {
      try {
        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
          where: { plexUserId: plexUser.id },
        })

        if (existingUser) {
          skipped++
          continue
        }

        // Check if this user is the admin
        const isAdmin = plexService.config.adminPlexUserId === plexUser.id

        // Create new user
        await prisma.user.create({
          data: {
            plexUserId: plexUser.id,
            name: plexUser.name,
            email: plexUser.email || null,
            image: plexUser.thumb || null,
            isAdmin,
          },
        })

        imported++
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
      errors,
    }
  } catch (error) {
    logger.error("Error importing Plex users", error)
    return {
      success: false,
      imported: 0,
      skipped: 0,
      errors: [error instanceof Error ? error.message : "Failed to import users"],
    }
  }
}
