/**
 * Node.js runtime instrumentation: the background start of the server process.
 *
 * `instrumentation.ts` calls {@link startNodeInstrumentation} without awaiting
 * it, because Next awaits `register()` before serving the first request. It
 * installs the shutdown coordinator first, then starts the queue worker and the
 * Discord bot poller side by side, so neither a down Redis nor a slow Discord
 * login holds up the other or the site (BP-13).
 *
 * Imported dynamically from instrumentation.ts so the Edge runtime never
 * analyses its Node-only dependencies.
 */

import { installShutdownHandlers, onShutdown, shutdownSignal } from "@/lib/instrumentation/shutdown"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("INSTRUMENTATION")

const SCHEDULER_TIMEOUT_MS = 5000

export async function startNodeInstrumentation() {
  installShutdownHandlers()
  onShutdown("prisma", "close", async () => {
    const { prisma } = await import("@/lib/prisma")
    await prisma.$disconnect()
  })

  await Promise.all([
    startQueueWorker().catch((error) => logger.error("Queue worker start failed", error)),
    startDiscordBotPolling().catch((error) => logger.error("Discord bot start failed", error)),
  ])
}

/** Rejects when `promise` has not settled within `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/**
 * Starts the BullMQ worker once Redis answers. Without `REDIS_URL` the legacy
 * polling watchlist sync runs instead; with it, never, so two sync paths never
 * run at once.
 */
async function startQueueWorker() {
  if (process.env.ENABLE_QUEUE_WORKER === "false") {
    logger.debug("Queue worker disabled via ENABLE_QUEUE_WORKER=false")
    return
  }

  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    logger.debug("Queue worker disabled: REDIS_URL not configured")
    await startWatchlistSyncPolling()
    return
  }

  const { startWorker, stopWorker } = await import("@/lib/queue/worker")
  const { scheduleRepeatingJob, removeScheduledJob, closeQueue } = await import("@/lib/queue/client")
  const { closeRedisConnection, createFailFastRedis, waitForRedis } = await import("@/lib/queue/connection")
  const { JOB_TYPES } = await import("@/lib/queue/types")
  const { isWatchlistSyncEnabled, getWatchlistSyncInterval } = await import("@/lib/watchlist/lock")

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

  if (await isWatchlistSyncEnabled()) {
    const intervalMinutes = await getWatchlistSyncInterval()
    await withTimeout(
      scheduleRepeatingJob(
        "watchlist-sync-scheduled",
        JOB_TYPES.WATCHLIST_SYNC_ALL,
        { triggeredBy: "scheduled" },
        intervalMinutes * 60 * 1000
      ),
      SCHEDULER_TIMEOUT_MS,
      "Scheduling the watchlist sync"
    )
    logger.info(`Watchlist sync scheduled every ${intervalMinutes} minutes`)
  } else {
    await withTimeout(
      removeScheduledJob("watchlist-sync-scheduled"),
      SCHEDULER_TIMEOUT_MS,
      "Removing the watchlist sync schedule"
    )
    logger.info("Watchlist sync disabled - scheduler removed")
  }
}

/**
 * Schedules the daily Discord role reconcile (P4.18) at 04:00 in the server
 * zone. It runs on the queue worker, whose drain the shutdown coordinator
 * already owns, and stops its pacing at `shutdownSignal`. Upserting the same
 * scheduler id keeps one schedule however many processes start.
 */
async function scheduleRoleReconcile() {
  if (shutdownSignal.aborted) return
  const { scheduleCronJob } = await import("@/lib/queue/client")
  const { JOB_TYPES } = await import("@/lib/queue/types")
  const { ROLE_RECONCILE_PATTERN, ROLE_RECONCILE_SCHEDULER_ID, reconcileTimeZone } = await import(
    "@/lib/queue/jobs/discord-role"
  )
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

/**
 * Legacy: Polling-based watchlist sync
 * Only used when Redis is not configured
 */
async function startWatchlistSyncPolling() {
  // Check if watchlist sync should attempt to start
  const envSyncEnabled = process.env.ENABLE_WATCHLIST_SYNC !== "false"

  if (!envSyncEnabled) {
    logger.debug("Watchlist sync disabled via ENABLE_WATCHLIST_SYNC=false")
    return
  }

  try {
    const { isWatchlistSyncEnabled, startWatchlistSyncPolling: startPolling, stopWatchlistSyncPolling } = await import("@/lib/watchlist/lock")
    const { syncAllEnabledUsers } = await import("@/lib/watchlist/sync-service")

    // Check database setting
    const syncEnabled = await isWatchlistSyncEnabled()
    if (!syncEnabled) {
      logger.debug("Watchlist sync disabled in database settings")
      return
    }

    // Poll interval in milliseconds (default: 60 seconds)
    const pollIntervalMs = parseInt(process.env.WATCHLIST_SYNC_POLL_INTERVAL_MS || "60000", 10)

    onShutdown("watchlist-sync-polling", "drain", stopWatchlistSyncPolling)

    // Start background polling
    startPolling(
      // onLockAcquired - called when we successfully acquire the lock
      async () => {
        try {
          logger.info("Watchlist sync lock acquired - running sync")
          const result = await syncAllEnabledUsers()
          logger.info(`Watchlist sync completed: ${result.usersProcessed} users processed, ${result.usersSucceeded} succeeded, ${result.usersFailed} failed`)
        } catch (error) {
          logger.error("Failed to run watchlist sync", error)
        }
      },
      // onLockLost - called if we lose the lock
      async () => {
        logger.info("Watchlist sync lock lost")
      },
      pollIntervalMs
    )

    logger.info(`Watchlist sync polling started (checking every ${pollIntervalMs / 1000} seconds)`)
  } catch (error) {
    logger.warn("Watchlist sync module could not be loaded", { error })
  }
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
    const { isDiscordBotEnabled } = await import("@/lib/discord/lock")
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
  // This is the ONE legitimate place that owns the DiscordBot and BotLockPoller
  // instances for the process lifecycle. The bot and lock singletons were removed
  // in favor of constructing (and wiring) them here.
  try {
    const { DistributedLock } = await import("@/lib/discord/lock/lease")
    const { BotLockPoller, DEFAULT_POLL_INTERVAL_MS } = await import("@/lib/discord/lock/poller")
    const { isDiscordBotEnabled } = await import("@/lib/discord/lock")
    const { DiscordBot } = await import("@/lib/discord/bot")
    const { prisma } = await import("@/lib/prisma")

    // Construct the process-lifecycle instances here (injecting a real Client via
    // the bot's default factory).
    const bot = new DiscordBot()
    const lock = new DistributedLock()

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
    const poller = new BotLockPoller(
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
    // DiscordBotLock row, so another instance can take over at once.
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
