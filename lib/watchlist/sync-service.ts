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
 * 3. `NO_ACCESS`: the member is gone, disabled, or `getAccessLevel` is `none`
 *    (P11.13). Unshare, the Stripe revoke and removal also turn `syncEnabled` off.
 * 4. `NOT_ENTITLED`: `getAccessLevel` is `lapsed` (P4.5).
 * 5. `NO_PLEX_IDENTITY`: the member has no `plexUserId`.
 * 6. `OVERSEERR_USER_NOT_FOUND`: no Overseerr user has the member's `plexId`.
 *
 * A skip writes `lastSyncStatus: "skipped"` with the fixed copy from
 * `./skip.ts` and returns `{ success: true, skipped }`, so the job is not retried.
 *
 * ## A run (GAP-02)
 *
 * The whole watchlist is read with the stored ETag; a 304 ends the run after
 * one request. The items go through `processWatchlistItems` (`./sync-run.ts`).
 * The run is `success` only when nothing failed; `partial` when some items
 * failed or every processed item had no TMDB match (with that reason); and
 * `failed` when every processed item failed. The new ETag is stored only
 * after a run that left nothing behind (no failures, nothing deferred by the
 * request cap), so a 304 never hides an item that still needs a retry.
 *
 * @module lib/watchlist/sync-service
 */

import { entitledUserWhere, getAccessLevel } from "@/lib/access"
import { buildOverseerrUserIndex, findOverseerrUserId } from "@/lib/connections/overseerr"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { getPlexWatchlist, validatePlexToken } from "./plex-watchlist"
import { WATCHLIST_SKIP_COPY, type WatchlistSkipCode } from "./skip"
import { markRemovedItems, processWatchlistItems } from "./sync-run"

const logger = createLogger("WATCHLIST_SYNC")

interface SyncResult {
  success: boolean
  /** The watchlist answered 304: nothing changed since the last complete run. */
  notModified: boolean
  itemsSynced: number
  itemsRequested: number
  itemsAvailable: number
  itemsAlreadyRequested: number
  /** No TMDB match. */
  itemsSkipped: number
  itemsNotPermitted: number
  itemsFailed: number
  /** Left for the next run by the request cap. */
  itemsDeferred: number
  errors?: string[]
}

const EMPTY_RESULT: SyncResult = {
  success: true,
  notModified: false,
  itemsSynced: 0,
  itemsRequested: 0,
  itemsAvailable: 0,
  itemsAlreadyRequested: 0,
  itemsSkipped: 0,
  itemsNotPermitted: 0,
  itemsFailed: 0,
  itemsDeferred: 0,
}

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

    // A removed member has no access: skip, no retry
    if (!user) return await skip(userId, "NO_ACCESS")

    if (!config?.watchlistSyncEnabled) return await skip(userId, "WATCHLIST_DISABLED")
    if (!user.watchlistSyncSettings?.syncEnabled) return await skip(userId, "NOT_OPTED_IN")
    const access = await getAccessLevel(userId)
    if (access === "none") return await skip(userId, "NO_ACCESS")
    if (access !== "full") return await skip(userId, "NOT_ENTITLED")
    if (!user.plexUserId) return await skip(userId, "NO_PLEX_IDENTITY")

    if (!user.plexAuthToken) {
      logger.warn("User has no Plex auth token", { userId })
      await updateSyncSettings(userId, {
        lastSyncStatus: "failed",
        lastSyncError: "No Plex sign-in. Sign in again.",
      })
      return { success: false, error: "No Plex auth token" }
    }

    // Get Overseerr configuration
    const overseerr = await prisma.overseerr.findFirst({
      where: { isActive: true },
    orderBy: { updatedAt: "desc" },
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
        lastSyncError: "Could not reach Overseerr. Try again later.",
      })
      return { success: false, error: "Could not read the Overseerr users" }
    }
    const overseerrUserId = findOverseerrUserId(index.data, user.plexUserId)
    if (overseerrUserId === null) return await skip(userId, "OVERSEERR_USER_NOT_FOUND")

    // Validate token is still valid
    const tokenStatus = await validatePlexToken(user.plexAuthToken)
    if (tokenStatus === "unreachable") {
      // Not a verdict on the token: the next run tries again (GAP-05)
      logger.warn("Plex was unreachable while checking the token", { userId })
      await updateSyncSettings(userId, {
        lastSyncStatus: "failed",
        lastSyncError: "Plex was unreachable. The next sync will try again.",
      })
      return { success: false, error: "Plex was unreachable" }
    }
    if (tokenStatus === "invalid") {
      logger.warn("Plex token is invalid or expired", { userId })
      await updateSyncSettings(userId, {
        lastSyncStatus: "failed",
        lastSyncError: "Your Plex sign-in expired. Sign in again.",
      })
      return { success: false, error: "Plex token is invalid or expired" }
    }

    // Read the whole watchlist; an unchanged one is a single 304
    const settingsRow = await prisma.watchlistSyncSettings.findUnique({
      where: { userId },
      select: { watchlistEtag: true },
    })
    const watchlist = await getPlexWatchlist(user.plexAuthToken, { etag: settingsRow?.watchlistEtag })
    if (!watchlist.success) {
      logger.error("Failed to fetch Plex watchlist", undefined, { userId, error: watchlist.error })
      await updateSyncSettings(userId, { lastSyncStatus: "failed", lastSyncError: watchlist.error })
      return { success: false, error: watchlist.error }
    }
    if (watchlist.notModified) {
      logger.info("Watchlist unchanged since the last sync", { userId })
      await prisma.watchlistSyncSettings.updateMany({ where: { userId }, data: { lastSyncAt: new Date() } })
      return { success: true, data: { ...EMPTY_RESULT, notModified: true } }
    }
    logger.info("Fetched Plex watchlist", { userId, itemCount: watchlist.data.length })

    const { counts, errors } = await processWatchlistItems({
      userId,
      userToken: user.plexAuthToken,
      items: watchlist.data,
      overseerr: overseerrConfig,
      overseerrUserId,
    })

    // Titles missing from a complete read were removed from the watchlist (P11.14)
    const removed = watchlist.complete
      ? await markRemovedItems(userId, watchlist.data.map((item) => item.ratingKey))
      : 0

    // A run that leaves work behind keeps no ETag, so the next run reads the list again
    const complete = watchlist.complete && counts.failed === 0 && counts.deferred === 0
    const handled = counts.requested + counts.available + counts.alreadyRequested + counts.skipped + counts.notPermitted
    let lastSyncStatus = "success"
    let lastSyncError: string | null = errors.length > 0 ? errors.slice(0, 3).join("; ") : null
    if (counts.failed > 0) {
      lastSyncStatus = handled > 0 ? "partial" : "failed"
    } else if (handled > 0 && counts.skipped === handled) {
      lastSyncStatus = "partial"
      lastSyncError = `Nothing could be requested: ${counts.skipped} new ${counts.skipped === 1 ? "item has" : "items have"} no TMDB match.`
    }

    await updateSyncSettings(userId, {
      lastSyncAt: new Date(),
      lastSyncStatus,
      lastSyncError,
      itemsSynced: counts.synced,
      itemsRequested: counts.requested,
      itemsSkipped: counts.skipped,
      watchlistEtag: complete ? watchlist.etag : null,
    })

    logger.info("Watchlist sync completed", { userId, ...counts, removed, durationMs: Date.now() - startTime })

    return {
      success: true,
      data: {
        success: true,
        notModified: false,
        itemsSynced: counts.synced,
        itemsRequested: counts.requested,
        itemsAvailable: counts.available,
        itemsAlreadyRequested: counts.alreadyRequested,
        itemsSkipped: counts.skipped,
        itemsNotPermitted: counts.notPermitted,
        itemsFailed: counts.failed,
        itemsDeferred: counts.deferred,
        errors: errors.length > 0 ? errors : undefined,
      },
    }
  } catch (error) {
    // The error text stays in the log: the stored copy is shown to the member
    logger.error("Watchlist sync failed", error, { userId })
    await updateSyncSettings(userId, {
      lastSyncStatus: "failed",
      lastSyncError: "Sync failed. Try again later.",
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
    itemsSkipped?: number
    watchlistEtag?: string | null
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
