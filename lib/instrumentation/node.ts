/**
 * Node.js runtime instrumentation - starts background jobs
 * This file should only be imported dynamically from instrumentation.ts
 * to prevent Edge Runtime from analyzing Node.js-only dependencies
 */

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
    if (process.env.NODE_ENV === "development") {
      console.log("Queue worker disabled via ENABLE_QUEUE_WORKER=false")
    }
    return
  }

  // Check if Redis is configured
  if (!process.env.REDIS_URL) {
    if (process.env.NODE_ENV === "development") {
      console.log("Queue worker disabled: REDIS_URL not configured")
    }
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
      console.log("Queue worker disabled: Redis not configured")
      return
    }

    // Start the worker
    await startWorker()
    console.log("Queue worker started")

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
      console.log(`Watchlist sync scheduled every ${intervalMinutes} minutes`)
    } else {
      // Remove any existing scheduled job if sync is disabled
      await removeScheduledJob("watchlist-sync-scheduled")
      console.log("Watchlist sync disabled - scheduler removed")
    }

    // Graceful shutdown handlers
    if (process.env.NODE_ENV !== "test") {
      const shutdown = async () => {
        try {
          console.log("Shutting down queue worker...")
          await stopWorker()
          await closeQueue()
          await closeRedisConnection()
          console.log("Queue worker shutdown complete")
        } catch (error) {
          console.error("Error during queue worker shutdown:", error)
        }
      }

      process.on("SIGINT", shutdown)
      process.on("SIGTERM", shutdown)
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("Queue worker could not be started:", error)
    }
    // Fall back to legacy polling system
    console.log("Falling back to legacy polling system")
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
    if (process.env.NODE_ENV === "development") {
      console.log("Watchlist sync disabled via ENABLE_WATCHLIST_SYNC=false")
    }
    return
  }

  try {
    const { isWatchlistSyncEnabled, startWatchlistSyncPolling: startPolling, stopWatchlistSyncPolling } = await import("@/lib/watchlist/lock")
    const { syncAllEnabledUsers } = await import("@/lib/watchlist/sync-service")

    // Check database setting
    const syncEnabled = await isWatchlistSyncEnabled()
    if (!syncEnabled) {
      if (process.env.NODE_ENV === "development") {
        console.log("Watchlist sync disabled in database settings")
      }
      return
    }

    // Poll interval in milliseconds (default: 60 seconds)
    const pollIntervalMs = parseInt(process.env.WATCHLIST_SYNC_POLL_INTERVAL_MS || "60000", 10)

    // Start background polling
    startPolling(
      // onLockAcquired - called when we successfully acquire the lock
      async () => {
        try {
          console.log("Watchlist sync lock acquired - running sync")
          const result = await syncAllEnabledUsers()
          console.log(`Watchlist sync completed: ${result.usersProcessed} users processed, ${result.usersSucceeded} succeeded, ${result.usersFailed} failed`)
        } catch (error) {
          console.error("Failed to run watchlist sync:", error)
        }
      },
      // onLockLost - called if we lose the lock
      async () => {
        console.log("Watchlist sync lock lost")
      },
      pollIntervalMs
    )

    console.log(`Watchlist sync polling started (checking every ${pollIntervalMs / 1000} seconds)`)

    // Graceful shutdown handlers
    if (process.env.NODE_ENV !== "test") {
      const shutdown = async () => {
        try {
          await stopWatchlistSyncPolling()
        } catch (error) {
          console.error("Error during watchlist sync shutdown:", error)
        }
      }

      process.on("SIGINT", shutdown)
      process.on("SIGTERM", shutdown)
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("Watchlist sync module could not be loaded:", error)
    }
  }
}

async function startDiscordBotPolling() {
  // Check if bot should attempt to start (can be disabled via env var for manual control)
  const envBotEnabled = process.env.ENABLE_DISCORD_BOT !== "false"

  if (!envBotEnabled) {
    if (process.env.NODE_ENV === "development") {
      console.log("Discord bot disabled via ENABLE_DISCORD_BOT=false")
    }
    return
  }

  // Check database setting - if bot is disabled there, don't start polling
  try {
    const { isDiscordBotEnabled } = await import("@/lib/discord/lock")
    const botEnabled = await isDiscordBotEnabled()
    if (!botEnabled) {
      if (process.env.NODE_ENV === "development") {
        console.log("Discord bot disabled in database settings")
      }
      return
    }
  } catch (error) {
    // If we can't check the database, proceed anyway (database might not be ready yet)
    // The polling loop will check the setting periodically
    if (process.env.NODE_ENV === "development") {
      console.warn("Could not check Discord bot enabled status:", error)
    }
  }

  // Use dynamic import with a string to prevent Next.js from analyzing the dependency tree
  // This ensures Discord.js and its native dependencies aren't bundled
  try {
    const { startDiscordBotLockPolling, stopDiscordBotLockPolling, releaseDiscordBotLock } = await import("@/lib/discord/lock")
    const botModule = await import("@/lib/discord/bot")
    const bot = botModule.getDiscordBot()

    // Poll interval in milliseconds (default: 60 seconds)
    const pollIntervalMs = parseInt(process.env.DISCORD_BOT_POLL_INTERVAL_MS || "60000", 10)

    // Store bot instance for cleanup
    let botInstance: ReturnType<typeof botModule.getDiscordBot> | null = null

    // Start background polling - this doesn't block server startup
    // The bot will initialize automatically when the lock is acquired
    startDiscordBotLockPolling(
      // onLockAcquired - called when we successfully acquire the lock
      async () => {
        try {
          await bot.initialize()
          botInstance = bot
          console.log("Discord bot initialized successfully (holding distributed lock)")
        } catch (error) {
          console.error("Failed to initialize Discord bot:", error)
          // Release lock if initialization fails
          await releaseDiscordBotLock()
        }
      },
      // onLockLost - called if we lose the lock (e.g., another instance took it)
      async () => {
        try {
          console.log("Discord bot lock lost - shutting down bot")
          if (botInstance) {
            await botInstance.destroy()
            botInstance = null
          }
        } catch (error) {
          console.error("Error shutting down bot after lock loss:", error)
        }
      },
      pollIntervalMs
    )

    console.log(`Discord bot lock polling started (checking every ${pollIntervalMs / 1000} seconds)`)

    // Graceful shutdown handlers - only register if we're in Node.js runtime
    // Skip in test environments (Playwright) to avoid interference
    if (process.env.NODE_ENV !== "test") {
      const shutdown = async () => {
        try {
          await stopDiscordBotLockPolling()
          // Bot instance will be destroyed by stopDiscordBotLockPolling if it exists
          // But also try to destroy it here as a fallback
          try {
            await bot.destroy()
          } catch {
            // Ignore errors if bot wasn't initialized
          }
        } catch (error) {
          console.error("Error during Discord bot shutdown:", error)
        }
      }

      process.on("SIGINT", shutdown)
      process.on("SIGTERM", shutdown)
    }
  } catch (error) {
    // Silently fail if Discord.js can't be loaded (e.g., missing native dependencies)
    // This allows the app to start even if the bot can't be initialized
    if (process.env.NODE_ENV === "development") {
      console.warn("Discord bot module could not be loaded:", error)
    }
  }
}
