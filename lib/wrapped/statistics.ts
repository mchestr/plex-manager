/**
 * Functions to fetch statistics from Tautulli, Plex, and Overseerr
 */

import { createLogger } from "@/lib/utils/logger"
import { formatBytes } from "@/lib/utils/time-formatting"

const logger = createLogger("STATISTICS")


export interface TautulliConfig {
  url: string
  apiKey: string
}

export interface PlexConfig {
  url: string
  token: string
}

export interface OverseerrConfig {
  url: string
  apiKey: string
}

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
  data?: {
    tautulliUserId: string // Tautulli user ID for leaderboard queries
    totalWatchTime: number
    moviesWatchTime: number
    showsWatchTime: number
    moviesWatched: number
    showsWatched: number
    episodesWatched: number
    topMovies: Array<{
      title: string
      watchTime: number
      playCount: number
      year?: number
      rating?: number
      ratingKey?: string
    }>
    topShows: Array<{
      title: string
      watchTime: number
      playCount: number
      episodesWatched: number
      year?: number
      rating?: number
      ratingKey?: string
    }>
    watchTimeByMonth: Array<{
      month: number
      monthName: string
      watchTime: number
      topMovie?: {
        title: string
        watchTime: number
        playCount: number
        year?: number
        rating?: number
      }
      topShow?: {
        title: string
        watchTime: number
        playCount: number
        episodesWatched: number
        year?: number
        rating?: number
      }
    }>
  }
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
    const moviesMap = new Map<string, { title: string; watchTime: number; playCount: number; year?: number; rating?: number; ratingKey?: string }>()
    const showsMap = new Map<string, { title: string; watchTime: number; playCount: number; episodesWatched: number; year?: number; rating?: number; ratingKey?: string }>()
    const monthlyWatchTime = new Map<number, number>()
    // Track top movies and shows per month
    const monthlyMovies = new Map<number, Map<string, { title: string; watchTime: number; playCount: number; year?: number; rating?: number; ratingKey?: string }>>()
    const monthlyShows = new Map<number, Map<string, { title: string; watchTime: number; playCount: number; episodesWatched: number; year?: number; rating?: number; ratingKey?: string }>>()

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
 * Fetch server statistics from Plex API (more efficient than Tautulli for storage)
 */
async function fetchPlexServerStatisticsFromPlex(
  config: PlexConfig
): Promise<{
  success: boolean
  data?: {
    totalStorage: number
    totalStorageFormatted: string
    librarySize: {
      movies: number
      shows: number
      episodes: number
    }
  }
  error?: string
}> {
  try {
    const baseUrl = `${config.url}`
    const token = config.token

    // Get all library sections
    const sectionsUrl = `${baseUrl}/library/sections?X-Plex-Token=${token}`

    const sectionsResponse = await fetch(sectionsUrl, {
      headers: { "Accept": "application/json" },
    })

    if (!sectionsResponse.ok) {
      logger.error("Failed to fetch library sections from Plex", undefined, { statusText: sectionsResponse.statusText })
      return {
        success: false,
        error: `Failed to fetch library sections from Plex: ${sectionsResponse.statusText}`,
      }
    }

    const sectionsData = await sectionsResponse.json()
    const sections = sectionsData.MediaContainer?.Directory || []

    if (!Array.isArray(sections)) {
      logger.error("Invalid response format from Plex API: expected array of sections")
      return {
        success: false,
        error: "Invalid response format from Plex API",
      }
    }

    let totalStorage = 0
    let moviesCount = 0
    let showsCount = 0
    let episodesCount = 0

    // Process each library section
    for (const section of sections) {
      const sectionKey = section.key
      const sectionTitle = section.title || `Section ${sectionKey}`
      const sectionType = section.type // "movie" or "show"

      try {
        // Get all items in this section using /all endpoint
        const allItemsUrl = `${baseUrl}/library/sections/${sectionKey}/all?X-Plex-Token=${token}&includeGuids=1`

        const allItemsResponse = await fetch(allItemsUrl, {
          headers: { "Accept": "application/json" },
        })

        if (!allItemsResponse.ok) {
          console.warn(`[STATISTICS] Failed to fetch items for library "${sectionTitle}": ${allItemsResponse.statusText}`)
          continue
        }

        const allItemsData = await allItemsResponse.json()
        const mediaContainer = allItemsData.MediaContainer || {}
        const items = mediaContainer.Metadata || []
        const totalSize = mediaContainer.totalSize || items.length

        if (sectionType === "movie") {
          moviesCount += totalSize

          // Sum file sizes from all movies
          for (const movie of items) {
            const media = movie.Media || []
            for (const mediaItem of media) {
              const parts = mediaItem.Part || []
              for (const part of parts) {
                totalStorage += parseInt(part.size || "0", 10)
              }
            }
          }
        } else if (sectionType === "show") {
          showsCount += totalSize

          // Get all episodes directly using type=episode filter
          const episodesUrl = `${baseUrl}/library/sections/${sectionKey}/all?X-Plex-Token=${token}&type=4` // type=4 is episode

          const episodesResponse = await fetch(episodesUrl, {
            headers: { "Accept": "application/json" },
          })

          if (episodesResponse.ok) {
            const episodesData = await episodesResponse.json()
            const episodesContainer = episodesData.MediaContainer || {}
            const episodes = episodesContainer.Metadata || []
            episodesCount += episodes.length

            // Sum file sizes from all episodes
            for (const episode of episodes) {
              const media = episode.Media || []
              for (const mediaItem of media) {
                const parts = mediaItem.Part || []
                for (const part of parts) {
                  totalStorage += parseInt(part.size || "0", 10)
                }
              }
            }
          } else {
            console.warn(`[STATISTICS] Failed to fetch episodes for library "${sectionTitle}": ${episodesResponse.statusText}`)
          }
        }
      } catch (libraryError) {
        console.warn(`[STATISTICS] Error processing library "${sectionTitle}":`, libraryError)
        continue
      }
    }

    return {
      success: true,
      data: {
        totalStorage,
        totalStorageFormatted: formatBytes(totalStorage),
        librarySize: {
          movies: moviesCount,
          shows: showsCount,
          episodes: episodesCount,
        },
      },
    }
  } catch (error) {
    logger.error("Error fetching server statistics from Plex", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch server statistics from Plex",
    }
  }
}

/**
 * Fetch server statistics from Plex API (storage) and Tautulli API (counts)
 */
export async function fetchPlexServerStatistics(
  config: PlexConfig,
  tautulliConfig: TautulliConfig
): Promise<{
  success: boolean
  data?: {
    totalStorage: number
    totalStorageFormatted: string
    librarySize: {
      movies: number
      shows: number
      episodes: number
    }
  }
  error?: string
}> {
  try {
    // Use Plex API for storage (more efficient)
    // Use Tautulli for counts only (get_libraries provides accurate episode counts)
    const [plexResult, tautulliCountsResult] = await Promise.all([
      fetchPlexServerStatisticsFromPlex(config),
      fetchTautulliLibraryCounts(tautulliConfig),
    ])

    if (!plexResult.success) {
      return plexResult
    }

    if (!tautulliCountsResult.success) {
      return {
        success: false,
        error: tautulliCountsResult.error || "Failed to fetch library counts from Tautulli",
      }
    }

    // Combine: use Plex for storage, Tautulli for counts
    return {
      success: true,
      data: {
        totalStorage: plexResult.data!.totalStorage,
        totalStorageFormatted: plexResult.data!.totalStorageFormatted,
        librarySize: tautulliCountsResult.data!.librarySize,
      },
    }
  } catch (error) {
    logger.error("Error fetching server statistics", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch server statistics",
    }
  }
}

/**
 * Fetch only library counts from Tautulli (no storage calculation)
 */
async function fetchTautulliLibraryCounts(
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

/**
 * Fetch Overseerr statistics for a user
 * Note: Overseerr uses internal user IDs, so we need to find the user first
 */
export async function fetchOverseerrStatistics(
  config: OverseerrConfig,
  userEmail: string | null,
  year: number
): Promise<{
  success: boolean
  data?: {
    totalRequests: number
    totalServerRequests: number
    approvedRequests: number
    pendingRequests: number
    topRequestedGenres: Array<{
      genre: string
      count: number
    }>
  }
  error?: string
}> {
  try {
    const baseUrl = `${config.url}/api/v1`
    const apiKey = config.apiKey

    // First, find the user in Overseerr by email
    let overseerrUserId: number | null = null

    if (userEmail) {
      try {
        const usersResponse = await fetch(
          `${baseUrl}/user`,
          {
            headers: {
              "X-Api-Key": apiKey,
              "Accept": "application/json",
            },
          }
        )

        if (usersResponse.ok) {
          const usersData = await usersResponse.json()
          const users = usersData.results || []

          // Find user by email
          const user = users.find((u: any) =>
            u.email?.toLowerCase() === userEmail.toLowerCase()
          )

          if (user) {
            overseerrUserId = user.id
          }
        }
      } catch (userError) {
        // Continue without user filtering - will get all requests
      }
    }

    // Fetch requests with pagination
    let allRequests: any[] = []
    let page = 1
    const take = 100
    let hasMore = true

    while (hasMore) {
      const requestsResponse = await fetch(
        `${baseUrl}/request?take=${take}&skip=${(page - 1) * take}&sort=added&filter=all`,
        {
          headers: {
            "X-Api-Key": apiKey,
            "Accept": "application/json",
          },
        }
      )

      if (!requestsResponse.ok) {
        if (page === 1) {
          return {
            success: false,
            error: `Failed to fetch Overseerr requests: ${requestsResponse.statusText}`
          }
        }
        // If pagination fails, use what we have
        break
      }

      const requestsData = await requestsResponse.json()
      const requests = requestsData.results || []

      if (requests.length === 0) {
        hasMore = false
      } else {
        allRequests = allRequests.concat(requests)
        hasMore = requests.length === take
        page++
      }
    }

    // Filter requests for the year and user (if we found the user)
    const yearStart = new Date(`${year}-01-01T00:00:00Z`).getTime()
    const yearEnd = new Date(`${year}-12-31T23:59:59Z`).getTime()

    // First, filter all requests for the year (total server requests)
    const allYearRequests = allRequests.filter((req: any) => {
      const requestDate = new Date(req.createdAt).getTime()
      return requestDate >= yearStart && requestDate <= yearEnd
    })

    // Then filter to user's requests only
    let yearRequests = allYearRequests.filter((req: any) => {
      // Filter by user if we found the Overseerr user ID
      if (overseerrUserId !== null) {
        return req.requestedBy?.id === overseerrUserId
      }

      return false
    })

    // If we couldn't find the user, try to match by email in the request data
    if (overseerrUserId === null && userEmail && allYearRequests.length > 0) {
      // Overseerr might include user email in request data
      yearRequests = allYearRequests.filter((req: any) => {
        const reqEmail = req.requestedBy?.email || req.email
        return !reqEmail || reqEmail.toLowerCase() === userEmail.toLowerCase()
      })
    }

    // Status codes: 1 = Pending, 2 = Approved, 3 = Available
    const approvedRequests = yearRequests.filter((req: any) =>
      req.status === 2 || req.status === 3
    ).length

    const pendingRequests = yearRequests.filter((req: any) =>
      req.status === 1
    ).length

    // Calculate top genres
    const genreCounts = new Map<string, number>()
    for (const req of yearRequests) {
      if (req.media?.genres && Array.isArray(req.media.genres)) {
        for (const genre of req.media.genres) {
          const genreName = genre.name || genre
          if (genreName) {
            genreCounts.set(genreName, (genreCounts.get(genreName) || 0) + 1)
          }
        }
      }
    }

    const topRequestedGenres = Array.from(genreCounts.entries())
      .map(([genre, count]) => ({ genre, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return {
      success: true,
      data: {
        totalRequests: yearRequests.length,
        totalServerRequests: allYearRequests.length,
        approvedRequests,
        pendingRequests,
        topRequestedGenres,
      },
    }
  } catch (error) {
    logger.error("Error fetching Overseerr statistics", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch Overseerr statistics",
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
  data?: Array<{
    userId: string
    username: string
    friendlyName: string
    watchTime: number // in minutes
    playCount: number
    episodesWatched?: number // for shows only
  }>
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
  data?: Array<{
    userId: string
    username: string
    friendlyName: string
    totalWatchTime: number // in minutes
    moviesWatchTime: number // in minutes
    showsWatchTime: number // in minutes
  }>
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

// Re-export formatBytes for backward compatibility with existing imports
export { formatBytes } from "@/lib/utils/time-formatting"

