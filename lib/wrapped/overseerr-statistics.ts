/**
 * Overseerr statistics functions
 */

import { createLogger } from "@/lib/utils/logger"
import type { OverseerrConfig, OverseerrStatisticsData } from "./statistics-types"

const logger = createLogger("STATISTICS")

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
  data?: OverseerrStatisticsData
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
