/**
 * Tautulli user statistics functions
 *
 * Fetches individual user watch statistics from Tautulli
 */

import { createLogger } from "@/lib/utils/logger"
import type {
  TautulliHistoryItem,
  TautulliUser,
} from "@/lib/validations/tautulli"
import type {
  TautulliConfig,
  TautulliStatisticsData,
  TopMedia,
  TopShow,
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
    let tautulliUser: TautulliUser | null = null

    if (userEmail) {
      // Try to match by email first (most reliable)
      tautulliUser = users.find(
        (u: TautulliUser) => u.email?.toLowerCase() === userEmail.toLowerCase()
      ) ?? null
    }

    // If no email match, try matching by username or friendly_name
    if (!tautulliUser) {
      // Try to get username from Plex user info if available
      tautulliUser = users.find(
        (u: TautulliUser) =>
          u.username?.toLowerCase() === userEmail?.toLowerCase() ||
          u.friendly_name?.toLowerCase() === userEmail?.toLowerCase()
      ) ?? null
    }

    // Last resort: try matching by Plex user ID if it's stored in Tautulli
    if (!tautulliUser) {
      tautulliUser = users.find(
        (u: TautulliUser) =>
          u.plex_id?.toString() === plexUserId ||
          u.user_id?.toString() === plexUserId
      ) ?? null
    }

    if (!tautulliUser) {
      const availableUsers = users.map((u: TautulliUser) =>
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
    let allHistory: TautulliHistoryItem[] = []
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
      let historyPage: TautulliHistoryItem[] = []
      if (Array.isArray(historyData.response?.data)) {
        // Data is directly an array
        historyPage = historyData.response.data as TautulliHistoryItem[]
      } else if (historyData.response?.data?.data) {
        // Data is nested in data.data (paginated response)
        historyPage = historyData.response.data.data as TautulliHistoryItem[]
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
    const history = allHistory.filter((item: TautulliHistoryItem) => {
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
        episodesWatched: history.filter((item: TautulliHistoryItem) => item.media_type === "episode").length,
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
