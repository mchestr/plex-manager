/**
 * Node.js runtime instrumentation: the background start of the server process.
 *
 * `instrumentation.ts` calls {@link startNodeInstrumentation} without awaiting
 * it, because Next awaits `register()` before serving the first request. It
 * installs the shutdown coordinator first, then starts the queue worker, the
 * Discord bot poller and the setup code (P11.32) side by side, so neither a
 * down Redis nor a slow Discord login holds up the others or the site (BP-13).
 *
 * `PROCESS_ROLE` (P11.3) picks what starts: a `web` container issues only the
 * setup code, because web containers serve the wizard; `worker` and `all`
 * (the default) also start the queue Workers, their schedulers (watchlist,
 * role reconcile, retention and the Rewind runs), the Discord bot poller and,
 * without Redis, the database-lease fallbacks.
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

  const role = processRole()
  logger.info("Process role", { role })
  const background =
    role === "web"
      ? []
      : [
          startQueueWorker().catch((error) => logger.error("Queue worker start failed", error)),
          startDiscordBotPolling().catch((error) => logger.error("Discord bot start failed", error)),
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
 * database-lease watchlist and retention fallbacks run instead; with it,
 * never, so two sync or sweep paths never run at once.
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
    await Promise.all([
      startWatchlistFallback({ signal: shutdownSignal }),
      startRetentionFallback({ signal: shutdownSignal }).catch((error) =>
        logger.error("Retention fallback start failed", error)
      ),
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
  await scheduleRoleReconcile().catch((error) => logger.error("Could not schedule the Discord role reconcile", error))

  const { ensureRetentionSchedule } = await import("@/lib/retention/schedule")
  await ensureRetentionSchedule().catch((error) => logger.error("Could not schedule the retention sweep", error))

  // The settings save calls this too, so a change applies without a restart.
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

async function startDiscordBotPolling() {
  // Check if bot should attempt to start (can be disabled via env var for manual control)
  const envBotEnabled = process.env.ENABLE_DISCORD_BOT !== "false"

  if (!envBotEnabled) {
    logger.debug("Discord bot disabled via ENABLE_DISCORD_BOT=false")
    return
  }

  // Check database setting - if bot is disabled there, don't start polling
  try {
    const { isDiscordBotEnabled } = await import("@/lib/discord/config")
    const botEnabled = await isDiscordBotEnabled()
    if (!botEnabled) {
      logger.debug("Discord bot disabled in database settings")
      return
    }
  } catch (error) {
    // If we can't check the database, proceed anyway (database might not be ready yet)
    // The polling loop will check the setting periodically
    logger.warn("Could not check Discord bot enabled status", { error })
  }

  // Use dynamic import with a string to prevent Next.js from analyzing the dependency tree
  // This ensures Discord.js and its native dependencies aren't bundled.
  //
  // This is the ONE legitimate place that owns the DiscordBot and its
  // LeasePoller for the process lifecycle.
  try {
    const { LeaseLock } = await import("@/lib/locks/lease-lock")
    const { LeasePoller, DEFAULT_POLL_INTERVAL_MS } = await import("@/lib/locks/lease-poller")
    const { isDiscordBotEnabled } = await import("@/lib/discord/config")
    const { DiscordBot } = await import("@/lib/discord/bot")
    const { prisma } = await import("@/lib/prisma")

    // Construct the process-lifecycle instances here (injecting a real Client via
    // the bot's default factory).
    const bot = new DiscordBot()
    const lock = new LeaseLock({ name: "discord-bot" })

    // Poll interval in milliseconds (default: 10 seconds). It only paces
    // acquisition, the enabled check and the config bounce: the poller renews
    // the 30 s lease on its own timer every 10 s, whatever this is set to.
    const pollIntervalMs = parseInt(
      process.env.DISCORD_BOT_POLL_INTERVAL_MS || String(DEFAULT_POLL_INTERVAL_MS),
      10
    )

    // The poller drives acquire/renew off a single lock (single source of truth)
    // and calls these lifecycle hooks. onLockAcquired -> initialize the bot;
    // onLockLost -> destroy it.
    //
    // Step 18 (FR-13): getConfigVersion feeds the poller's config-change bounce.
    // When DiscordIntegration.configVersion changes while the holder is running,
    // the poller runs onLockLost (destroy) then onLockAcquired (re-initialize),
    // so bot.initialize() re-reads the fresh token via lib/discord/config.ts —
    // no redeploy required.
    const poller = new LeasePoller(
      lock,
      {
        onLockAcquired: async () => {
          try {
            await bot.initialize()
            logger.info("Discord bot initialized successfully (holding distributed lock)")
          } catch (error) {
            logger.error("Failed to initialize Discord bot", error)
            // Release lock if initialization fails so another instance can take over.
            await lock.release()
          }
        },
        onLockLost: async () => {
          try {
            logger.info("Discord bot lock lost - shutting down bot")
            await bot.destroy()
          } catch (error) {
            logger.error("Error shutting down bot after lock loss", error)
          }
        },
        isEnabled: isDiscordBotEnabled,
      },
      {
        pollIntervalMs,
        getConfigVersion: async () => {
          const row = await prisma.discordIntegration.findUnique({
            where: { id: "discord" },
            select: { configVersion: true },
          })
          return row?.configVersion ?? 0
        },
      }
    )

    // stop() fires onLockLost (which destroys the bot) and releases the
    // discord-bot lease, so another instance can take over at once.
    onShutdown("discord-bot", "drain", () => poller.stop())

    // Runs the first acquisition attempt, then polls in the background. The
    // bot initializes automatically when the lock is acquired.
    await poller.start()

    logger.info(`Discord bot lock polling started (checking every ${pollIntervalMs / 1000} seconds)`)
  } catch (error) {
    // Silently fail if Discord.js can't be loaded (e.g., missing native dependencies)
    // This allows the app to start even if the bot can't be initialized
    logger.warn("Discord bot module could not be loaded", { error })
  }
}
