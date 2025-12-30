"use server"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin"
import { globalWatchlistSyncSettingsSchema } from "@/lib/validations/watchlist"
import { syncUserWatchlist } from "@/lib/watchlist/sync-service"
import { getServerSession } from "next-auth"

/**
 * Get global watchlist sync settings (admin only)
 */
export async function getGlobalWatchlistSyncSettings() {
  const isAdmin = await requireAdmin()
  if (!isAdmin) {
    return { success: false as const, error: "Unauthorized" }
  }

  try {
    const config = await prisma.config.findUnique({
      where: { id: "config" },
      select: {
        watchlistSyncEnabled: true,
        watchlistSyncIntervalMinutes: true,
      },
    })

    return {
      success: true as const,
      data: {
        watchlistSyncEnabled: config?.watchlistSyncEnabled ?? false,
        watchlistSyncIntervalMinutes: config?.watchlistSyncIntervalMinutes ?? 60,
      },
    }
  } catch (error) {
    console.error("Error fetching global watchlist sync settings:", error)
    return { success: false as const, error: "Failed to fetch settings" }
  }
}

/**
 * Update global watchlist sync settings (admin only)
 */
export async function updateGlobalWatchlistSyncSettings(data: unknown) {
  const session = await getServerSession(authOptions)
  const isAdmin = await requireAdmin()
  if (!isAdmin) {
    return { success: false as const, error: "Unauthorized" }
  }

  // Validate input
  const validated = globalWatchlistSyncSettingsSchema.safeParse(data)
  if (!validated.success) {
    return { success: false as const, error: "Invalid input" }
  }

  try {
    // Check if Overseerr is configured before enabling
    if (validated.data.watchlistSyncEnabled) {
      const overseerr = await prisma.overseerr.findFirst({
        where: { isActive: true },
      })

      if (!overseerr) {
        return {
          success: false as const,
          error: "Cannot enable watchlist sync without an active Overseerr server",
        }
      }
    }

    await prisma.config.upsert({
      where: { id: "config" },
      create: {
        id: "config",
        watchlistSyncEnabled: validated.data.watchlistSyncEnabled,
        watchlistSyncIntervalMinutes: validated.data.watchlistSyncIntervalMinutes,
        updatedBy: session?.user?.id,
      },
      update: {
        watchlistSyncEnabled: validated.data.watchlistSyncEnabled,
        watchlistSyncIntervalMinutes: validated.data.watchlistSyncIntervalMinutes,
        updatedBy: session?.user?.id,
      },
    })

    return { success: true as const }
  } catch (error) {
    console.error("Error updating global watchlist sync settings:", error)
    return { success: false as const, error: "Failed to update settings" }
  }
}

/**
 * Get watchlist sync statistics (admin only)
 */
export async function getWatchlistSyncStats() {
  const isAdmin = await requireAdmin()
  if (!isAdmin) {
    return { success: false as const, error: "Unauthorized" }
  }

  try {
    const [usersWithSyncEnabled, totalItemsSynced, totalItemsRequested, recentHistory] =
      await Promise.all([
        prisma.watchlistSyncSettings.count({
          where: { syncEnabled: true },
        }),
        prisma.watchlistSyncHistory.count(),
        prisma.watchlistSyncHistory.count({
          where: { status: "REQUESTED" },
        }),
        prisma.watchlistSyncHistory.findMany({
          orderBy: { syncedAt: "desc" },
          take: 10,
          select: {
            id: true,
            title: true,
            mediaType: true,
            status: true,
            syncedAt: true,
            user: {
              select: { name: true, email: true },
            },
          },
        }),
      ])

    return {
      success: true as const,
      data: {
        usersWithSyncEnabled,
        totalItemsSynced,
        totalItemsRequested,
        recentHistory,
      },
    }
  } catch (error) {
    console.error("Error fetching watchlist sync stats:", error)
    return { success: false as const, error: "Failed to fetch stats" }
  }
}

/**
 * Force sync for a specific user (admin only)
 */
export async function forceUserWatchlistSync(userId: string) {
  const isAdmin = await requireAdmin()
  if (!isAdmin) {
    return { success: false as const, error: "Unauthorized" }
  }

  try {
    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    })

    if (!user) {
      return { success: false as const, error: "User not found" }
    }

    // Perform sync
    const result = await syncUserWatchlist(userId)

    if (!result.success) {
      return { success: false as const, error: result.error || "Sync failed" }
    }

    return {
      success: true as const,
      data: result.data,
    }
  } catch (error) {
    console.error("Error forcing user watchlist sync:", error)
    return { success: false as const, error: "Failed to sync" }
  }
}
