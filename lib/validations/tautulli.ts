import { z } from "zod"

import { createPublicUrlSchema, createServerUrlSchema } from "./shared-schemas"

export const tautulliSchema = z.object({
  name: z.string().min(1, "Server name is required"),
  url: createServerUrlSchema("8181"),
  apiKey: z.string().min(1, "API key is required"),
  publicUrl: createPublicUrlSchema("tautulli.example.com"),
})

export type TautulliInput = z.input<typeof tautulliSchema>
export type TautulliParsed = z.output<typeof tautulliSchema>

/**
 * Tautulli API response types
 * Based on Tautulli API documentation: https://docs.tautulli.com/extending-tautulli/api-reference
 */

/**
 * Tautulli history item from get_history API endpoint
 * Represents a single playback record in the watch history
 */
export interface TautulliHistoryItem {
  /** Unix timestamp when the playback started */
  date: number
  /** Unix timestamp of playback start (alternative field) */
  started?: number
  /** Total duration of the media in seconds */
  duration: number
  /** Actual duration watched in seconds */
  viewed_duration?: number
  /** Type of media: 'movie', 'episode', 'track' */
  media_type: "movie" | "episode" | "track"
  /** Title of the media (movie title or episode title) */
  title: string
  /** Show title for episodes */
  grandparent_title?: string
  /** Release year */
  year?: number
  /** Original release year */
  original_year?: number
  /** User or audience rating */
  rating?: number
  /** User-set rating */
  user_rating?: number
  /** Unique identifier for the media item in Plex */
  rating_key?: string
  /** Parent rating key (for episodes, this is the season) */
  parent_rating_key?: string
  /** Grandparent rating key (for episodes, this is the show) */
  grandparent_rating_key?: string
  /** Tautulli user ID */
  user_id?: number
  /** Username of the viewer */
  user?: string
}

/**
 * Tautulli item user stats from get_item_user_stats API endpoint
 * Represents user statistics for a specific media item
 */
export interface TautulliItemUserStat {
  /** User ID */
  user_id?: number
  /** Username */
  username?: string
  /** User-friendly display name */
  friendly_name?: string
  /** Total duration in seconds */
  total_duration?: number
  /** Duration in seconds (alternative field) */
  duration?: number
  /** Time watched in seconds (alternative field) */
  time?: number
  /** Number of plays */
  plays?: string | number
}

/**
 * Tautulli home stats row from get_home_stats API endpoint
 * Represents a row of user watch time statistics
 */
export interface TautulliHomeStatsRow {
  /** User ID */
  user_id?: number
  /** User string identifier */
  user?: string
  /** Username */
  username?: string
  /** User-friendly display name */
  friendly_name?: string
  /** Total duration in seconds */
  total_duration?: number | string
  /** Duration in seconds (alternative field) */
  duration?: number | string
  /** Movies watch time in seconds */
  movies_duration?: number | string
  /** Shows watch time in seconds */
  shows_duration?: number | string
}

/**
 * Tautulli home stats stat object from get_home_stats API endpoint
 * Represents a stat category with rows of data
 */
export interface TautulliHomeStat {
  /** Stat identifier (e.g., "top_users") */
  stat_id?: string
  /** Array of stat rows */
  rows?: TautulliHomeStatsRow[]
}

