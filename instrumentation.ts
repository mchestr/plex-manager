export async function register() {
  // Only run on Node.js runtime (not Edge)
  // Also check if process.on is available (not available in Edge Runtime)
  if (
    typeof process === "undefined" ||
    typeof process.on !== "function" ||
    process.env.NEXT_RUNTIME !== "nodejs"
  ) {
    return
  }

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
    const { isDiscordBotEnabled } = await import("./lib/discord/lock")
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
    const { startDiscordBotLockPolling, stopDiscordBotLockPolling, releaseDiscordBotLock } = await import("./lib/discord/lock")
    const botModule = await import("./lib/discord/bot")
    const bot = botModule.getDiscordBot()

    // Poll interval in milliseconds (default: 60 seconds)
    const pollIntervalMs = parseInt(process.env.DISCORD_BOT_POLL_INTERVAL_MS || "60000", 10)

    // Store bot instance for cleanup
    let botInstance: any = null

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

      // Use dynamic property access to avoid Next.js static analysis issues with Edge Runtime
      // process.on is already verified to exist by the top-level check
      // Using a helper function to make it harder for Next.js to statically analyze
      const registerSignalHandler = (signal: string) => {
        const onMethod = (process as any)["on"]
        if (typeof onMethod === "function") {
          onMethod.call(process, signal, shutdown)
        }
      }
      registerSignalHandler("SIGINT")
      registerSignalHandler("SIGTERM")
    }
  } catch (error) {
    // Silently fail if Discord.js can't be loaded (e.g., missing native dependencies)
    // This allows the app to start even if the bot can't be initialized
    if (process.env.NODE_ENV === "development") {
      console.warn("Discord bot module could not be loaded:", error)
    }
  }
}

