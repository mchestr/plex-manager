/**
 * Node.js runtime instrumentation: the background start of the server process.
 *
 * `instrumentation.ts` calls {@link startNodeInstrumentation} without awaiting
 * it, because Next awaits `register()` before serving the first request. It
 * installs the shutdown coordinator first and checks the encryption key
 * (P11.1, at most 5 s), then starts the queue worker, the
 * Discord bot poller and the setup code (P11.32) side by side, so neither a
 * down Redis nor a slow Discord login holds up the others or the site (BP-13).
 *
 * `PROCESS_ROLE` (P11.3) picks what starts: a `web` container issues only the
 * setup code, because web containers serve the wizard; `worker` and `all`
 * (the default) also start the queue Workers, their schedulers (watchlist,
 * role reconcile, retention, the member activity run and the Rewind runs),
 * the Discord bot poller and, without Redis, the database-lease fallbacks and
 * the secret re-encryption.
 *
 * Imported dynamically from instrumentation.ts so the Edge runtime never
 * analyses its Node-only dependencies.
 */

import { processRole } from "@/lib/db/pool-config"
import { installShutdownHandlers, onShutdown, shutdownSignal } from "@/lib/instrumentation/shutdown"
import { createLogger } from "@/lib/utils/logger"
import { withTimeout } from "@/lib/utils/with-timeout"

const logger = createLogger("INSTRUMENTATION")

const SCHEDULER_TIMEOUT_MS = 5000

export async function startNodeInstrumentation() {
  installShutdownHandlers()
  onShutdown("prisma", "close", async () => {
    const { prisma } = await import("@/lib/prisma")
    await prisma.$disconnect()
  })

  // Every role checks the key first, before anything below can read a stored
  // secret: a worker decrypts service keys and tokens in its jobs and the bot,
  // and a web container serves settings, sign-in and the setup wizard. It exits
  // on a mismatched key; a slow database is retried in the background (P11.1).
  const { assertEncryptionKey } = await import("@/lib/instrumentation/encryption-canary")
  await assertEncryptionKey({ signal: shutdownSignal })

  const role = processRole()
  logger.info("Process role", { role })
  const background =
    role === "web"
      ? []
      : [
          startQueueWorker().catch((error) => logger.error("Queue worker start failed", error)),
          startDiscordBot().catch((error) => logger.error("Discord bot start failed", error)),
        ]

  await Promise.all([
    ...background,
    issueSetupCode().catch((error) => logger.error("Could not issue the setup code", error)),
  ])
}

/** Prints this boot's setup code while first-run setup is incomplete (P11.32). */
async function issueSetupCode() {
  const { issueSetupCode: issue } = await import("@/lib/setup/claim")
  await issue()
}

/**
 * Starts the BullMQ worker once Redis answers. Without `REDIS_URL` the
 * database-lease watchlist and retention fallbacks run instead, and the
 * secret re-encryption runs in this process when it is due; with it, never,
 * so two sync or sweep paths never run at once.
 */
async function startQueueWorker() {
  if (process.env.ENABLE_QUEUE_WORKER === "false") {
    logger.debug("Queue worker disabled via ENABLE_QUEUE_WORKER=false")
    return
  }

  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    logger.debug("Queue worker disabled: REDIS_URL not configured")
    const { startWatchlistFallback } = await import("@/lib/watchlist/fallback")
    const { startRetentionFallback } = await import("@/lib/retention/fallback")
    const { reencryptSecretsWithoutQueue } = await import("@/lib/queue/jobs/secrets")
    await Promise.all([
      startWatchlistFallback({ signal: shutdownSignal }),
      startRetentionFallback({ signal: shutdownSignal }).catch((error) =>
        logger.error("Retention fallback start failed", error)
      ),
      reencryptSecretsWithoutQueue().catch((error) => logger.error("Secret re-encryption failed", error)),
    ])
    return
  }

  const { startWorker, stopWorker } = await import("@/lib/queue/worker")
  const { closeQueue } = await import("@/lib/queue/client")
  const { closeRedisConnection, createFailFastRedis, waitForRedis } = await import("@/lib/queue/connection")
  const { ensureWatchlistSchedule } = await import("@/lib/watchlist/schedule")

  // Each is a no-op when nothing was started.
  onShutdown("queue-worker", "drain", stopWorker)
  onShutdown("queue", "close", closeQueue)
  onShutdown("redis", "close", closeRedisConnection)

  const probe = createFailFastRedis(redisUrl)
  const reachable = await waitForRedis(probe, {
    attempts: 8,
    baseDelayMs: 1000,
    maxDelayMs: 30_000,
    signal: shutdownSignal,
  }).finally(() => probe.disconnect())

  if (shutdownSignal.aborted) return
  if (!reachable) {
    // The site keeps serving; /api/health reports Redis down, and a restart retries.
    logger.error("queue.redis_unreachable: the queue worker is not running")
    return
  }

  await startWorker()
  const { enqueueSecretsReencrypt } = await import("@/lib/queue/jobs/secrets")
  await enqueueSecretsReencrypt().catch((error) => logger.error("Could not queue the secret re-encryption", error))
  await scheduleRoleReconcile().catch((error) => logger.error("Could not schedule the Discord role reconcile", error))

  const { ensureRetentionSchedule } = await import("@/lib/retention/schedule")
  await ensureRetentionSchedule().catch((error) => logger.error("Could not schedule the retention sweep", error))

  const { ensureChannelStatsSchedule } = await import("@/lib/discord/channel-stats/schedule")
  const { ensureRequestTierSchedule } = await import("@/lib/request-tiers/schedule")
  const { ensureMemberActivitySchedule } = await import("@/lib/inactivity/schedule")
  // The settings saves call the first two too, so a change applies without a
  // restart; the member activity run is always scheduled. None of them throws.
  await Promise.all([ensureChannelStatsSchedule(), ensureRequestTierSchedule(), ensureMemberActivitySchedule()])
  await ensureWatchlistSchedule()
}

/**
 * Schedules the daily Discord role reconcile (P4.18) at 04:00 in the server
 * zone while the Discord integration is on, and removes the schedule (with
 * its pending run) while it is off. It reads the setting at boot. It runs on
 * the queue worker, whose drain the shutdown coordinator already owns, and
 * stops its pacing at `shutdownSignal`. Upserting the same scheduler id keeps one schedule
 * however many processes start.
 */
async function scheduleRoleReconcile() {
  if (shutdownSignal.aborted) return
  const { scheduleCronJob, removeScheduledJob } = await import("@/lib/queue/client")
  const { JOB_TYPES } = await import("@/lib/queue/types")
  const { getDiscordIntegration } = await import("@/lib/discord/integration")
  const { ROLE_RECONCILE_PATTERN, ROLE_RECONCILE_SCHEDULER_ID, reconcileTimeZone } = await import(
    "@/lib/queue/jobs/discord-role"
  )
  if (!(await getDiscordIntegration())) {
    await withTimeout(
      removeScheduledJob(ROLE_RECONCILE_SCHEDULER_ID),
      SCHEDULER_TIMEOUT_MS,
      "Removing the Discord role reconcile schedule"
    )
    logger.info("Discord integration off - role reconcile not scheduled")
    return
  }
  const tz = await reconcileTimeZone()
  await withTimeout(
    scheduleCronJob(
      ROLE_RECONCILE_SCHEDULER_ID,
      JOB_TYPES.DISCORD_ROLE_RECONCILE,
      {},
      { pattern: ROLE_RECONCILE_PATTERN, tz },
      { attempts: 1 }
    ),
    SCHEDULER_TIMEOUT_MS,
    "Scheduling the Discord role reconcile"
  )
  logger.info("Discord role reconcile scheduled daily at 04:00", { tz })
}

/** The Discord bot's lease poller (`lib/instrumentation/discord-start.ts`, P11.7). */
async function startDiscordBot() {
  const { startDiscordBotPolling } = await import("@/lib/instrumentation/discord-start")
  await startDiscordBotPolling()
}
