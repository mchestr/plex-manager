import "server-only"

import { findTautulliUser } from "@/lib/connections/tautulli"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("TAUTULLI_FIRST_WATCH")

/**
 * The member's first watch date from Tautulli: the timestamp of their earliest
 * history entry, which the home page shows as "member since".
 *
 * Deliberately not a Server Action. The home page passes the `plexUserId` of
 * the signed-in member's own row, so no client can ask about another member's
 * Tautulli account or trigger Tautulli requests directly (SEC-19).
 */
export async function getFirstWatchDate(
  plexUserId: string
): Promise<{ success: boolean; firstWatchDate?: string; error?: string }> {
  try {
    const tautulli = await prisma.tautulli.findFirst({
      where: { isActive: true },
    })

    if (!tautulli) {
      logger.debug("No active Tautulli configured, cannot get first watch date")
      return { success: false, error: "Tautulli not configured" }
    }

    const lookup = await findTautulliUser({ url: tautulli.url, apiKey: tautulli.apiKey }, { plexUserId })

    if (!lookup.ok) {
      return {
        success: false,
        error: lookup.code === "TAUTULLI_USER_NOT_FOUND"
          ? "User not found in Tautulli"
          : "Failed to fetch users from Tautulli",
      }
    }

    // The oldest history entry: history ordered by date ascending, one row.
    const historyResponse = await fetch(
      `${tautulli.url}/api/v2?apikey=${tautulli.apiKey}&cmd=get_history&user_id=${lookup.user.user_id}&order_dir=asc&length=1`,
      { headers: { "Accept": "application/json" } }
    )

    if (!historyResponse.ok) {
      return { success: false, error: "Failed to fetch user history from Tautulli" }
    }

    const historyData = await historyResponse.json()
    const historyItems = historyData.response?.data?.data || []

    if (historyItems.length === 0) {
      logger.debug("No watch history found for user", { plexUserId })
      return { success: false, error: "No watch history found" }
    }

    const firstItem = historyItems[0]
    const timestamp = firstItem.date || firstItem.started

    if (!timestamp) {
      return { success: false, error: "No timestamp found in history" }
    }

    // Tautulli timestamps are Unix seconds.
    const firstWatchDate = new Date(timestamp * 1000).toISOString()

    logger.debug("Found first watch date", { plexUserId, firstWatchDate })
    return { success: true, firstWatchDate }
  } catch (error) {
    logger.error("Error getting user first watch date", error, { plexUserId })
    return { success: false, error: "Failed to get first watch date" }
  }
}
