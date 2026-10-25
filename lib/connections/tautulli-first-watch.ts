import "server-only"

import { z } from "zod"

import { findTautulliUser, tautulliCommand } from "@/lib/connections/tautulli"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("TAUTULLI_FIRST_WATCH")

const oldestRowSchema = z.looseObject({ date: z.number().nullish(), started: z.number().nullish() })
const historyPageSchema = z.union([
  z.array(oldestRowSchema),
  z.looseObject({ data: z.array(oldestRowSchema) }).transform((page) => page.data),
])

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
    orderBy: { updatedAt: "desc" },
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
    const history = await tautulliCommand(
      tautulli,
      "get_history",
      { user_id: lookup.user.user_id, order_dir: "asc", length: 1 },
      historyPageSchema
    )

    if (!history.ok) {
      return { success: false, error: "Failed to fetch user history from Tautulli" }
    }

    const firstItem = history.data[0]
    if (!firstItem) {
      logger.debug("No watch history found for user", { plexUserId })
      return { success: false, error: "No watch history found" }
    }

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
