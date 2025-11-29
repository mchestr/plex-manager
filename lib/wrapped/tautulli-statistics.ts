/**
 * Tautulli statistics functions
 */

import { createLogger } from "@/lib/utils/logger"
import type {
  TautulliConfig,
  TautulliStatisticsData,
  TopMedia,
  TopShow,
  LeaderboardEntry,
  WatchTimeLeaderboardEntry,
} from "./statistics-types"

const logger = createLogger("STATISTICS")

/**
 * Fetch user watch statistics from Tautulli
 * Note: Tautulli uses its own user IDs, so we match users by email address
 */
export async function fetchTautulliStatistics(
  config: TautulliConfig,
  plexUserId: string,
  userEmail: string | null,
  year: number
): Promise<{
  success: boolean
  data?: TautulliStatisticsData
  error?: string
}> {
  try {
    const baseUrl = `${config.url}/api/v2`
    const apiKey = config.apiKey

    // Get user ID from Tautulli (we need to match by Plex user ID)
    // First, get all users and find the one matching our Plex user ID
    const usersUrl = `${baseUrl}?apikey=${apiKey}&cmd=get_users`
    const usersResponse = await fetch(
      usersUrl,
      {
        headers: {
          "Accept": "application/json",
        },
      }
    )

    if (!usersResponse.ok) {
      return {
        success: false,
        error: `Failed to fetch users from Tautulli: ${usersResponse.statusText}`
      }
    }

    const usersData = await usersResponse.json()

    // Check for API errors
    if (usersData.response?.result === "error") {
      return {
        success: false,
        error: usersData.response?.message || "Tautulli API error"
      }
    }

    // Tautulli API returns users in response.data (array), not response.data.users
    const users = Array.isArray(usersData.response?.data)
      ? usersData.response.data
      : usersData.response?.data?.users || []

    // Find user by email (most reliable) or username
    let tautulliUser: any = null

    if (userEmail) {
      // Try to match by email first (most reliable)
      tautulliUser = users.find(
        (u: any) => u.email?.toLowerCase() === userEmail.toLowerCase()
      )
    }

    // If no email match, try matching by username or friendly_name
    if (!tautulliUser) {
      // Try to get username from Plex user info if available
      tautulliUser = users.find(
        (u: any) =>
          u.username?.toLowerCase() === userEmail?.toLowerCase() ||
          u.friendly_name?.toLowerCase() === userEmail?.toLowerCase()
      )
    }

    // Last resort: try matching by Plex user ID if it's stored in Tautulli
    if (!tautulliUser) {
      tautulliUser = users.find(
        (u: any) =>
          u.plex_id?.toString() === plexUserId ||
          u.user_id?.toString() === plexUserId
      )
    }

    if (!tautulliUser) {
      const availableUsers = users.map((u: any) =>
        `${u.username || u.friendly_name || "Unknown"} (${u.email || "no email"})`
      ).join(", ")

      return {
        success: false,
        error: `User not found in Tautulli. Plex User ID: ${plexUserId}, Email: ${userEmail || "none"}. Available users: ${availableUsers || "none"}`
      }
    }

    const userId = tautulliUser.user_id

    // Use Unix timestamps for date filtering (more reliable)
    // For the current year, cap the end date to today; for past years, use Dec 31
    const currentYear = new Date().getFullYear()
    const currentMonth = new Date().getMonth() + 1

    const startDate = new Date(`${year}-01-01T00:00:00Z`).getTime() / 1000
    let endDate: number
    if (year < currentYear) {
      // For past years, use December 31st of that year
      endDate = new Date(`${year}-12-31T23:59:59Z`).getTime() / 1000
    } else if (year === currentYear) {
      // For current year, use today's date
      const now = new Date()
      endDate = Math.floor(now.getTime() / 1000)
    } else {
      // For future years (shouldn't happen, but handle gracefully), use Dec 31
      endDate = new Date(`${year}-12-31T23:59:59Z`).getTime() / 1000
    }

    // Fetch watch history WITHOUT date filters (Tautulli's date filtering seems unreliable)
    // We'll filter by date in code instead
    let allHistory: any[] = []
    let start = 0
    const length = 1000 // Tautulli default page size
    let hasMore = true

    while (hasMore) {
      // Fetch without date filters - Tautulli's after/before parameters are unreliable
      const historyUrl = `${baseUrl}?apikey=${apiKey}&cmd=get_history&user_id=${userId}&start=${start}&length=${length}`
      const historyResponse = await fetch(
        historyUrl,
        {
          headers: {
            "Accept": "application/json",
          },
        }
      )

      if (!historyResponse.ok) {
        return {
          success: false,
          error: `Failed to fetch watch history: ${historyResponse.statusText}`
        }
      }

      const historyData = await historyResponse.json()

      // Check for API errors
      if (historyData.response?.result === "error") {
        return {
          success: false,
          error: historyData.response?.message || "Tautulli API error"
        }
      }

      // Handle different response structures - Tautulli can return data directly or nested
      let historyPage: any[] = []
      if (Array.isArray(historyData.response?.data)) {
        // Data is directly an array
        historyPage = historyData.response.data
      } else if (historyData.response?.data?.data) {
        // Data is nested in data.data (paginated response)
        historyPage = historyData.response.data.data
      } else if (historyData.response?.data) {
        // Try to use data directly if it's an object with array-like structure
        historyPage = []
      }

      allHistory = allHistory.concat(historyPage)

      // Check if there are more pages (using recordsTotal since we're fetching all records)
      const recordsTotal = historyData.response?.data?.recordsTotal || 0
      hasMore = historyPage.length === length && allHistory.length < recordsTotal
      start += length
    }

    // Filter history by date range in code (more reliable than Tautulli's date filtering)
    const history = allHistory.filter((item: any) => {
      // Use 'date' field (when the watch happened) for filtering
      const itemDate = item.date || item.started || 0
      return itemDate >= startDate && itemDate <= endDate
    })

    // Process history to calculate statistics
    let totalWatchTime = 0
    let moviesWatchTime = 0
    let showsWatchTime = 0
    const moviesMap = new Map<string, TopMedia>()
    const showsMap = new Map<string, TopShow>()
    const monthlyWatchTime = new Map<number, number>()
    // Track top movies and shows per month
    const monthlyMovies = new Map<number, Map<string, TopMedia>>()
    const monthlyShows = new Map<number, Map<string, TopShow>>()

    for (const item of history) {
      // Handle duration - Tautulli returns duration in SECONDS (not milliseconds)
      // viewed_duration is the actual time watched, duration is the total media length
      const duration = item.duration || 0
      const watchedDuration = item.viewed_duration || duration

      // Convert from seconds to minutes
      const watchTimeMinutes = Math.floor(watchedDuration / 60)

      // Skip if no valid watch time
      if (watchTimeMinutes <= 0) continue

      // Parse date - Tautulli returns Unix timestamp
      const date = item.date ? new Date(item.date * 1000) : new Date()
      const month = date.getMonth() + 1
      const itemYear = date.getFullYear()

      // Only track months for the correct year and don't include future months for current year
      if (itemYear === year && (year < currentYear || month <= currentMonth)) {
        monthlyWatchTime.set(month, (monthlyWatchTime.get(month) || 0) + watchTimeMinutes)
      }

      if (item.media_type === "movie") {
        totalWatchTime += watchTimeMinutes
        moviesWatchTime += watchTimeMinutes

        const title = item.title || item.grandparent_title || "Unknown"
        const mediaYear = item.year || item.original_year || undefined
        const rating = item.rating || item.user_rating || undefined
        const ratingKey = item.rating_key?.toString() || undefined

        // Update overall movie map
        const existing = moviesMap.get(title) || {
          title,
          watchTime: 0,
          playCount: 0,
          year: mediaYear,
          rating,
          ratingKey
        }
        existing.watchTime += watchTimeMinutes
        existing.playCount += 1
        // Update year/rating/ratingKey if we have better data
        if (mediaYear && !existing.year) existing.year = mediaYear
        if (rating && !existing.rating) existing.rating = rating
        if (ratingKey && !existing.ratingKey) existing.ratingKey = ratingKey
        moviesMap.set(title, existing)

        // Update monthly movie map (only for valid months)
        if (itemYear === year && (year < currentYear || month <= currentMonth)) {
          if (!monthlyMovies.has(month)) {
            monthlyMovies.set(month, new Map())
          }
          const monthlyMovieMap = monthlyMovies.get(month)!
          const monthlyMovie = monthlyMovieMap.get(title) || {
            title,
            watchTime: 0,
            playCount: 0,
            year: mediaYear,
            rating,
            ratingKey
          }
          monthlyMovie.watchTime += watchTimeMinutes
          monthlyMovie.playCount += 1
          if (mediaYear && !monthlyMovie.year) monthlyMovie.year = mediaYear
          if (rating && !monthlyMovie.rating) monthlyMovie.rating = rating
          if (ratingKey && !monthlyMovie.ratingKey) monthlyMovie.ratingKey = ratingKey
          monthlyMovieMap.set(title, monthlyMovie)
        }
      } else if (item.media_type === "episode") {
        totalWatchTime += watchTimeMinutes
        showsWatchTime += watchTimeMinutes

        const showTitle = item.grandparent_title || item.title || "Unknown"
        const mediaYear = item.year || item.original_year || undefined
        const rating = item.rating || item.user_rating || undefined
        // For episodes, use grandparent_rating_key for the show's rating key
        const ratingKey = item.grandparent_rating_key?.toString() || undefined

        // Update overall show map
        const existing = showsMap.get(showTitle) || {
          title: showTitle,
          watchTime: 0,
          playCount: 0,
          episodesWatched: 0,
          year: mediaYear,
          rating,
          ratingKey
        }
        existing.watchTime += watchTimeMinutes
        existing.playCount += 1
        existing.episodesWatched += 1
        // Update year/rating/ratingKey if we have better data
        if (mediaYear && !existing.year) existing.year = mediaYear
        if (rating && !existing.rating) existing.rating = rating
        if (ratingKey && !existing.ratingKey) existing.ratingKey = ratingKey
        showsMap.set(showTitle, existing)

        // Update monthly show map (only for valid months)
        if (itemYear === year && (year < currentYear || month <= currentMonth)) {
          if (!monthlyShows.has(month)) {
            monthlyShows.set(month, new Map())
          }
          const monthlyShowMap = monthlyShows.get(month)!
          const monthlyShow = monthlyShowMap.get(showTitle) || {
            title: showTitle,
            watchTime: 0,
            playCount: 0,
            episodesWatched: 0,
            year: mediaYear,
            rating,
            ratingKey
          }
          monthlyShow.watchTime += watchTimeMinutes
          monthlyShow.playCount += 1
          monthlyShow.episodesWatched += 1
          if (mediaYear && !monthlyShow.year) monthlyShow.year = mediaYear
          if (rating && !monthlyShow.rating) monthlyShow.rating = rating
          if (ratingKey && !monthlyShow.ratingKey) monthlyShow.ratingKey = ratingKey
          monthlyShowMap.set(showTitle, monthlyShow)
        }
      }
    }

    // Convert maps to sorted arrays
    const topMovies = Array.from(moviesMap.values())
      .sort((a, b) => b.watchTime - a.watchTime)
      .slice(0, 10)

    const topShows = Array.from(showsMap.values())
      .sort((a, b) => b.watchTime - a.watchTime)
      .slice(0, 10)

    // Process monthly watch time and top content
    const monthNames = ["January", "February", "March", "April", "May", "June",
                       "July", "August", "September", "October", "November", "December"]
    const watchTimeByMonth = Array.from(monthlyWatchTime.entries())
      .map(([month, watchTime]) => {
        // Find top movie for this month
        const monthMovies = monthlyMovies.get(month)
        const topMovie = monthMovies
          ? Array.from(monthMovies.values())
              .sort((a, b) => b.watchTime - a.watchTime)[0]
          : undefined

        // Find top show for this month
        const monthShows = monthlyShows.get(month)
        const topShow = monthShows
          ? Array.from(monthShows.values())
              .sort((a, b) => b.watchTime - a.watchTime)[0]
          : undefined

        return {
          month,
          monthName: monthNames[month - 1],
          watchTime,
          topMovie: topMovie ? {
            title: topMovie.title,
            watchTime: topMovie.watchTime,
            playCount: topMovie.playCount,
            year: topMovie.year,
            rating: topMovie.rating,
          } : undefined,
          topShow: topShow ? {
            title: topShow.title,
            watchTime: topShow.watchTime,
            playCount: topShow.playCount,
            episodesWatched: topShow.episodesWatched,
            year: topShow.year,
            rating: topShow.rating,
          } : undefined,
        }
      })
      .sort((a, b) => a.month - b.month)

    return {
      success: true,
      data: {
        tautulliUserId: userId.toString(),
        totalWatchTime,
        moviesWatchTime,
        showsWatchTime,
        moviesWatched: moviesMap.size,
        showsWatched: showsMap.size,
        episodesWatched: history.filter((item: any) => item.media_type === "episode").length,
        topMovies,
        topShows,
        watchTimeByMonth,
      },
    }
  } catch (error) {
    logger.error("Error fetching Tautulli statistics", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch Tautulli statistics",
    }
  }
}

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

    const stats = data.response?.data || []
    const leaderboard = stats.map((stat: any) => {
      // Tautulli's get_item_user_stats returns duration in seconds
      // Try multiple possible field names for duration
      const durationSeconds = stat.total_duration || stat.duration || stat.time || 0
      const watchTimeMinutes = Math.floor(parseInt(durationSeconds.toString(), 10) / 60)

      return {
        userId: stat.user_id?.toString() || "",
        username: stat.username || stat.friendly_name || "Unknown",
        friendlyName: stat.friendly_name || stat.username || "Unknown",
        watchTime: watchTimeMinutes,
        playCount: parseInt(stat.plays || "0", 10),
        episodesWatched: mediaType === "show" ? parseInt(stat.plays || "0", 10) : undefined,
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
    const stats = data.response?.data || []

    // Find the stat object that contains user watch time data
    // Look for stat_id like "top_users" or check rows for user data
    let userRows: any[] = []

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
          const hasUserData = stat.rows.some((row: any) => row.user || row.friendly_name || row.user_id)
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
          userRows = userRows.concat(stat.rows.filter((row: any) => row.user || row.friendly_name || row.user_id))
        }
      }
    }

    const leaderboard = userRows
      .filter((row: any) => {
        // Only include users with watch time > 0
        const totalDuration = parseInt(row.total_duration || row.duration || "0", 10)
        return totalDuration > 0 && (row.user || row.friendly_name || row.user_id)
      })
      .map((row: any) => {
        // Tautulli returns duration in seconds
        const totalDuration = parseInt(row.total_duration || row.duration || "0", 10)
        // For home stats, we might not have separate movies/shows duration
        // Try to extract from the row or default to 0
        const moviesDuration = parseInt(row.movies_duration || "0", 10)
        const showsDuration = parseInt(row.shows_duration || "0", 10)

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
      .filter((entry: any) => entry.userId) // Remove entries without user ID

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

/**
 * Fetch only library counts from Tautulli (no storage calculation)
 */
export async function fetchTautulliLibraryCounts(
  config: TautulliConfig
): Promise<{
  success: boolean
  data?: {
    librarySize: {
      movies: number
      shows: number
      episodes: number
    }
  }
  error?: string
}> {
  try {
    const baseUrl = `${config.url}/api/v2`
    const apiKey = config.apiKey

    // Get libraries - this provides counts including child_count (episodes)
    const librariesUrl = `${baseUrl}?apikey=${apiKey}&cmd=get_libraries`

    const librariesResponse = await fetch(librariesUrl, {
      headers: { "Accept": "application/json" },
    })

    if (!librariesResponse.ok) {
      return {
        success: false,
        error: `Failed to fetch libraries from Tautulli: ${librariesResponse.statusText}`,
      }
    }

    const librariesData = await librariesResponse.json()

    if (librariesData.response?.result === "error") {
      return {
        success: false,
        error: librariesData.response?.message || "Tautulli API error",
      }
    }

    const libraries = Array.isArray(librariesData.response?.data)
      ? librariesData.response.data
      : librariesData.response?.data?.data || []

    let moviesCount = 0
    let showsCount = 0
    let episodesCount = 0

    // Sum counts from all libraries
    for (const library of libraries) {
      const sectionType = library.section_type
      const count = parseInt(library.count || "0", 10)
      const childCount = parseInt(library.child_count || "0", 10)

      if (sectionType === "movie") {
        moviesCount += count
      } else if (sectionType === "show") {
        showsCount += count
        episodesCount += childCount
      }
    }

    return {
      success: true,
      data: {
        librarySize: {
          movies: moviesCount,
          shows: showsCount,
          episodes: episodesCount,
        },
      },
    }
  } catch (error) {
    logger.error("Error fetching library counts from Tautulli", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch library counts from Tautulli",
    }
  }
}
