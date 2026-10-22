import { z } from "zod"

/**
 * Schema for updating user watchlist sync settings
 */
export const updateWatchlistSyncSettingsSchema = z.object({
  syncEnabled: z.boolean(),
})

/**
 * Schema for global watchlist sync settings (admin)
 */
export const globalWatchlistSyncSettingsSchema = z.object({
  watchlistSyncEnabled: z.boolean(),
  watchlistSyncIntervalMinutes: z.number().min(15).max(1440), // 15 min to 24 hours
})
