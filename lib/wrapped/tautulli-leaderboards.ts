/**
 * Tautulli leaderboard functions
 *
 * Fetches leaderboard data for media items and overall watch time
 */

import { createLogger } from "@/lib/utils/logger"
import type {
  TautulliItemUserStat,
  TautulliHomeStatsRow,
  TautulliHomeStat,
} from "@/lib/validations/tautulli"
import type {
  TautulliConfig,
  LeaderboardEntry,
  WatchTimeLeaderboardEntry,
} from "./statistics-types"

const logger = createLogger("STATISTICS")

/**
 * Fetch leaderboard stats for a specific media item (movie or show)
 * Returns all users who watched it and their stats
 */
export async function fetchItemLeaderboard(
  config: TautulliConfig,
  ratingKey: string,
  mediaType: "movie" | "show",
  year: number
): Promise<{
  success: boolean
  data?: LeaderboardEntry[]
  error?: string
}> {
  try {
    const baseUrl = `${config.url}/api/v2`
    const apiKey = config.apiKey

    // Use Unix timestamps for date filtering
    const startDate = new Date(`${year}-01-01T00:00:00Z`).getTime() / 1000
    const endDate = new Date(`${year}-12-31T23:59:59Z`).getTime() / 1000

    // Fetch user stats for this item
    const statsUrl = `${baseUrl}?apikey=${apiKey}&cmd=get_item_user_stats&rating_key=${ratingKey}&time_range=${startDate},${endDate}`

    const response = await fetch(statsUrl, {
      headers: {
        "Accept": "application/json",
      },
    })

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch item leaderboard: ${response.statusText}`,
      }
    }

    const data = await response.json()

    if (data.response?.result === "error") {
      return {
        success: false,
        error: data.response?.message || "Tautulli API error",
      }
    }

    const stats = (data.response?.data || []) as TautulliItemUserStat[]
    const leaderboard = stats.map((stat: TautulliItemUserStat) => {
      // Tautulli's get_item_user_stats returns duration in seconds
      // Try multiple possible field names for duration
      const durationSeconds = stat.total_duration || stat.duration || stat.time || 0
      const watchTimeMinutes = Math.floor(parseInt(durationSeconds.toString(), 10) / 60)

      return {
        userId: stat.user_id?.toString() || "",
        username: stat.username || stat.friendly_name || "Unknown",
        friendlyName: stat.friendly_name || stat.username || "Unknown",
        watchTime: watchTimeMinutes,
        playCount: parseInt(String(stat.plays || "0"), 10),
        episodesWatched: mediaType === "show" ? parseInt(String(stat.plays || "0"), 10) : undefined,
      }
    })

    // Sort by watch time descending
    leaderboard.sort((a: { watchTime: number }, b: { watchTime: number }) => b.watchTime - a.watchTime)

    return {
      success: true,
      data: leaderboard,
    }
  } catch (error) {
    logger.error("Error fetching item leaderboard", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch item leaderboard",
    }
  }
}

/**
 * Fetch overall watch time leaderboard for all users
 * Uses get_home_stats API which returns aggregated watch time statistics
 */
export async function fetchWatchTimeLeaderboard(
  config: TautulliConfig,
  year: number
): Promise<{
  success: boolean
  data?: WatchTimeLeaderboardEntry[]
  error?: string
}> {
  try {
    const baseUrl = `${config.url}/api/v2`
    const apiKey = config.apiKey

    // Calculate days from beginning of year to now
    const yearStart = new Date(`${year}-01-01T00:00:00Z`)
    const now = new Date()
    const daysSinceYearStart = Math.floor((now.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24))

    // Fetch top users by watch time using get_home_stats
    // type=duration for watch time, time_range is days since start of year
    const homeStatsUrl = `${baseUrl}?apikey=${apiKey}&cmd=get_home_stats&time_range=${daysSinceYearStart}&type=duration&stats_count=1000`

    const response = await fetch(homeStatsUrl, {
      headers: {
        "Accept": "application/json",
      },
    })

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch home stats: ${response.statusText}`,
      }
    }

    const data = await response.json()

    if (data.response?.result === "error") {
      return {
        success: false,
        error: data.response?.message || "Tautulli API error",
      }
    }

    // Extract user stats from home stats response
    // The response contains an array of stat objects, each with a rows array
    const stats = (data.response?.data || []) as TautulliHomeStat[]

    // Find the stat object that contains user watch time data
    // Look for stat_id like "top_users" or check rows for user data
    let userRows: TautulliHomeStatsRow[] = []

    // First, try to find a stat with user-specific stat_id
    for (const stat of stats) {
      const statId = stat.stat_id?.toLowerCase() || ""
      if (statId.includes("user") && stat.rows && Array.isArray(stat.rows)) {
        userRows = stat.rows
        break
      }
    }

    // If not found by stat_id, check rows for user data
    if (userRows.length === 0) {
      for (const stat of stats) {
        if (stat.rows && Array.isArray(stat.rows)) {
          // Check if this stat contains user data (rows with user or friendly_name fields)
          const hasUserData = stat.rows.some((row: TautulliHomeStatsRow) => row.user || row.friendly_name || row.user_id)
          if (hasUserData) {
            userRows = stat.rows
            break
          }
        }
      }
    }

    // If still no user-specific stat found, try to get all rows from all stats and filter for users
    if (userRows.length === 0) {
      for (const stat of stats) {
        if (stat.rows && Array.isArray(stat.rows)) {
          userRows = userRows.concat(stat.rows.filter((row: TautulliHomeStatsRow) => row.user || row.friendly_name || row.user_id))
        }
      }
    }

    const leaderboard = userRows
      .filter((row: TautulliHomeStatsRow) => {
        // Only include users with watch time > 0
        const totalDuration = parseInt(String(row.total_duration || row.duration || "0"), 10)
        return totalDuration > 0 && (row.user || row.friendly_name || row.user_id)
      })
      .map((row: TautulliHomeStatsRow) => {
        // Tautulli returns duration in seconds
        const totalDuration = parseInt(String(row.total_duration || row.duration || "0"), 10)
        // For home stats, we might not have separate movies/shows duration
        // Try to extract from the row or default to 0
        const moviesDuration = parseInt(String(row.movies_duration || "0"), 10)
        const showsDuration = parseInt(String(row.shows_duration || "0"), 10)

        // Extract user ID - could be in user_id, user, or need to look up
        const userId = row.user_id?.toString() || row.user?.toString() || ""

        return {
          userId: userId,
          username: row.user || row.username || "Unknown",
          friendlyName: row.friendly_name || row.user || row.username || "Unknown",
          totalWatchTime: Math.floor(totalDuration / 60), // Convert seconds to minutes
          moviesWatchTime: Math.floor(moviesDuration / 60),
          showsWatchTime: Math.floor(showsDuration / 60),
        }
      })
      .filter((entry) => entry.userId) // Remove entries without user ID

    // Sort by total watch time descending
    leaderboard.sort((a: { totalWatchTime: number }, b: { totalWatchTime: number }) => b.totalWatchTime - a.totalWatchTime)

    return {
      success: true,
      data: leaderboard,
    }
  } catch (error) {
    logger.error("Error fetching watch time leaderboard", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch watch time leaderboard",
    }
  }
}

/**
 * Fetch leaderboard data for top movies and shows
 * Returns leaderboard info for each item including user's position
 */
export async function fetchTopContentLeaderboards(
  config: TautulliConfig,
  topMovies: Array<{ title: string; ratingKey?: string }>,
  topShows: Array<{ title: string; ratingKey?: string }>,
  userId: string,
  year: number
): Promise<{
  success: boolean
  data?: {
    movies: Array<{
      title: string
      ratingKey?: string
      leaderboard: Array<{
        userId: string
        username: string
        friendlyName: string
        watchTime: number
        playCount: number
      }>
      userPosition?: number
      totalWatchers: number
    }>
    shows: Array<{
      title: string
      ratingKey?: string
      leaderboard: Array<{
        userId: string
        username: string
        friendlyName: string
        watchTime: number
        playCount: number
        episodesWatched: number
      }>
      userPosition?: number
      totalWatchers: number
    }>
  }
  error?: string
}> {
  try {
    const moviesLeaderboards: Array<{
      title: string
      ratingKey?: string
      leaderboard: Array<{
        userId: string
        username: string
        friendlyName: string
        watchTime: number
        playCount: number
      }>
      userPosition?: number
      totalWatchers: number
    }> = []

    const showsLeaderboards: Array<{
      title: string
      ratingKey?: string
      leaderboard: Array<{
        userId: string
        username: string
        friendlyName: string
        watchTime: number
        playCount: number
        episodesWatched: number
      }>
      userPosition?: number
      totalWatchers: number
    }> = []

    // Fetch leaderboards for top movies
    for (const movie of topMovies.slice(0, 5)) {
      if (!movie.ratingKey) continue

      const result = await fetchItemLeaderboard(config, movie.ratingKey, "movie", year)
      if (result.success && result.data) {
        const userIndex = result.data.findIndex((entry) => entry.userId === userId)
        moviesLeaderboards.push({
          title: movie.title,
          ratingKey: movie.ratingKey,
          leaderboard: result.data.map((entry) => ({
            userId: entry.userId,
            username: entry.username,
            friendlyName: entry.friendlyName,
            watchTime: entry.watchTime,
            playCount: entry.playCount,
          })),
          userPosition: userIndex >= 0 ? userIndex + 1 : undefined,
          totalWatchers: result.data.length,
        })
      }
    }

    // Fetch leaderboards for top shows
    for (const show of topShows.slice(0, 5)) {
      if (!show.ratingKey) continue

      const result = await fetchItemLeaderboard(config, show.ratingKey, "show", year)
      if (result.success && result.data) {
        const userIndex = result.data.findIndex((entry) => entry.userId === userId)
        showsLeaderboards.push({
          title: show.title,
          ratingKey: show.ratingKey,
          leaderboard: result.data.map((entry) => ({
            userId: entry.userId,
            username: entry.username,
            friendlyName: entry.friendlyName,
            watchTime: entry.watchTime,
            playCount: entry.playCount,
            episodesWatched: entry.episodesWatched || 0,
          })),
          userPosition: userIndex >= 0 ? userIndex + 1 : undefined,
          totalWatchers: result.data.length,
        })
      }
    }

    return {
      success: true,
      data: {
        movies: moviesLeaderboards,
        shows: showsLeaderboards,
      },
    }
  } catch (error) {
    logger.error("Error fetching top content leaderboards", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch top content leaderboards",
    }
  }
}
