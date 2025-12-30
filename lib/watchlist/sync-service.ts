/**
 * Watchlist Sync Service
 *
 * Core orchestration for syncing Plex watchlists to Overseerr requests
 */

import { submitOverseerrRequest } from "@/lib/connections/overseerr"
import { MediaType, WatchlistSyncStatus } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { SyncResult } from "@/lib/validations/watchlist"
import { getPlexWatchlist, validatePlexToken } from "./plex-watchlist"

const logger = createLogger("WATCHLIST_SYNC")

export interface SyncUserWatchlistResult {
  success: boolean
  data?: SyncResult
  error?: string
}

/**
 * Sync a single user's watchlist
 * @param userId Database user ID
 */
export async function syncUserWatchlist(userId: string): Promise<SyncUserWatchlistResult> {
  const startTime = Date.now()

  try {
    // Get user with their Plex token and sync settings
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        plexAuthToken: true,
        email: true,
        watchlistSyncSettings: true,
      },
    })

    if (!user) {
      return { success: false, error: "User not found" }
    }

    if (!user.plexAuthToken) {
      logger.warn("User has no Plex auth token", { userId })
      await updateSyncSettings(userId, {
        lastSyncStatus: "failed",
        lastSyncError: "No Plex auth token - please log in again",
      })
      return { success: false, error: "No Plex auth token" }
    }

    // Validate token is still valid
    const tokenValid = await validatePlexToken(user.plexAuthToken)
    if (!tokenValid) {
      logger.warn("Plex token is invalid or expired", { userId })
      await updateSyncSettings(userId, {
        lastSyncStatus: "failed",
        lastSyncError: "Plex token expired - please log in again",
      })
      return { success: false, error: "Plex token is invalid or expired" }
    }

    // Get Overseerr configuration
    const overseerr = await prisma.overseerr.findFirst({
      where: { isActive: true },
    })

    if (!overseerr) {
      logger.warn("No active Overseerr configured", { userId })
      await updateSyncSettings(userId, {
        lastSyncStatus: "failed",
        lastSyncError: "No Overseerr server configured",
      })
      return { success: false, error: "No Overseerr server configured" }
    }

    // Fetch watchlist from Plex
    const watchlistResult = await getPlexWatchlist(user.plexAuthToken)
    if (!watchlistResult.success || !watchlistResult.data) {
      const error = watchlistResult.error || "Failed to fetch watchlist"
      logger.error("Failed to fetch Plex watchlist", undefined, { userId, error })
      await updateSyncSettings(userId, {
        lastSyncStatus: "failed",
        lastSyncError: error,
      })
      return { success: false, error }
    }

    const watchlistItems = watchlistResult.data
    logger.info("Fetched Plex watchlist", { userId, itemCount: watchlistItems.length })

    // Get existing sync history for comparison
    const existingHistory = await prisma.watchlistSyncHistory.findMany({
      where: { userId },
      select: { plexRatingKey: true, status: true },
    })
    const existingKeys = new Map(existingHistory.map((h) => [h.plexRatingKey, h.status]))

    // Process each watchlist item
    let itemsSynced = 0
    let itemsRequested = 0
    let itemsSkipped = 0
    let itemsFailed = 0
    const errors: string[] = []

    for (const item of watchlistItems) {
      try {
        // Skip if already processed and in a terminal state
        const existingStatus = existingKeys.get(item.ratingKey)
        if (
          existingStatus &&
          (existingStatus === WatchlistSyncStatus.REQUESTED ||
            existingStatus === WatchlistSyncStatus.ALREADY_AVAILABLE ||
            existingStatus === WatchlistSyncStatus.ALREADY_REQUESTED)
        ) {
          itemsSkipped++
          continue
        }

        // Need TMDB ID to request in Overseerr
        if (!item.tmdbId) {
          logger.debug("Skipping item without TMDB ID", {
            title: item.title,
            ratingKey: item.ratingKey,
          })
          itemsSkipped++
          continue
        }

        // Submit request to Overseerr
        const mediaType = item.type === "movie" ? "movie" : "tv"
        const requestResult = await submitOverseerrRequest(
          { name: overseerr.name, url: overseerr.url, apiKey: overseerr.apiKey },
          { mediaType, mediaId: item.tmdbId }
        )

        // Map Prisma MediaType
        const prismaMediaType = item.type === "movie" ? MediaType.MOVIE : MediaType.TV_SERIES

        // Determine status based on result
        let syncStatus: WatchlistSyncStatus
        let requestedAt: Date | null = null

        if (requestResult.status === "created") {
          syncStatus = WatchlistSyncStatus.REQUESTED
          requestedAt = new Date()
          itemsRequested++
        } else if (requestResult.status === "already_available") {
          syncStatus = WatchlistSyncStatus.ALREADY_AVAILABLE
        } else if (requestResult.status === "already_requested") {
          syncStatus = WatchlistSyncStatus.ALREADY_REQUESTED
        } else {
          syncStatus = WatchlistSyncStatus.FAILED
          itemsFailed++
          if (requestResult.error) {
            errors.push(`${item.title}: ${requestResult.error}`)
          }
        }

        // Upsert sync history record
        await prisma.watchlistSyncHistory.upsert({
          where: {
            userId_plexRatingKey: {
              userId,
              plexRatingKey: item.ratingKey,
            },
          },
          create: {
            userId,
            plexRatingKey: item.ratingKey,
            guid: item.guid,
            mediaType: prismaMediaType,
            title: item.title,
            year: item.year,
            tmdbId: item.tmdbId,
            tvdbId: item.tvdbId,
            imdbId: item.imdbId,
            status: syncStatus,
            requestedAt,
            overseerrRequestId: requestResult.requestId,
          },
          update: {
            status: syncStatus,
            requestedAt: requestedAt || undefined,
            overseerrRequestId: requestResult.requestId || undefined,
          },
        })

        itemsSynced++
      } catch (error) {
        logger.error("Error processing watchlist item", error, {
          title: item.title,
          userId,
        })
        itemsFailed++
        errors.push(`${item.title}: Processing error`)
      }
    }

    // Update sync settings with results
    const syncStatus = itemsFailed > 0 ? (itemsSynced > 0 ? "partial" : "failed") : "success"
    await updateSyncSettings(userId, {
      lastSyncAt: new Date(),
      lastSyncStatus: syncStatus,
      lastSyncError: errors.length > 0 ? errors.slice(0, 3).join("; ") : null,
      itemsSynced,
      itemsRequested,
    })

    const duration = Date.now() - startTime
    logger.info("Watchlist sync completed", {
      userId,
      itemsSynced,
      itemsRequested,
      itemsSkipped,
      itemsFailed,
      durationMs: duration,
    })

    return {
      success: true,
      data: {
        success: true,
        itemsSynced,
        itemsRequested,
        itemsSkipped,
        itemsFailed,
        errors: errors.length > 0 ? errors : undefined,
      },
    }
  } catch (error) {
    logger.error("Watchlist sync failed", error, { userId })
    await updateSyncSettings(userId, {
      lastSyncStatus: "failed",
      lastSyncError: error instanceof Error ? error.message : "Unknown error",
    })
    return {
      success: false,
      error: error instanceof Error ? error.message : "Sync failed",
    }
  }
}

/**
 * Helper to update sync settings
 */
async function updateSyncSettings(
  userId: string,
  data: {
    lastSyncAt?: Date
    lastSyncStatus?: string
    lastSyncError?: string | null
    itemsSynced?: number
    itemsRequested?: number
  }
): Promise<void> {
  // Get current settings to calculate cumulative totals
  const current = await prisma.watchlistSyncSettings.findUnique({
    where: { userId },
    select: { totalItemsSynced: true, totalItemsRequested: true },
  })

  const incrementSynced = data.itemsSynced ?? 0
  const incrementRequested = data.itemsRequested ?? 0

  await prisma.watchlistSyncSettings.upsert({
    where: { userId },
    create: {
      userId,
      syncEnabled: false,
      ...data,
      totalItemsSynced: incrementSynced,
      totalItemsRequested: incrementRequested,
    },
    update: {
      ...data,
      totalItemsSynced: (current?.totalItemsSynced ?? 0) + incrementSynced,
      totalItemsRequested: (current?.totalItemsRequested ?? 0) + incrementRequested,
    },
  })
}

/**
 * Sync all users who have sync enabled and are due for a sync
 * Called by the background job
 */
export async function syncAllEnabledUsers(): Promise<{
  usersProcessed: number
  usersSucceeded: number
  usersFailed: number
}> {
  const startTime = Date.now()

  try {
    // Get global sync interval
    const config = await prisma.config.findUnique({
      where: { id: "config" },
      select: { watchlistSyncIntervalMinutes: true },
    })
    const intervalMinutes = config?.watchlistSyncIntervalMinutes ?? 60

    // Find users who need to be synced
    const cutoffTime = new Date(Date.now() - intervalMinutes * 60 * 1000)

    const usersToSync = await prisma.watchlistSyncSettings.findMany({
      where: {
        syncEnabled: true,
        OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: cutoffTime } }],
      },
      select: { userId: true },
      take: 50, // Limit batch size
    })

    logger.info("Starting batch watchlist sync", {
      usersToSync: usersToSync.length,
      intervalMinutes,
    })

    let usersSucceeded = 0
    let usersFailed = 0

    // Process users sequentially to avoid rate limiting
    for (const { userId } of usersToSync) {
      try {
        const result = await syncUserWatchlist(userId)
        if (result.success) {
          usersSucceeded++
        } else {
          usersFailed++
        }

        // Small delay between users to be respectful of APIs
        await new Promise((resolve) => setTimeout(resolve, 1000))
      } catch (error) {
        logger.error("Error syncing user watchlist in batch", error, { userId })
        usersFailed++
      }
    }

    const duration = Date.now() - startTime
    logger.info("Batch watchlist sync completed", {
      usersProcessed: usersToSync.length,
      usersSucceeded,
      usersFailed,
      durationMs: duration,
    })

    return {
      usersProcessed: usersToSync.length,
      usersSucceeded,
      usersFailed,
    }
  } catch (error) {
    logger.error("Batch watchlist sync failed", error)
    return {
      usersProcessed: 0,
      usersSucceeded: 0,
      usersFailed: 0,
    }
  }
}
