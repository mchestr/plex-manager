"use server"

// Note: Server action timeout is platform-dependent (Vercel Hobby: 10s, Pro: 60s+)
// The fetch timeout in lib/wrapped/api-calls.ts is set to 5 minutes by default
// and can be configured via LLM_REQUEST_TIMEOUT_MS environment variable

import { getWrappedSettings } from "@/actions/admin"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getActivePlexService, getActiveTautulliService, getActiveOverseerrService } from "@/lib/services/service-helpers"
import { userIdSchema, yearSchema } from "@/lib/validations/shared-schemas"
import { z } from "zod"
import { generateWrappedWithLLM } from "@/lib/wrapped/llm"
import {
  fetchOverseerrStatistics,
  fetchPlexServerStatistics,
  fetchTautulliStatistics,
  fetchTopContentLeaderboards,
  fetchWatchTimeLeaderboard,
} from "@/lib/wrapped/statistics"
import { WrappedStatistics } from "@/types/wrapped"
import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"

// Schema for generatePlexWrapped parameters
const generatePlexWrappedParamsSchema = z.object({
  userId: userIdSchema,
  year: yearSchema,
})

/**
 * Generate Plex Wrapped for a specific user
 * - Users can generate their own wrapped if it doesn't exist (initial generation)
 * - Only admins can regenerate existing wrapped or generate for other users
 */
export async function generatePlexWrapped(
  userId: string,
  year: number = new Date().getFullYear()
): Promise<{ success: boolean; error?: string; wrappedId?: string }> {
  // Validate input parameters
  const validated = generatePlexWrappedParamsSchema.safeParse({ userId, year })
  if (!validated.success) {
    const firstError = validated.error.issues?.[0]?.message
    return {
      success: false,
      error: firstError || "Invalid parameters",
    }
  }

  const { userId: validUserId, year: validYear } = validated.data

  try {
    // Check if wrapped feature is enabled
    const wrappedSettings = await getWrappedSettings()
    if (!wrappedSettings.wrappedEnabled) {
      return { success: false, error: "Wrapped generation is currently disabled" }
    }

    // Get current session
    const session = await getServerSession(authOptions)
    if (!session) {
      return { success: false, error: "Unauthorized" }
    }

    const currentUserId = session.user.id
    const isAdmin = session.user.isAdmin

    // Validate that session has a valid user ID
    if (!currentUserId || currentUserId.trim() === "") {
      return { success: false, error: "Unauthorized: Invalid session" }
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: validUserId },
    })

    if (!user) {
      return { success: false, error: "User not found" }
    }

    // Check if wrapped already exists for this year
    const existingWrapped = await prisma.plexWrapped.findUnique({
      where: {
        userId_year: {
          userId: validUserId,
          year: validYear,
        },
      },
    })

    // Security check:
    // - Users can generate their own wrapped if it doesn't exist (initial generation)
    // - Users can retry their own wrapped if it failed (status === "failed")
    // - Only admins can regenerate completed wrapped or generate for other users
    // Normalize IDs for comparison (trim whitespace and ensure they're strings)
    const normalizedCurrentUserId = String(currentUserId).trim()
    const normalizedUserId = String(validUserId).trim()
    const isOwnWrapped = normalizedCurrentUserId === normalizedUserId

    if (existingWrapped) {
      if (existingWrapped.status === "completed") {
        // Completed wrapped exists - this is a regeneration, require admin
        if (!isAdmin) {
          return { success: false, error: "Only admins can regenerate wrapped data" }
        }
      } else if (existingWrapped.status === "failed") {
        // Failed wrapped - allow user to retry their own, or admin for any user
        if (!isOwnWrapped && !isAdmin) {
          return { success: false, error: "Unauthorized: You can only retry your own wrapped" }
        }
      } else {
        // Generating status - allow user to retry their own, or admin for any user
        if (!isOwnWrapped && !isAdmin) {
          return { success: false, error: "Unauthorized: You can only generate your own wrapped" }
        }
      }
    } else {
      // Wrapped doesn't exist - allow if user is generating their own, or if admin
      if (!isOwnWrapped && !isAdmin) {
        return { success: false, error: "Unauthorized: You can only generate your own wrapped" }
      }
    }

    // Get Plex service config
    const plexService = await getActivePlexService()

    if (!plexService) {
      return { success: false, error: "No active Plex server configured" }
    }

    // Generate share token upfront so it's always available (only if doesn't exist)
    const { generateShareToken } = await import("@/lib/utils")
    const shareToken = existingWrapped?.shareToken || generateShareToken()

    // Create or update wrapped record with "generating" status
    const wrapped = await prisma.plexWrapped.upsert({
      where: {
        userId_year: {
          userId: validUserId,
          year: validYear,
        },
      },
      create: {
        userId: validUserId,
        year: validYear,
        status: "generating",
        data: JSON.stringify({}), // Empty data for now
        shareToken, // Generate share token immediately
      },
      update: {
        status: "generating",
        error: null,
        // Only set shareToken if it doesn't exist (preserve existing shares)
        ...(existingWrapped?.shareToken ? {} : { shareToken }),
      },
    })

    const startTime = Date.now()

    try {
      // 1. Fetch statistics from Tautulli
      const tautulliService = await getActiveTautulliService()

      if (!tautulliService) {
        throw new Error("No active Tautulli server configured")
      }

      if (!user.plexUserId) {
        throw new Error("User does not have a Plex user ID")
      }

      const tautulliStats = await fetchTautulliStatistics(
        {
          url: tautulliService.url ?? "",
          apiKey: tautulliService.config.apiKey,
        },
        user.plexUserId || "",
        user.email,
        validYear
      )

      if (!tautulliStats.success || !tautulliStats.data) {
        throw new Error(tautulliStats.error || "Failed to fetch Tautulli statistics")
      }

      // Extract data for type narrowing
      const tautulliStatsData = tautulliStats.data

      // 2. Fetch server statistics on the fly from Plex API
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

      // 3. Fetch Overseerr statistics (optional)
      const overseerrService = await getActiveOverseerrService()

      let overseerrStats
      if (overseerrService) {
        const overseerrData = await fetchOverseerrStatistics(
          {
            url: overseerrService.url ?? "",
            apiKey: overseerrService.config.apiKey,
          },
          user.email,
          validYear
        )
        if (overseerrData.success && overseerrData.data) {
          overseerrStats = overseerrData.data
        }
      }

      // 4. Fetch leaderboard data
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
            validYear
          ),
          fetchWatchTimeLeaderboard(
            {
              url: tautulliService.url ?? "",
              apiKey: tautulliService.config.apiKey,
            },
            validYear
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

      // 5. Build statistics object
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

      // 5. Generate wrapped content using LLM
      const llmResult = await generateWrappedWithLLM(
        user.name || user.email || "User",
        validYear,
        user.id,
        wrapped.id,
        statistics
      )

      if (!llmResult.success || !llmResult.data) {
        throw new Error(llmResult.error || "Failed to generate wrapped content with LLM")
      }

      const wrappedData = llmResult.data
      const generationTime = Math.floor((Date.now() - startTime) / 1000)
      wrappedData.metadata.generationTime = generationTime

      // 6. Generate share token if not exists
      let shareToken = wrapped.shareToken
      if (!shareToken) {
        // Generate a secure random token
        const { generateShareToken } = await import("@/lib/utils")
        shareToken = generateShareToken()
      }

      // 7. Update wrapped with completed status, share token, and summary
      await prisma.plexWrapped.update({
        where: { id: wrapped.id },
        data: {
          status: "completed",
          data: JSON.stringify(wrappedData),
          shareToken,
          summary: wrappedData.summary || null,
          generatedAt: new Date(),
        },
      })
    } catch (error) {
      // Update wrapped status to failed
      await prisma.plexWrapped.update({
        where: { id: wrapped.id },
        data: {
          status: "failed",
          error: error instanceof Error ? error.message : "Failed to generate wrapped",
        },
      })
      throw error
    }

    // Revalidate all relevant paths
    revalidatePath("/admin")
    revalidatePath("/admin/users")
    revalidatePath(`/admin/users/${validUserId}/wrapped`)
    revalidatePath("/wrapped")
    revalidatePath("/")
    return { success: true, wrappedId: wrapped.id }
  } catch (error) {
    const logger = (await import("@/lib/utils/logger")).createLogger("USERS_ACTION")
    logger.error("Error generating wrapped", error)

    // Update wrapped status to failed if it exists
    try {
      const wrapped = await prisma.plexWrapped.findUnique({
        where: {
          userId_year: {
            userId: validUserId,
            year: validYear,
          },
        },
      })

      if (wrapped) {
        await prisma.plexWrapped.update({
          where: { id: wrapped.id },
          data: {
            status: "failed",
            error: error instanceof Error ? error.message : "Failed to generate wrapped",
          },
        })
      }
    } catch (updateError) {
      const logger = (await import("@/lib/utils/logger")).createLogger("USERS_ACTION")
      logger.error("Error updating wrapped status", updateError)
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate wrapped",
    }
  }
}

/**
 * Generate Plex Wrapped for all users
 * Admin-only function
 */
export async function generateAllPlexWrapped(
  year: number = new Date().getFullYear()
): Promise<{
  success: boolean
  generated: number
  failed: number
  errors: string[]
}> {
  // Validate year parameter
  const validatedYear = yearSchema.safeParse(year)
  if (!validatedYear.success) {
    return {
      success: false,
      generated: 0,
      failed: 0,
      errors: [validatedYear.error.issues[0]?.message || "Invalid year parameter"],
    }
  }

  const validYear = validatedYear.data

  try {
    // Require admin for bulk generation
    const session = await getServerSession(authOptions)
    if (!session || !session.user.isAdmin) {
      return {
        success: false,
        generated: 0,
        failed: 0,
        errors: ["Unauthorized: Only admins can generate wrapped for all users"],
      }
    }
    const users = await prisma.user.findMany({
      where: {
        plexUserId: { not: null }, // Only users with Plex accounts
      },
    })

    let generated = 0
    let failed = 0
    const errors: string[] = []

    for (const user of users) {
      const result = await generatePlexWrapped(user.id, validYear)
      if (result.success) {
        generated++
      } else {
        failed++
        errors.push(`${user.name || user.email || user.id}: ${result.error || "Unknown error"}`)
      }
    }

    revalidatePath("/admin")
    return {
      success: true,
      generated,
      failed,
      errors,
    }
  } catch (error) {
    const logger = (await import("@/lib/utils/logger")).createLogger("USERS_ACTION")
    logger.error("Error generating all wrapped", error)
    return {
      success: false,
      generated: 0,
      failed: 0,
      errors: [error instanceof Error ? error.message : "Failed to generate wrapped for all users"],
    }
  }
}

