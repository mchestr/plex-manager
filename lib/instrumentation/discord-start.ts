/**
 * Starts the Discord bot's lease poller (GAP-12): the one place that owns the
 * `DiscordBot` and its `LeasePoller` for the life of the process.
 *
 * The poller is always built, unless `ENABLE_DISCORD_BOT=false` opts this
 * process out (a `web` process never gets here, P11.3). It checks
 * `isDiscordBotReady()` on every tick, so the bot starts within one poll of
 * "Bot enabled" being turned on with a token saved, and stops when it is
 * turned off, with no restart. A database that is down at boot only delays it.
 *
 * Everything is imported on call, so the Edge runtime never analyses
 * discord.js and its native dependencies.
 */

import { onShutdown } from "@/lib/instrumentation/shutdown"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("INSTRUMENTATION")

export async function startDiscordBotPolling(): Promise<void> {
  if (process.env.ENABLE_DISCORD_BOT === "false") {
    logger.info("discord.opted_out: ENABLE_DISCORD_BOT=false, this process never runs the bot")
    return
  }

  try {
    const { LeaseLock } = await import("@/lib/locks/lease-lock")
    const { LeasePoller, DEFAULT_POLL_INTERVAL_MS } = await import("@/lib/locks/lease-poller")
    const { isDiscordBotReady } = await import("@/lib/discord/config")
    const { DiscordBot } = await import("@/lib/discord/bot")
    const { prisma } = await import("@/lib/prisma")

    const bot = new DiscordBot()
    const lock = new LeaseLock({ name: "discord-bot" })

    // Paces acquisition, the readiness check and the config bounce; the poller
    // renews the 30 s lease on its own timer whatever this is set to.
    const pollIntervalMs = parseInt(
      process.env.DISCORD_BOT_POLL_INTERVAL_MS || String(DEFAULT_POLL_INTERVAL_MS),
      10
    )

    // A saved setting bumps DiscordIntegration.configVersion: a running bot
    // bounces (destroy, then initialize with the fresh token), and a stopped
    // one picks the change up through isDiscordBotReady on the next tick.
    const poller = new LeasePoller(
      lock,
      {
        onLockAcquired: async () => {
          try {
            await bot.initialize()
            logger.info("Discord bot initialized successfully (holding distributed lock)")
          } catch (error) {
            logger.error("Failed to initialize Discord bot", error)
            // Release the lease so another instance can take over.
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
        isEnabled: isDiscordBotReady,
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

    // stop() destroys the bot and releases the lease, so another instance can
    // take over at once.
    onShutdown("discord-bot", "drain", () => poller.stop())

    // The first attempt runs now; then the poll runs in the background.
    await poller.start()

    logger.info(`Discord bot lock polling started (checking every ${pollIntervalMs / 1000} seconds)`)
  } catch (error) {
    // discord.js could not load (e.g. a missing native dependency): the app
    // still starts, without the bot.
    logger.warn("Discord bot module could not be loaded", { error })
  }
}
