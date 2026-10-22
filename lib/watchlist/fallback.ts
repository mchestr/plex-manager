/**
 * Watchlist sync without Redis (SEC-49).
 *
 * Without `REDIS_URL` there is no BullMQ schedule, so one process runs the sync
 * on its interval under the `watchlist-sync` database lease. The poller is built
 * whatever the database flag says at boot and reads the flag and the interval
 * on every poll, so turning sync on in settings, or changing its interval,
 * takes effect within one poll and without a restart.
 *
 * ```
 * every poll while enabled and the lease is ours (onHeldTick):
 *   if no run in flight and (never ran, or interval passed since the last start):
 *     start syncAllEnabledUsers()   # not awaited; the next poll sees it in flight
 * ```
 *
 * @module
 */

import { onShutdown } from "@/lib/instrumentation/shutdown"
import { LeaseLock } from "@/lib/locks/lease-lock"
import { LeasePoller } from "@/lib/locks/lease-poller"
import { createLogger } from "@/lib/utils/logger"
import { getWatchlistSyncInterval, isWatchlistSyncEnabled } from "@/lib/watchlist/config"
import { syncAllEnabledUsers } from "@/lib/watchlist/sync-service"

const logger = createLogger("WATCHLIST_FALLBACK")

/** How often the fallback polls (acquire, enabled check, interval check). */
const DEFAULT_FALLBACK_POLL_INTERVAL_MS = 60 * 1000

function pollIntervalMs(): number {
  const parsed = Number.parseInt(process.env.WATCHLIST_SYNC_POLL_INTERVAL_MS ?? "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FALLBACK_POLL_INTERVAL_MS
}

/**
 * Starts the lease-held watchlist sync poller, unless `ENABLE_WATCHLIST_SYNC`
 * is `false` or shutdown has begun. Only for processes without `REDIS_URL`.
 *
 * @returns the poller, or null when none was built
 */
export async function startWatchlistFallback({ signal }: { signal: AbortSignal }): Promise<LeasePoller | null> {
  if (process.env.ENABLE_WATCHLIST_SYNC === "false") {
    logger.debug("Watchlist sync disabled via ENABLE_WATCHLIST_SYNC=false")
    return null
  }
  if (signal.aborted) return null

  let inFlight: Promise<void> | null = null
  let lastStartedAt: number | null = null

  const runSync = async () => {
    try {
      const result = await syncAllEnabledUsers()
      logger.info(
        `Watchlist sync completed: ${result.usersProcessed} users processed, ${result.usersSucceeded} succeeded, ${result.usersFailed} failed`
      )
    } catch (error) {
      logger.error("Failed to run watchlist sync", { error })
    }
  }

  const poller = new LeasePoller(
    new LeaseLock({ name: "watchlist-sync" }),
    {
      isEnabled: isWatchlistSyncEnabled,
      onLockAcquired: async () => logger.info("Watchlist sync lease acquired"),
      onLockLost: async () => logger.info("Watchlist sync lease released"),
      onHeldTick: async () => {
        if (inFlight || signal.aborted) return
        const intervalMs = (await getWatchlistSyncInterval()) * 60 * 1000
        if (lastStartedAt !== null && Date.now() - lastStartedAt < intervalMs) return
        lastStartedAt = Date.now()
        inFlight = runSync().finally(() => {
          inFlight = null
        })
      },
    },
    { pollIntervalMs: pollIntervalMs() }
  )

  onShutdown("watchlist-fallback", "drain", () => poller.stop())
  await poller.start()
  logger.info(`Watchlist sync fallback polling started (checking every ${pollIntervalMs() / 1000} seconds)`)
  return poller
}
