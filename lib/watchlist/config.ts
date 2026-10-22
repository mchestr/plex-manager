/**
 * The global watchlist sync settings on `Config`, read fresh on every call so
 * the fallback poller and the BullMQ schedule follow a settings save at once.
 */

import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("WATCHLIST_SYNC_CONFIG")

/**
 * Checks if watchlist sync is enabled globally in the database
 */
export async function isWatchlistSyncEnabled(): Promise<boolean> {
  try {
    const config = await prisma.config.findUnique({
      where: { id: "config" },
      select: { watchlistSyncEnabled: true },
    })
    return config?.watchlistSyncEnabled ?? false
  } catch (error) {
    logger.debug("Error checking if watchlist sync is enabled", { error })
    return false
  }
}

/**
 * Gets the global sync interval in minutes
 */
export async function getWatchlistSyncInterval(): Promise<number> {
  try {
    const config = await prisma.config.findUnique({
      where: { id: "config" },
      select: { watchlistSyncIntervalMinutes: true },
    })
    return config?.watchlistSyncIntervalMinutes ?? 60
  } catch (error) {
    logger.debug("Error getting watchlist sync interval", { error })
    return 60
  }
}
