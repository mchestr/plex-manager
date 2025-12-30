"use server"

import { WatchlistSyncStatus } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { updateWatchlistSyncSettingsSchema } from "@/lib/validations/watchlist"
import { syncUserWatchlist } from "@/lib/watchlist/sync-service"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

/**
 * Get current user's watchlist sync settings and status
 */
export async function getWatchlistSyncSettings() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return { success: false as const, error: "Not authenticated" }
  }

  try {
    // Get user's Plex auth token status and sync settings
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        plexAuthToken: true,
        watchlistSyncSettings: true,
      },
    })

    // Check if Overseerr is configured
    const overseerr = await prisma.overseerr.findFirst({
      where: { isActive: true },
      select: { id: true },
    })

    // Check if global sync is enabled
    const config = await prisma.config.findUnique({
      where: { id: "config" },
      select: { watchlistSyncEnabled: true },
    })

    // Get recent sync history if sync is enabled
    let recentHistory: Array<{
      id: string
      title: string
      year: number | null
      mediaType: string
      status: string
      syncedAt: Date
    }> = []

    if (user?.watchlistSyncSettings?.syncEnabled) {
      recentHistory = await prisma.watchlistSyncHistory.findMany({
        where: { userId: session.user.id },
        orderBy: { syncedAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          year: true,
          mediaType: true,
          status: true,
          syncedAt: true,
        },
      })
    }

    return {
      success: true as const,
      data: {
        hasPlexToken: !!user?.plexAuthToken,
        hasOverseerr: !!overseerr,
        globalSyncEnabled: config?.watchlistSyncEnabled ?? false,
        settings: user?.watchlistSyncSettings
          ? {
              syncEnabled: user.watchlistSyncSettings.syncEnabled,
              lastSyncAt: user.watchlistSyncSettings.lastSyncAt,
              lastSyncStatus: user.watchlistSyncSettings.lastSyncStatus,
              lastSyncError: user.watchlistSyncSettings.lastSyncError,
              itemsSynced: user.watchlistSyncSettings.itemsSynced,
              itemsRequested: user.watchlistSyncSettings.itemsRequested,
              totalItemsSynced: user.watchlistSyncSettings.totalItemsSynced,
              totalItemsRequested: user.watchlistSyncSettings.totalItemsRequested,
            }
          : null,
        recentHistory,
      },
    }
  } catch (error) {
    console.error("Error fetching watchlist sync settings:", error)
    return { success: false as const, error: "Failed to fetch settings" }
  }
}

/**
 * Update user's watchlist sync settings
 */
export async function updateWatchlistSyncSettings(data: unknown) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return { success: false as const, error: "Not authenticated" }
  }

  // Validate input
  const validated = updateWatchlistSyncSettingsSchema.safeParse(data)
  if (!validated.success) {
    return { success: false as const, error: "Invalid input" }
  }

  try {
    // Check prerequisites if enabling
    if (validated.data.syncEnabled) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { plexAuthToken: true },
      })

      if (!user?.plexAuthToken) {
        return {
          success: false as const,
          error: "Please log in with Plex to enable watchlist sync",
        }
      }

      const overseerr = await prisma.overseerr.findFirst({
        where: { isActive: true },
      })

      if (!overseerr) {
        return {
          success: false as const,
          error: "Overseerr is not configured. Please contact an administrator.",
        }
      }

      const config = await prisma.config.findUnique({
        where: { id: "config" },
        select: { watchlistSyncEnabled: true },
      })

      if (!config?.watchlistSyncEnabled) {
        return {
          success: false as const,
          error: "Watchlist sync is not enabled globally. Please contact an administrator.",
        }
      }
    }

    // Upsert settings
    await prisma.watchlistSyncSettings.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        syncEnabled: validated.data.syncEnabled,
      },
      update: {
        syncEnabled: validated.data.syncEnabled,
      },
    })

    return { success: true as const }
  } catch (error) {
    console.error("Error updating watchlist sync settings:", error)
    return { success: false as const, error: "Failed to update settings" }
  }
}

/**
 * Trigger a manual sync for the current user
 */
export async function triggerWatchlistSync() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return { success: false as const, error: "Not authenticated" }
  }

  try {
    // Check if sync is enabled for user
    const settings = await prisma.watchlistSyncSettings.findUnique({
      where: { userId: session.user.id },
    })

    if (!settings?.syncEnabled) {
      return { success: false as const, error: "Watchlist sync is not enabled" }
    }

    // Perform sync
    const result = await syncUserWatchlist(session.user.id)

    if (!result.success) {
      return { success: false as const, error: result.error || "Sync failed" }
    }

    return {
      success: true as const,
      data: result.data,
    }
  } catch (error) {
    console.error("Error triggering watchlist sync:", error)
    return { success: false as const, error: "Failed to trigger sync" }
  }
}

/**
 * Get user's watchlist sync history
 */
export async function getWatchlistSyncHistory(options?: {
  limit?: number
  offset?: number
  status?: WatchlistSyncStatus
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return { success: false as const, error: "Not authenticated" }
  }

  const limit = options?.limit ?? 20
  const offset = options?.offset ?? 0

  try {
    const where = {
      userId: session.user.id,
      ...(options?.status ? { status: options.status } : {}),
    }

    const [items, total] = await Promise.all([
      prisma.watchlistSyncHistory.findMany({
        where,
        orderBy: { syncedAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          title: true,
          year: true,
          mediaType: true,
          status: true,
          syncedAt: true,
          requestedAt: true,
          overseerrRequestId: true,
        },
      }),
      prisma.watchlistSyncHistory.count({ where }),
    ])

    return {
      success: true as const,
      data: {
        items,
        total,
        hasMore: offset + items.length < total,
      },
    }
  } catch (error) {
    console.error("Error fetching watchlist sync history:", error)
    return { success: false as const, error: "Failed to fetch history" }
  }
}
