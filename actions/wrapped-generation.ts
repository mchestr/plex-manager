"use server"

// Note: Server action timeout is platform-dependent (Vercel Hobby: 10s, Pro: 60s+)
// The fetch timeout in lib/wrapped/api-calls.ts is set to 5 minutes by default
// and can be configured via LLM_REQUEST_TIMEOUT_MS environment variable

import { getWrappedSettings } from "@/actions/admin"
import { getAccessGateStatus } from "@/lib/access"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { consume, reward, type ConsumeResult } from "@/lib/security/rate-limit"
import { createLogger } from "@/lib/utils/logger"
import { userIdSchema, yearSchema } from "@/lib/validations/shared-schemas"
import { z } from "zod"
import { claimGeneration, isLiveClaim, writeIfClaimed } from "@/lib/wrapped/generation-claim"
import { generateWrappedWithLLM } from "@/lib/wrapped/llm"
import { memberName } from "@/lib/wrapped/member-name"
import {
  fetchOverseerrStatistics,
  fetchPlexServerStatistics,
  fetchTautulliStatistics,
  fetchTopContentLeaderboards,
  fetchWatchTimeLeaderboard,
} from "@/lib/wrapped/statistics"
import { computePercentile } from "@/lib/wrapped/derived-statistics"
import {
  adminErrorHint,
  type GenerationRefusalCode,
  isGenerationRefusal,
  memberErrorCopy,
  refusalCopy,
  type RewindErrorCode,
  toStoredError,
} from "@/lib/wrapped/generation-errors"
import { WrappedStatistics } from "@/types/wrapped"
import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"

const logger = createLogger("USERS_ACTION")

export interface GeneratePlexWrappedResult {
  success: boolean
  error?: string
  code?: RewindErrorCode | GenerationRefusalCode
  /** For `RATE_LIMITED`: the seconds until the member may run again. */
  retryAfterSec?: number
  wrappedId?: string
}

function refused(code: GenerationRefusalCode, retryAfterSec?: number): GeneratePlexWrappedResult {
  return {
    success: false,
    code,
    error: refusalCopy(code, retryAfterSec),
    ...(retryAfterSec === undefined ? {} : { retryAfterSec }),
  }
}

/**
 * Spends one point of each member generation limit: 1 run per 10 minutes and
 * 3 per day (design 9.3, 9.4). A refused daily point refunds the burst point.
 */
async function consumeGenerationPoints(userId: string): Promise<ConsumeResult> {
  const burst = await consume("rw:gen:burst", userId)
  if (!burst.ok) {
    return burst
  }
  const daily = await consume("rw:gen:daily", userId)
  if (!daily.ok) {
    await reward("rw:gen:burst", userId)
  }
  return daily
}

async function refundGenerationPoints(userId: string): Promise<void> {
  await reward("rw:gen:burst", userId)
  await reward("rw:gen:daily", userId)
}

/**
 * Generate the Rewind for one member and the season year.
 *
 * ## Guardrails (SEC-22, RWP-12), in order
 *
 * 1. A session, then `getWrappedSettings()`: generation is enabled, and
 *    `wrappedYear` is the season year.
 * 2. Zod: `year` must be exactly the season year.
 * 3. The member exists, and a non-admin acts only on their own row.
 * 4. Entitlement through `getAccessGateStatus` (a no-op while Stripe is off;
 *    admins are entitled): `NOT_ENTITLED`.
 * 5. Only admins regenerate a completed Rewind, and a live run already making
 *    this Rewind returns `ALREADY_GENERATING` before any limit is spent.
 * 6. Non-admins spend a point of `rw:gen:burst` (1 per 10 minutes) and
 *    `rw:gen:daily` (3 per day): `RATE_LIMITED` with `retryAfterSec`.
 * 7. The single-flight claim (`lib/wrapped/generation-claim.ts`). Losing it
 *    returns `ALREADY_GENERATING` and refunds the points.
 *
 * The run's outcome is written only while it holds the claim, so a run that
 * was taken over after 15 minutes cannot overwrite the newer one.
 */
export async function generatePlexWrapped(userId: string, year: number): Promise<GeneratePlexWrappedResult> {
  try {
    // Check 1: session, then the season settings
    const session = await getServerSession(authOptions)
    if (!session) {
      return { success: false, error: "Unauthorized" }
    }

    const currentUserId = session.user.id?.trim()
    const isAdmin = session.user.isAdmin
    if (!currentUserId) {
      return { success: false, error: "Unauthorized: Invalid session" }
    }

    const { wrappedEnabled, wrappedYear } = await getWrappedSettings()
    if (!wrappedEnabled) {
      return { success: false, error: "Wrapped generation is currently disabled" }
    }

    // Check 2: input, with the year bound to the season
    const validated = z
      .object({
        userId: userIdSchema,
        year: z.literal(wrappedYear, { error: `Rewind is only available for ${wrappedYear}` }),
      })
      .safeParse({ userId, year })
    if (!validated.success) {
      return { success: false, error: validated.error.issues[0]?.message ?? "Invalid parameters" }
    }

    const { userId: validUserId, year: validYear } = validated.data

    // Check 3: the member exists; non-admins act only on their own row
    const user = await prisma.user.findUnique({
      where: { id: validUserId },
    })

    if (!user) {
      return { success: false, error: "User not found" }
    }

    if (!isAdmin && currentUserId !== validUserId) {
      return { success: false, error: "Unauthorized: You can only generate your own wrapped" }
    }

    // Check 4: entitlement (always true while Stripe is off, and for admins)
    if (!(await getAccessGateStatus(currentUserId))) {
      return refused("NOT_ENTITLED")
    }

    // Check 5: only admins regenerate a completed Rewind; a live run is not doubled
    const existingWrapped = await prisma.plexWrapped.findUnique({
      where: { userId_year: { userId: validUserId, year: validYear } },
      select: { status: true, updatedAt: true },
    })

    if (existingWrapped?.status === "completed" && !isAdmin) {
      return { success: false, error: "Only admins can regenerate wrapped data" }
    }

    if (existingWrapped && isLiveClaim(existingWrapped, new Date())) {
      return refused("ALREADY_GENERATING")
    }

    // Get Plex server config
    const plexServer = await prisma.plexServer.findFirst({
      where: { isActive: true },
    })

    if (!plexServer) {
      return { success: false, error: "No active Plex server configured" }
    }

    // Check 6: member limits; admins are exempt
    if (!isAdmin) {
      const limit = await consumeGenerationPoints(validUserId)
      if (!limit.ok) {
        return refused("RATE_LIMITED", limit.retryAfterSec)
      }
    }

    // Check 7: one run at a time. Generation never touches shareToken: sharing is
    // opt-in through enableWrappedShareLink, and a regeneration keeps a link
    // the member already turned on (SEC-16).
    const claim = await claimGeneration(validUserId, validYear, { regenerate: isAdmin })
    if (!claim) {
      if (!isAdmin) {
        await refundGenerationPoints(validUserId)
      }
      return refused("ALREADY_GENERATING")
    }

    const startTime = Date.now()

    try {
      // 1. Fetch statistics from Tautulli
      const tautulli = await prisma.tautulli.findFirst({
        where: { isActive: true },
      })

      if (!tautulli) {
        throw new Error("No active Tautulli server configured")
      }

      if (!user.plexUserId) {
        throw new Error("User does not have a Plex user ID")
      }

      const tautulliStats = await fetchTautulliStatistics(
        {
          url: tautulli.url,
          apiKey: tautulli.apiKey,
        },
        { plexUserId: user.plexUserId },
        validYear
      )

      // A known cause is stored as a code, and the member gets fixed copy.
      if (tautulliStats.code) {
        await writeIfClaimed(claim, { status: "failed", error: toStoredError(tautulliStats.code) })
        return { success: false, code: tautulliStats.code, error: memberErrorCopy(tautulliStats.code) }
      }

      if (!tautulliStats.success || !tautulliStats.data) {
        throw new Error(tautulliStats.error || "Failed to fetch Tautulli statistics")
      }

      // Extract data for type narrowing
      const tautulliStatsData = tautulliStats.data

      // 2. Fetch server statistics on the fly from Plex API
      const plexServer = await prisma.plexServer.findFirst({
        where: { isActive: true },
      })

      let serverStats
      if (plexServer && tautulli) {
        const serverStatsResult = await fetchPlexServerStatistics(
          {
            url: plexServer.url,
            token: plexServer.token,
          },
          {
            url: tautulli.url,
            apiKey: tautulli.apiKey,
          }
        )

        if (serverStatsResult.success && serverStatsResult.data) {
          serverStats = {
            serverName: plexServer.name,
            totalStorage: serverStatsResult.data.totalStorage,
            totalStorageFormatted: serverStatsResult.data.totalStorageFormatted,
            librarySize: serverStatsResult.data.librarySize,
          }
        }
      }

      // 3. Fetch Overseerr statistics (optional)
      const overseerr = await prisma.overseerr.findFirst({
        where: { isActive: true },
      })

      let overseerrStats
      if (overseerr) {
        const overseerrData = await fetchOverseerrStatistics(
          {
            url: overseerr.url,
            apiKey: overseerr.apiKey,
          },
          { plexUserId: user.plexUserId, email: user.email },
          validYear
        )
        if (overseerrData.success && overseerrData.data) {
          overseerrStats = overseerrData.data
        }
      }

      // 4. Fetch leaderboard data
      let leaderboards
      if (tautulli && tautulliStatsData.tautulliUserId) {
        const [topContentLeaderboards, watchTimeLeaderboard] = await Promise.all([
          fetchTopContentLeaderboards(
            {
              url: tautulli.url,
              apiKey: tautulli.apiKey,
            },
            tautulliStatsData.topMovies,
            tautulliStatsData.topShows,
            tautulliStatsData.tautulliUserId,
            validYear
          ),
          fetchWatchTimeLeaderboard(
            {
              url: tautulli.url,
              apiKey: tautulli.apiKey,
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
        derived: tautulliStatsData.derived,
        ...(serverStats && { serverStats }),
        ...(overseerrStats && { overseerrStats }),
        ...(leaderboards && { leaderboards }),
        ...(leaderboards?.watchTime.userPosition && {
          percentile: computePercentile(
            leaderboards.watchTime.userPosition,
            leaderboards.watchTime.totalUsers
          ),
        }),
      }

      // 5. Generate wrapped content using LLM. The model only ever sees the
      // member's real name or "there", and the stored Rewind their name or
      // "Viewer", never their email. The leaderboards above reach the prompt
      // only; assembleWrappedData leaves them out of the stored statistics.
      const llmResult = await generateWrappedWithLLM({
        promptName: memberName(user) ?? "there",
        displayName: memberName(user) ?? "Viewer",
        year: validYear,
        userId: user.id,
        wrappedId: claim.wrappedId,
        statistics,
      })

      if (!llmResult.success || !llmResult.data) {
        throw new Error(llmResult.error || "Failed to generate wrapped content with LLM")
      }

      const wrappedData = llmResult.data
      const generationTime = Math.floor((Date.now() - startTime) / 1000)
      wrappedData.metadata.generationTime = generationTime

      // 6. Store the result, unless a newer run took the row over
      const stored = await writeIfClaimed(claim, {
        status: "completed",
        data: JSON.stringify(wrappedData),
        summary: wrappedData.summary || null,
        archetype: wrappedData.archetype?.name || null,
        generatedAt: new Date(),
      })
      if (!stored) {
        return refused("ALREADY_GENERATING")
      }
    } catch (error) {
      await writeIfClaimed(claim, {
        status: "failed",
        error: error instanceof Error ? error.message : "Failed to generate wrapped",
      })
      throw error
    }

    // Revalidate all relevant paths
    revalidatePath("/admin")
    revalidatePath("/admin/users")
    revalidatePath(`/admin/users/${validUserId}/wrapped`)
    revalidatePath("/wrapped")
    revalidatePath("/")
    return { success: true, wrappedId: claim.wrappedId }
  } catch (error) {
    // A failed run has already marked its own claimed row. Nothing else is
    // written here: without a claim, a write could overwrite another run.
    logger.error("Error generating wrapped", error)

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
        // A typed failure gets the admin hint (or the code), not the member copy.
        const hint =
          result.code && !isGenerationRefusal(result.code) ? adminErrorHint(result.code, user.plexUserId) : null
        const detail = hint ?? (result.code || result.error || "Unknown error")
        errors.push(`${user.name || user.id}: ${detail}`)
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

