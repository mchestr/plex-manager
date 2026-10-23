/**
 * The retention sweep without Redis (P11.14).
 *
 * Without `REDIS_URL` there is no BullMQ schedule, so one process runs the
 * sweep under the `retention` database lease. On every poll while it holds the
 * lease, it starts a sweep when none is in flight, the last recorded run
 * (`Config.lastRetentionRunAt`) is 24 hours old or missing, and it has not
 * tried within the last hour (so a failing sweep is not retried every poll).
 *
 * @module
 */

import { onShutdown } from "@/lib/instrumentation/shutdown"
import { LeaseLock } from "@/lib/locks/lease-lock"
import { LeasePoller } from "@/lib/locks/lease-poller"
import { prisma } from "@/lib/prisma"
import { runRetentionSweep } from "@/lib/queue/jobs/retention"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("RETENTION_FALLBACK")

/** How often the fallback polls the lease and the last run. @internal */
export const RETENTION_POLL_INTERVAL_MS = 5 * 60 * 1000
/** A recorded run younger than this is fresh. @internal */
export const RETENTION_RUN_EVERY_MS = 24 * 60 * 60 * 1000
const RETRY_AFTER_MS = 60 * 60 * 1000

/**
 * Starts the lease-held retention poller unless shutdown has begun. Only for
 * processes without `REDIS_URL`.
 *
 * @returns the poller, or null when none was built
 */
export async function startRetentionFallback({ signal }: { signal: AbortSignal }): Promise<LeasePoller | null> {
  if (signal.aborted) return null

  let inFlight: Promise<void> | null = null
  let lastAttemptAt: number | null = null

  const runSweep = async () => {
    try {
      await runRetentionSweep({ signal })
    } catch (error) {
      logger.error("Retention sweep failed", { error })
    }
  }

  const poller = new LeasePoller(
    new LeaseLock({ name: "retention" }),
    {
      isEnabled: async () => true,
      onLockAcquired: async () => logger.info("Retention lease acquired"),
      onLockLost: async () => logger.info("Retention lease released"),
      onHeldTick: async () => {
        if (inFlight || signal.aborted) return
        const now = Date.now()
        if (lastAttemptAt !== null && now - lastAttemptAt < RETRY_AFTER_MS) return
        const config = await prisma.config.findUnique({ where: { id: "config" }, select: { lastRetentionRunAt: true } })
        const last = config?.lastRetentionRunAt?.getTime()
        if (last !== undefined && now - last < RETENTION_RUN_EVERY_MS) return
        lastAttemptAt = now
        inFlight = runSweep().finally(() => {
          inFlight = null
        })
      },
    },
    { pollIntervalMs: RETENTION_POLL_INTERVAL_MS }
  )

  onShutdown("retention-fallback", "drain", () => poller.stop())
  await poller.start()
  logger.info("Retention fallback polling started")
  return poller
}
