"use server"

import { prisma } from "@/lib/prisma"
import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { requireAdmin } from "@/lib/admin"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { configDiff } from "@/lib/security/config-diff"
import { createLogger } from "@/lib/utils/logger"
import { globalWatchlistSyncSettingsSchema } from "@/lib/validations/watchlist"

const logger = createLogger("ADMIN_WATCHLIST_ACTIONS")

/**
 * Update global watchlist sync settings (admin only)
 */
export const updateGlobalWatchlistSyncSettings = adminAction({
  input: globalWatchlistSyncSettingsSchema,
  fallbackError: "Failed to update settings",
  handler: async ({ watchlistSyncEnabled, watchlistSyncIntervalMinutes }, { userId }) => {
    // Watchlist sync files requests in Overseerr, so it needs an active server
    if (watchlistSyncEnabled) {
      const overseerr = await prisma.overseerr.findFirst({ where: { isActive: true } })
      if (!overseerr) {
        return fail("VALIDATION", "Cannot enable watchlist sync without an active Overseerr server")
      }
    }

    const before = await prisma.config.findUnique({
      where: { id: "config" },
      select: { watchlistSyncEnabled: true, watchlistSyncIntervalMinutes: true },
    })
    const values = { watchlistSyncEnabled, watchlistSyncIntervalMinutes }
    await prisma.config.upsert({
      where: { id: "config" },
      create: { id: "config", ...values, updatedBy: userId },
      update: { ...values, updatedBy: userId },
    })

    logAuditEvent(AuditEventType.CONFIG_CHANGED, userId, configDiff("watchlist", before, values))
    return ok(null)
  },
})

/**
 * Get watchlist sync statistics (admin only)
 */
export async function getWatchlistSyncStats() {
  await requireAdmin()

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
    logger.error("Error fetching watchlist sync stats", error)
    return { success: false as const, error: "Failed to fetch stats" }
  }
}
