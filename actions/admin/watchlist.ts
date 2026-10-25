"use server"

import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/prisma"
import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { configDiff } from "@/lib/security/config-diff"
import { globalWatchlistSyncSettingsSchema } from "@/lib/validations/watchlist"
import { ensureWatchlistSchedule } from "@/lib/watchlist/schedule"
import { getActiveService } from "@/lib/data/active-service"

/**
 * Update global watchlist sync settings (admin only)
 */
export const updateGlobalWatchlistSyncSettings = adminAction({
  input: globalWatchlistSyncSettingsSchema,
  fallbackError: "Failed to update settings",
  handler: async ({ watchlistSyncEnabled, watchlistSyncIntervalMinutes }, { userId }) => {
    // Watchlist sync files requests in Overseerr, so it needs an active server
    if (watchlistSyncEnabled) {
      const overseerr = await getActiveService("overseerr")
      if (!overseerr) {
        return fail("VALIDATION", "Cannot enable watchlist sync without an active Overseerr server")
      }
    }

    const before = await prisma.config.findUnique({
      where: { id: "config" },
      select: { watchlistSyncEnabled: true, watchlistSyncIntervalMinutes: true },
    })
    const values = { watchlistSyncEnabled, watchlistSyncIntervalMinutes }
    await prisma.config.upsert({
      where: { id: "config" },
      create: { id: "config", ...values, updatedBy: userId },
      update: { ...values, updatedBy: userId },
    })

    logAuditEvent(AuditEventType.CONFIG_CHANGED, userId, configDiff("watchlist", before, values))
    revalidatePath("/admin/settings")

    // With Redis the BullMQ scheduler follows the save at once; without it the
    // fallback poller reads the new settings on its next poll.
    const schedule = await ensureWatchlistSchedule()
    if (!schedule.ok) {
      return fail(
        "UPSTREAM_UNAVAILABLE",
        "Settings saved, but the job queue did not answer, so the sync schedule was not updated. Save again once the queue is back."
      )
    }
    return ok(null)
  },
})
