/**
 * Whether the Discord bot is switched on. The bot's lease lives in
 * `lib/discord/lock/` (`DistributedLock`, `BotLockPoller`).
 */

import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("DISCORD_BOT_LOCK")

/**
 * Checks if the Discord bot is enabled in the database.
 */
export async function isDiscordBotEnabled(): Promise<boolean> {
  try {
    const integration = await prisma.discordIntegration.findUnique({
      where: { id: "discord" },
      select: { botEnabled: true },
    })
    return integration?.botEnabled ?? false
  } catch (error) {
    logger.debug("Error checking if Discord bot is enabled", { error })
    return false
  }
}
