/**
 * Watchlist Sync Service
 *
 * Syncs a member's Plex watchlist to Overseerr requests, each filed as the
 * member's own Overseerr user (`X-Api-User`), so that user's approval rules,
 * quotas and attribution apply (P4.13, SEC-27).
 *
 * ## Skips
 *
 * `syncUserWatchlist` checks, in order, before it calls Plex or files a
 * request, whatever triggered it (the member, an admin or the batch):
 *
 * 1. `WATCHLIST_DISABLED`: `Config.watchlistSyncEnabled` is off.
 * 2. `NOT_OPTED_IN`: the member's `syncEnabled` is false (GAP-39).
 * 3. `NOT_ENTITLED`: `getAccessLevel` is below `full` (P4.5; a disabled member is `none`).
 * 4. `NO_PLEX_IDENTITY`: the member has no `plexUserId`.
 * 5. `OVERSEERR_USER_NOT_FOUND`: no Overseerr user has the member's `plexId`.
 *
 * A skip writes `lastSyncStatus: "skipped"` with the fixed copy from
 * `./skip.ts` and returns `{ success: true, skipped }`, so the job is not retried.
 *
 * @module lib/watchlist/sync-service
 */

import { entitledUserWhere, getAccessLevel } from "@/lib/access"
import { buildOverseerrUserIndex, findOverseerrUserId, submitOverseerrRequest } from "@/lib/connections/overseerr"
import { MediaType, WatchlistSyncStatus } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { SyncResult } from "@/lib/validations/watchlist"
import { getPlexWatchlist, validatePlexToken } from "./plex-watchlist"
import { WATCHLIST_SKIP_COPY, type WatchlistSkipCode } from "./skip"

const logger = createLogger("WATCHLIST_SYNC")

export interface SyncUserWatchlistResult {
  success: boolean
  /** Set when the sync did not run; `success` is then true. */
  skipped?: WatchlistSkipCode
  data?: SyncResult
  error?: string
}

/** Record a skip on the member's settings row, if they have one. */
async function skip(userId: string, code: WatchlistSkipCode): Promise<SyncUserWatchlistResult> {
  logger.info("Watchlist sync skipped", { userId, reason: code })
  await prisma.watchlistSyncSettings.updateMany({
    where: { userId },
    data: { lastSyncAt: new Date(), lastSyncStatus: "skipped", lastSyncError: WATCHLIST_SKIP_COPY[code] },
  })
  return { success: true, skipped: code }
}

/**
 * Sync a single user's watchlist
 * @param userId Database user ID
 */
export async function syncUserWatchlist(userId: string): Promise<SyncUserWatchlistResult> {
  const startTime = Date.now()

  try {
    const [config, user] = await Promise.all([
      prisma.config.findUnique({ where: { id: "config" }, select: { watchlistSyncEnabled: true } }),
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          plexUserId: true,
          plexAuthToken: true,
          watchlistSyncSettings: { select: { syncEnabled: true } },
        },
      }),
    ])

    if (!user) {
      return { success: false, error: "User not found" }
    }

    if (!config?.watchlistSyncEnabled) return await skip(userId, "WATCHLIST_DISABLED")
    if (!user.watchlistSyncSettings?.syncEnabled) return await skip(userId, "NOT_OPTED_IN")
    if ((await getAccessLevel(userId)) !== "full") return await skip(userId, "NOT_ENTITLED")
    if (!user.plexUserId) return await skip(userId, "NO_PLEX_IDENTITY")

    if (!user.plexAuthToken) {
      logger.warn("User has no Plex auth token", { userId })
      await updateSyncSettings(userId, {
        lastSyncStatus: "failed",
        lastSyncError: "No Plex auth token - please log in again",
      })
      return { success: false, error: "No Plex auth token" }
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

    // Requests are filed as the member's own Overseerr user, never as the admin
    const overseerrConfig = { url: overseerr.url, apiKey: overseerr.apiKey }
    const index = await buildOverseerrUserIndex(overseerrConfig)
    if (!index.ok) {
      logger.warn("Could not read the Overseerr users", { userId, code: index.code, status: index.status })
      await updateSyncSettings(userId, {
        lastSyncStatus: "failed",
        lastSyncError: "Could not reach Overseerr. Please try again later.",
      })
      return { success: false, error: "Could not read the Overseerr users" }
    }
    const overseerrUserId = findOverseerrUserId(index.data, user.plexUserId)
    if (overseerrUserId === null) return await skip(userId, "OVERSEERR_USER_NOT_FOUND")

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
          overseerrConfig,
          { mediaType, mediaId: item.tmdbId },
          { overseerrUserId }
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
    // The error text stays in the log: the stored copy is shown to the member
    logger.error("Watchlist sync failed", error, { userId })
    await updateSyncSettings(userId, {
      lastSyncStatus: "failed",
      lastSyncError: "Sync failed. Please try again later.",
    })
    return { success: false, error: "Sync failed" }
  }
}

/**
 * Write a run's status, and add its counts to the totals with atomic
 * increments, so two overlapping runs cannot lose each other's counts (SEC-27).
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
      totalItemsSynced: { increment: incrementSynced },
      totalItemsRequested: { increment: incrementRequested },
    },
  })
}

/**
 * Sync all users who have sync enabled and are due for a sync
 * Called by the background job. Nothing runs while the global toggle is off.
 *
 * With Stripe gating on, only entitled members are selected (admin, exempt,
 * or an ACTIVE or PAST_DUE subscription; never a disabled user), so a lapsed
 * member's watchlist files no requests (SEC-28). The rest are counted and
 * logged as skipped.
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
      select: { watchlistSyncEnabled: true, watchlistSyncIntervalMinutes: true, stripeEnabled: true },
    })
    if (!config?.watchlistSyncEnabled) {
      logger.info("Batch watchlist sync skipped", { reason: "WATCHLIST_DISABLED" })
      return { usersProcessed: 0, usersSucceeded: 0, usersFailed: 0 }
    }
    const intervalMinutes = config?.watchlistSyncIntervalMinutes ?? 60
    const entitled = entitledUserWhere(config?.stripeEnabled ?? false)

    // Find users who need to be synced
    const cutoffTime = new Date(Date.now() - intervalMinutes * 60 * 1000)
    const due = {
      syncEnabled: true,
      OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: cutoffTime } }],
    }

    const usersToSync = await prisma.watchlistSyncSettings.findMany({
      where: { ...due, user: entitled },
      select: { userId: true },
      take: 50, // Limit batch size
    })

    // Only for the log, so a failed count never stops the batch
    const skipped = await prisma.watchlistSyncSettings
      .count({ where: { ...due, user: { NOT: entitled } } })
      .catch(() => 0)
    if (skipped > 0) {
      logger.info("Batch watchlist sync skipped users", { skipped, reason: "NOT_ENTITLED" })
    }

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
