import { z } from "zod"

/**
 * Schema for a watchlist item from Plex API
 */
const watchlistItemSchema = z.object({
  ratingKey: z.string(),
  guid: z.string(),
  type: z.enum(["movie", "show"]),
  title: z.string(),
  year: z.number().optional(),
  // External IDs parsed from Guid array
  tmdbId: z.number().optional(),
  tvdbId: z.number().optional(),
  imdbId: z.string().optional(),
})

export type WatchlistItem = z.infer<typeof watchlistItemSchema>

/**
 * Schema for updating user watchlist sync settings
 */
export const updateWatchlistSyncSettingsSchema = z.object({
  syncEnabled: z.boolean(),
})

export type UpdateWatchlistSyncSettings = z.infer<typeof updateWatchlistSyncSettingsSchema>

/**
 * Schema for global watchlist sync settings (admin)
 */
export const globalWatchlistSyncSettingsSchema = z.object({
  watchlistSyncEnabled: z.boolean(),
  watchlistSyncIntervalMinutes: z.number().min(15).max(1440), // 15 min to 24 hours
})

export type GlobalWatchlistSyncSettings = z.infer<typeof globalWatchlistSyncSettingsSchema>

/**
 * Schema for sync result
 */
const syncResultSchema = z.object({
  success: z.boolean(),
  itemsSynced: z.number(),
  itemsRequested: z.number(),
  itemsSkipped: z.number(),
  itemsFailed: z.number(),
  errors: z.array(z.string()).optional(),
})

export type SyncResult = z.infer<typeof syncResultSchema>
