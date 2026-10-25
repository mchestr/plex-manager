"use server"

import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { updateWatchlistSyncSettingsSchema } from "@/lib/validations/watchlist"
import type { WatchlistSkipCode } from "@/lib/watchlist/skip"
import type { WatchlistCounts } from "@/lib/watchlist/summary"
import { syncUserWatchlist } from "@/lib/watchlist/sync-service"
import { memberAction } from "@/lib/actions/define-action"
import { hasEntitlement, NOT_ENTITLED_MESSAGE } from "@/lib/actions/entitlement"
import { fail, ok, type ActionResult } from "@/lib/actions/result"

const logger = createLogger("WATCHLIST_ACTIONS")

const QUEUE_UNAVAILABLE_COPY = "The sync queue is unavailable. Try again in a few minutes."

/**
 * Get current user's watchlist sync settings, status and recent history.
 * A lapsed member may still read them (`read`).
 */
export const getWatchlistSyncSettings = memberAction({
  entitlement: "read",
  fallbackError: "Failed to fetch settings",
  handler: async (_input, { userId }) => {
    // Get user's Plex auth token status and sync settings
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        plexAuthToken: true,
        watchlistSyncSettings: true,
      },
    })

    // Check if Overseerr is configured
    const overseerr = await prisma.overseerr.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
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

    let counts: WatchlistCounts | null = null

    if (user?.watchlistSyncSettings?.syncEnabled) {
      const [rows, byStatus] = await Promise.all([
        prisma.watchlistSyncHistory.findMany({
          where: { userId },
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
        }),
        prisma.watchlistSyncHistory.groupBy({ by: ["status"], where: { userId }, _count: { _all: true } }),
      ])
      recentHistory = rows
      const count = (status: string) => byStatus.find((row) => row.status === status)?._count._all ?? 0
      counts = {
        requested: count("REQUESTED"),
        available: count("ALREADY_AVAILABLE"),
        alreadyRequested: count("ALREADY_REQUESTED"),
        skipped: count("SKIPPED_NO_EXTERNAL_ID"),
        notPermitted: count("NOT_PERMITTED"),
      }
    }

    return ok({
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
        counts,
    })
  },
})

/**
 * Update user's watchlist sync settings
 */
export const updateWatchlistSyncSettings = memberAction({
  input: updateWatchlistSyncSettingsSchema,
  fallbackError: "Failed to update settings",
  handler: async (settings, { userId }) => {
    // Check prerequisites if enabling; turning sync off needs no membership
    if (settings.syncEnabled) {
      if (!(await hasEntitlement(userId, "full"))) {
        return fail("NOT_ENTITLED", NOT_ENTITLED_MESSAGE)
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { plexAuthToken: true },
      })

      if (!user?.plexAuthToken) {
        return fail("CONFLICT", "Please log in with Plex to enable watchlist sync")
      }

      const overseerr = await prisma.overseerr.findFirst({
        where: { isActive: true },
      orderBy: { updatedAt: "desc" },
      })

      if (!overseerr) {
        return fail("CONFLICT", "Overseerr is not configured. Please contact an administrator.")
      }

      const config = await prisma.config.findUnique({
        where: { id: "config" },
        select: { watchlistSyncEnabled: true },
      })

      if (!config?.watchlistSyncEnabled) {
        return fail("CONFLICT", "Watchlist sync is not enabled globally. Please contact an administrator.")
      }
    }

    // Upsert settings
    await prisma.watchlistSyncSettings.upsert({
      where: { userId },
      create: {
        userId,
        syncEnabled: settings.syncEnabled,
      },
      update: {
        syncEnabled: settings.syncEnabled,
      },
    })

    return ok(null)
  },
})

/** A queued job (with Redis), or the counts of a sync run in this request. */
export type TriggerWatchlistSyncData =
  | { queued: true; jobId: string; message: string }
  | {
      queued: false
      skipped?: WatchlistSkipCode
      /** The watchlist has not changed since the last complete sync. */
      notModified?: boolean
      counts?: WatchlistCounts
      itemsFailed?: number
    }

/**
 * Trigger a manual sync for the current user, at most 4 an hour
 * (`watchlist:manual`). Uses the job queue if Redis is configured, where a
 * trigger while the member's job is waiting or running joins that job;
 * otherwise it falls back to direct execution.
 */
export const triggerWatchlistSync = memberAction({
  entitlement: "full",
  rateLimit: { name: "watchlist:manual" },
  fallbackError: "Failed to trigger sync",
  handler: async (_input, { userId }): Promise<ActionResult<TriggerWatchlistSyncData>> => {
    // Check if sync is enabled for user
    const settings = await prisma.watchlistSyncSettings.findUnique({
      where: { userId },
    })

    if (!settings?.syncEnabled) {
      return fail("CONFLICT", "Watchlist sync is not enabled")
    }

    // Check if queue is available (Redis configured)
    const { isRedisConfigured } = await import("@/lib/queue/connection")

    if (isRedisConfigured()) {
      // Use job queue; a trigger while the member's job waits or runs joins it
      const { enqueueFromRequest } = await import("@/lib/queue/request-path")
      const { JOB_TYPES } = await import("@/lib/queue/types")

      const queued = await enqueueFromRequest(JOB_TYPES.WATCHLIST_SYNC_USER, {
        userId,
        triggeredBy: "manual",
        triggeredByUserId: userId,
      })
      if (!queued.ok) return fail("UPSTREAM_UNAVAILABLE", QUEUE_UNAVAILABLE_COPY)
      const { jobId } = queued

      logger.info("Watchlist sync job queued", { userId, jobId })

      return ok({
        queued: true,
        jobId,
        message: "Sync job has been queued and will be processed shortly",
      })
    }

    // Fallback: Direct execution when Redis is not configured
    const result = await syncUserWatchlist(userId)

    if (!result.success) {
      logger.warn("Manual watchlist sync failed", { userId, error: result.error })
      return fail("UPSTREAM_UNAVAILABLE", "Sync failed. Please try again later.")
    }

    const data = result.data
    return ok({
      queued: false,
      skipped: result.skipped,
      notModified: data?.notModified,
      counts: data && {
        requested: data.itemsRequested,
        available: data.itemsAvailable,
        alreadyRequested: data.itemsAlreadyRequested,
        skipped: data.itemsSkipped,
        notPermitted: data.itemsNotPermitted,
      },
      itemsFailed: data?.itemsFailed,
    })
  },
})
