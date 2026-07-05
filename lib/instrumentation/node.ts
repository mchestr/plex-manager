/**
 * Node.js runtime instrumentation - starts background jobs
 * This file should only be imported dynamically from instrumentation.ts
 * to prevent Edge Runtime from analyzing Node.js-only dependencies
 */

import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("INSTRUMENTATION")

export async function startNodeInstrumentation() {
  // Start queue worker (for watchlist sync and other background jobs)
  await startQueueWorker()

  // Start Discord bot polling
  await startDiscordBotPolling()
}

/**
 * Starts the BullMQ queue worker for processing background jobs
 * This replaces the previous polling-based watchlist sync system
 */
async function startQueueWorker() {
  // Check if queue worker should be enabled
  const envQueueEnabled = process.env.ENABLE_QUEUE_WORKER !== "false"

  if (!envQueueEnabled) {
    logger.debug("Queue worker disabled via ENABLE_QUEUE_WORKER=false")
    return
  }

  // Check if Redis is configured
  if (!process.env.REDIS_URL) {
    logger.debug("Queue worker disabled: REDIS_URL not configured")
    // Fall back to legacy polling system if Redis is not configured
    await startWatchlistSyncPolling()
    return
  }

  try {
    const { startWorker, stopWorker } = await import("@/lib/queue/worker")
    const { scheduleRepeatingJob, removeScheduledJob, closeQueue } = await import("@/lib/queue/client")
    const { closeRedisConnection, isRedisConfigured } = await import("@/lib/queue/connection")
    const { JOB_TYPES } = await import("@/lib/queue/types")
    const { isWatchlistSyncEnabled, getWatchlistSyncInterval } = await import("@/lib/watchlist/lock")

    if (!isRedisConfigured()) {
      logger.info("Queue worker disabled: Redis not configured")
      return
    }

    // Start the worker
    await startWorker()
    logger.info("Queue worker started")

    // Schedule watchlist sync if enabled
    const syncEnabled = await isWatchlistSyncEnabled()
    if (syncEnabled) {
      const intervalMinutes = await getWatchlistSyncInterval()
      const intervalMs = intervalMinutes * 60 * 1000

      await scheduleRepeatingJob(
        "watchlist-sync-scheduled",
        JOB_TYPES.WATCHLIST_SYNC_ALL,
        { triggeredBy: "scheduled" },
        intervalMs
      )
      logger.info(`Watchlist sync scheduled every ${intervalMinutes} minutes`)
    } else {
      // Remove any existing scheduled job if sync is disabled
      await removeScheduledJob("watchlist-sync-scheduled")
      logger.info("Watchlist sync disabled - scheduler removed")
    }

    // Graceful shutdown handlers
    if (process.env.NODE_ENV !== "test") {
      const shutdown = async () => {
        try {
          logger.info("Shutting down queue worker...")
          await stopWorker()
          await closeQueue()
          await closeRedisConnection()
          logger.info("Queue worker shutdown complete")
        } catch (error) {
          logger.error("Error during queue worker shutdown", error)
        }
      }

      process.on("SIGINT", shutdown)
      process.on("SIGTERM", shutdown)
    }
  } catch (error) {
    logger.warn("Queue worker could not be started", { error })
    // Fall back to legacy polling system
    logger.info("Falling back to legacy polling system")
    await startWatchlistSyncPolling()
  }
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

    // Graceful shutdown handlers
    if (process.env.NODE_ENV !== "test") {
      const shutdown = async () => {
        try {
          await stopWatchlistSyncPolling()
        } catch (error) {
          logger.error("Error during watchlist sync shutdown", error)
        }
      }

      process.on("SIGINT", shutdown)
      process.on("SIGTERM", shutdown)
    }
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
    const { BotLockPoller } = await import("@/lib/discord/lock/poller")
    const { isDiscordBotEnabled } = await import("@/lib/discord/lock")
    const { DiscordBot } = await import("@/lib/discord/bot")
    const { prisma } = await import("@/lib/prisma")

    // Construct the process-lifecycle instances here (injecting a real Client via
    // the bot's default factory).
    const bot = new DiscordBot()
    const lock = new DistributedLock()

    // Poll interval in milliseconds (default: 60 seconds)
    const pollIntervalMs = parseInt(process.env.DISCORD_BOT_POLL_INTERVAL_MS || "60000", 10)

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

    // Start background polling - this doesn't block server startup.
    // The bot initializes automatically when the lock is acquired.
    await poller.start()

    logger.info(`Discord bot lock polling started (checking every ${pollIntervalMs / 1000} seconds)`)

    // Graceful shutdown handlers - only register if we're in Node.js runtime.
    // Skip in test environments (Playwright) to avoid interference.
    if (process.env.NODE_ENV !== "test") {
      const shutdown = async () => {
        try {
          // stop() fires onLockLost (which destroys the bot) and releases the lock.
          await poller.stop()
          // Fallback destroy in case the bot was never running.
          try {
            await bot.destroy()
          } catch {
            // Ignore errors if bot wasn't initialized
          }
        } catch (error) {
          logger.error("Error during Discord bot shutdown", error)
        }
      }

      process.on("SIGINT", shutdown)
      process.on("SIGTERM", shutdown)
    }
  } catch (error) {
    // Silently fail if Discord.js can't be loaded (e.g., missing native dependencies)
    // This allows the app to start even if the bot can't be initialized
    logger.warn("Discord bot module could not be loaded", { error })
  }
}
