/**
 * Node.js runtime instrumentation - starts background jobs
 * This file should only be imported dynamically from instrumentation.ts
 * to prevent Edge Runtime from analyzing Node.js-only dependencies
 */

export async function startNodeInstrumentation() {
  // Start watchlist sync polling
  await startWatchlistSyncPolling()

  // Start Discord bot polling
  await startDiscordBotPolling()
}

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
