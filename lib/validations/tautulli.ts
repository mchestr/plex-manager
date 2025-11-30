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
 * Tautulli user from get_users API endpoint
 * Represents a user account tracked by Tautulli
 */
export interface TautulliUser {
  /** Tautulli's internal user ID */
  user_id: number
  /** Username displayed in Tautulli */
  username?: string
  /** User's email address (if available from Plex) */
  email?: string
  /** Plex user ID (may differ from Tautulli user_id) */
  plex_id?: string
  /** User-friendly display name */
  friendly_name?: string
  /** User's avatar/thumb URL */
  thumb?: string
  /** Whether the user is currently active */
  is_active?: boolean
  /** Whether the user is allowed to sync media */
  do_notify?: boolean
  /** Whether the user is allowed to filter content */
  allow_guest?: boolean
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

/**
 * Zod schema for Tautulli session from get_activity API endpoint
 * Validates the session object structure for observability dashboard
 */
export const tautulliSessionSchema = z.object({
  session_id: z.string().optional(),
  session_key: z.string().optional(),
  user: z.string().optional(),
  user_thumb: z.string().optional(),
  title: z.string().optional(),
  grandparent_title: z.string().optional(),
  media_type: z.string().optional(),
  progress_percent: z.union([z.string(), z.number()]).optional(),
  state: z.string().optional(),
  player: z.string().optional(),
  quality_profile: z.string().optional(),
  stream_video_full_resolution: z.string().optional(),
  duration: z.union([z.string(), z.number()]).optional(),
  view_offset: z.union([z.string(), z.number()]).optional(),
})

export type TautulliSession = z.infer<typeof tautulliSessionSchema>

/**
 * Zod schema for Tautulli activity response from get_activity API endpoint
 * Validates the full response structure including nested data
 */
export const tautulliActivityResponseSchema = z.object({
  response: z.object({
    data: z.object({
      sessions: z.array(tautulliSessionSchema).optional(),
      stream_count: z.number().optional(),
    }).optional(),
  }).optional(),
})

export type TautulliActivityResponse = z.infer<typeof tautulliActivityResponseSchema>

