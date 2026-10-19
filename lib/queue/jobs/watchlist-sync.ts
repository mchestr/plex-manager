/**
 * Watchlist Sync Job Handlers
 *
 * Processes watchlist sync jobs for individual users and batch operations.
 */

import { Job } from "bullmq"
import {
  JOB_TYPES,
  WatchlistSyncUserPayload,
  WatchlistSyncAllPayload,
  WatchlistSyncUserResult,
  WatchlistSyncAllResult,
} from "../types"
import { syncUserWatchlist, syncAllEnabledUsers } from "@/lib/watchlist/sync-service"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("WATCHLIST_SYNC_JOB")

/**
 * Process a single user watchlist sync
 *
 * `syncUserWatchlist` re-checks the global toggle, the member's opt-in, their
 * entitlement (which may have lapsed after the job was queued) and their Plex
 * and Overseerr identities when the job runs, whoever queued it. A skip
 * finishes the job as `{ success: true, skipped }`, without a retry (SEC-28,
 * GAP-39).
 */
async function processWatchlistSyncUser(
  job: Job<WatchlistSyncUserPayload, WatchlistSyncUserResult>
): Promise<WatchlistSyncUserResult> {
  const { userId, triggeredBy, triggeredByUserId } = job.data

  logger.info("Starting user watchlist sync job", {
    jobId: job.id,
    userId,
    triggeredBy,
    triggeredByUserId,
    attempt: job.attemptsMade + 1,
  })

  const result = await syncUserWatchlist(userId)

  if (!result.success) {
    // Throw error to trigger retry mechanism
    throw new Error(result.error || "Sync failed")
  }

  if (result.skipped) {
    logger.info("User watchlist sync job skipped", { jobId: job.id, userId, reason: result.skipped })
    return { success: true, skipped: result.skipped, itemsSynced: 0, itemsRequested: 0, itemsSkipped: 0, itemsFailed: 0 }
  }

  const syncResult: WatchlistSyncUserResult = {
    success: true,
    itemsSynced: result.data?.itemsSynced ?? 0,
    itemsRequested: result.data?.itemsRequested ?? 0,
    itemsSkipped: result.data?.itemsSkipped ?? 0,
    itemsFailed: result.data?.itemsFailed ?? 0,
    errors: result.data?.errors,
  }

  logger.info("User watchlist sync job completed", {
    jobId: job.id,
    userId,
    ...syncResult,
  })

  return syncResult
}

/**
 * Process batch watchlist sync for all enabled users
 */
async function processWatchlistSyncAll(
  job: Job<WatchlistSyncAllPayload, WatchlistSyncAllResult>
): Promise<WatchlistSyncAllResult> {
  const { triggeredBy, triggeredByUserId } = job.data

  logger.info("Starting batch watchlist sync job", {
    jobId: job.id,
    triggeredBy,
    triggeredByUserId,
  })

  const result = await syncAllEnabledUsers()

  logger.info("Batch watchlist sync job completed", {
    jobId: job.id,
    ...result,
  })

  return result
}

/**
 * Get processor function for watchlist job types
 */
export function getWatchlistProcessor(
  jobType: string
): ((job: Job) => Promise<unknown>) | null {
  switch (jobType) {
    case JOB_TYPES.WATCHLIST_SYNC_USER:
      return processWatchlistSyncUser as (job: Job) => Promise<unknown>
    case JOB_TYPES.WATCHLIST_SYNC_ALL:
      return processWatchlistSyncAll as (job: Job) => Promise<unknown>
    default:
      return null
  }
}
