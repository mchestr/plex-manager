/**
 * The BullMQ schedule for the watchlist sync, kept in step with `Config`.
 *
 * Boot and the admin settings save both call {@link ensureWatchlistSchedule},
 * so turning sync on, off, or changing its interval takes effect without a
 * restart. Upserting the same scheduler id keeps one schedule however many
 * processes call it. Without `REDIS_URL` there is no queue: the database-lease
 * fallback (`lib/watchlist/fallback.ts`) reads the same settings every poll.
 */

import { removeScheduledJob, scheduleRepeatingJob } from "@/lib/queue/client"
import { JOB_TYPES } from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"
import { TimeoutError, withTimeout } from "@/lib/utils/with-timeout"
import { getWatchlistSyncInterval, isWatchlistSyncEnabled } from "@/lib/watchlist/config"

const logger = createLogger("WATCHLIST_SCHEDULE")

const WATCHLIST_SCHEDULER_ID = "watchlist-sync-scheduled"

/** How long a scheduler write may wait on Redis. */
const SCHEDULER_TIMEOUT_MS = 5000

export type WatchlistScheduleResult =
  | { ok: true; state: "scheduled"; intervalMinutes: number }
  | { ok: true; state: "removed" | "no-redis" }
  | { ok: false; code: "TIMEOUT" | "FAILED" }

/**
 * Upserts the repeating `watchlist:sync-all` job scheduler while sync is on,
 * with the current interval, and removes it while sync is off. Never throws.
 */
export async function ensureWatchlistSchedule(): Promise<WatchlistScheduleResult> {
  if (!process.env.REDIS_URL) return { ok: true, state: "no-redis" }

  try {
    if (await isWatchlistSyncEnabled()) {
      const intervalMinutes = await getWatchlistSyncInterval()
      await withTimeout(
        scheduleRepeatingJob(
          WATCHLIST_SCHEDULER_ID,
          JOB_TYPES.WATCHLIST_SYNC_ALL,
          { triggeredBy: "scheduled" },
          intervalMinutes * 60 * 1000
        ),
        SCHEDULER_TIMEOUT_MS,
        "Scheduling the watchlist sync"
      )
      logger.info(`Watchlist sync scheduled every ${intervalMinutes} minutes`)
      return { ok: true, state: "scheduled", intervalMinutes }
    }

    await withTimeout(
      removeScheduledJob(WATCHLIST_SCHEDULER_ID),
      SCHEDULER_TIMEOUT_MS,
      "Removing the watchlist sync schedule"
    )
    logger.info("Watchlist sync disabled - scheduler removed")
    return { ok: true, state: "removed" }
  } catch (error) {
    const code = error instanceof TimeoutError ? "TIMEOUT" : "FAILED"
    logger.error("Could not update the watchlist sync schedule", { code, error })
    return { ok: false, code }
  }
}
