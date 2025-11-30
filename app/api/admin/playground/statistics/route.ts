import { prisma } from "@/lib/prisma"
import { requireAdminAPI } from "@/lib/security/api-helpers"
import { adminRateLimiter } from "@/lib/security/rate-limit"
import { createSafeError, ErrorCode, getStatusCode, logError } from "@/lib/security/error-handler"
import { getActivePlexService, getActiveTautulliService, getActiveOverseerrService } from "@/lib/services/service-helpers"
import { NextRequest, NextResponse } from "next/server"
import {
  fetchOverseerrStatistics,
  fetchPlexServerStatistics,
  fetchTautulliStatistics,
  fetchTopContentLeaderboards,
  fetchWatchTimeLeaderboard,
} from "@/lib/wrapped/statistics"
import { WrappedStatistics } from "@/types/wrapped"

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResponse = await adminRateLimiter(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    // Require admin authentication
    const authResult = await requireAdminAPI(request)
    if (authResult.response) {
      return authResult.response
    }

    const userName = request.nextUrl.searchParams.get("userName")
    const yearParam = request.nextUrl.searchParams.get("year")
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear()

    if (!userName) {
      return NextResponse.json(
        createSafeError(ErrorCode.VALIDATION_ERROR, "userName parameter is required"),
        { status: getStatusCode(ErrorCode.VALIDATION_ERROR) }
      )
    }

    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        createSafeError(ErrorCode.VALIDATION_ERROR, "Invalid year parameter"),
        { status: getStatusCode(ErrorCode.VALIDATION_ERROR) }
      )
    }

    // Find user by name (try name first, then email)
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { name: userName },
          { email: userName },
        ],
      },
    })

    if (!user) {
      return NextResponse.json(
        createSafeError(ErrorCode.NOT_FOUND, `User not found: ${userName}`),
        { status: getStatusCode(ErrorCode.NOT_FOUND) }
      )
    }

    if (!user.plexUserId) {
      return NextResponse.json(
        createSafeError(ErrorCode.VALIDATION_ERROR, "User does not have a Plex user ID"),
        { status: getStatusCode(ErrorCode.VALIDATION_ERROR) }
      )
    }

    // Get Tautulli service configuration
    const tautulliService = await getActiveTautulliService()

    if (!tautulliService) {
      return NextResponse.json(
        createSafeError(ErrorCode.NOT_FOUND, "No active Tautulli server configured"),
        { status: getStatusCode(ErrorCode.NOT_FOUND) }
      )
    }

    // Fetch statistics from Tautulli
    const tautulliStats = await fetchTautulliStatistics(
      {
        url: tautulliService.url ?? "",
        apiKey: tautulliService.config.apiKey,
      },
      user.plexUserId,
      user.email,
      year
    )

    if (!tautulliStats.success || !tautulliStats.data) {
      return NextResponse.json(
        createSafeError(ErrorCode.INTERNAL_ERROR, tautulliStats.error || "Failed to fetch Tautulli statistics"),
        { status: getStatusCode(ErrorCode.INTERNAL_ERROR) }
      )
    }

    const tautulliStatsData = tautulliStats.data

    // Fetch server statistics
    const plexService = await getActivePlexService()

    let serverStats
    if (plexService && tautulliService) {
      const serverStatsResult = await fetchPlexServerStatistics(
        {
          url: plexService.url ?? "",
          token: plexService.config.token,
        },
        {
          url: tautulliService.url ?? "",
          apiKey: tautulliService.config.apiKey,
        }
      )

      if (serverStatsResult.success && serverStatsResult.data) {
        serverStats = {
          serverName: plexService.name,
          totalStorage: serverStatsResult.data.totalStorage,
          totalStorageFormatted: serverStatsResult.data.totalStorageFormatted,
          librarySize: serverStatsResult.data.librarySize,
        }
      }
    }

    // Fetch Overseerr statistics (optional)
    let overseerrStats
    const overseerrService = await getActiveOverseerrService()

    if (overseerrService) {
      const overseerrData = await fetchOverseerrStatistics(
        {
          url: overseerrService.url ?? "",
          apiKey: overseerrService.config.apiKey,
        },
        user.email,
        year
      )
      if (overseerrData.success && overseerrData.data) {
        overseerrStats = overseerrData.data
      }
    }

    // Fetch leaderboard data
    let leaderboards
    if (tautulliService && tautulliStatsData.tautulliUserId) {
      const [topContentLeaderboards, watchTimeLeaderboard] = await Promise.all([
        fetchTopContentLeaderboards(
          {
            url: tautulliService.url ?? "",
            apiKey: tautulliService.config.apiKey,
          },
          tautulliStatsData.topMovies,
          tautulliStatsData.topShows,
          tautulliStatsData.tautulliUserId,
          year
        ),
        fetchWatchTimeLeaderboard(
          {
            url: tautulliService.url ?? "",
            apiKey: tautulliService.config.apiKey,
          },
          year
        ),
      ])

      if (topContentLeaderboards.success && topContentLeaderboards.data && watchTimeLeaderboard.success && watchTimeLeaderboard.data) {
        const userIndex = watchTimeLeaderboard.data.findIndex(
          (entry) => entry.userId === tautulliStatsData.tautulliUserId
        )
        leaderboards = {
          topContent: topContentLeaderboards.data,
          watchTime: {
            leaderboard: watchTimeLeaderboard.data,
            userPosition: userIndex >= 0 ? userIndex + 1 : undefined,
            totalUsers: watchTimeLeaderboard.data.length,
          },
        }
      }
    }

    // Build statistics object
    const statistics: WrappedStatistics = {
      totalWatchTime: {
        total: tautulliStatsData.totalWatchTime,
        movies: tautulliStatsData.moviesWatchTime,
        shows: tautulliStatsData.showsWatchTime,
      },
      moviesWatched: tautulliStatsData.moviesWatched,
      showsWatched: tautulliStatsData.showsWatched,
      episodesWatched: tautulliStatsData.episodesWatched,
      topMovies: tautulliStatsData.topMovies,
      topShows: tautulliStatsData.topShows,
      watchTimeByMonth: tautulliStatsData.watchTimeByMonth,
      ...(serverStats && { serverStats }),
      ...(overseerrStats && { overseerrStats }),
      ...(leaderboards && { leaderboards }),
    }

    return NextResponse.json({ statistics })
  } catch (error) {
    logError("ADMIN_PLAYGROUND_STATISTICS_API", error)
    return NextResponse.json(
      createSafeError(ErrorCode.INTERNAL_ERROR, "Failed to fetch statistics"),
      { status: getStatusCode(ErrorCode.INTERNAL_ERROR) }
    )
  }
}

