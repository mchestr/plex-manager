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
import { userIdSchema } from "@/lib/validations/shared-schemas"
import { z } from "zod"
import {
  claimGeneration,
  type GenerationClaim,
  isLiveClaim,
  writeIfClaimed,
} from "@/lib/wrapped/generation-claim"
import { checkRewindEligibility } from "@/lib/wrapped/eligibility"
import { generateWrappedWithLLM } from "@/lib/wrapped/llm"
import { memberName } from "@/lib/wrapped/member-name"
import { fetchOverseerrStatistics } from "@/lib/wrapped/overseerr-statistics"
import { fetchPlexServerStatistics } from "@/lib/wrapped/server-statistics"
import {
  fetchTautulliStatistics,
  fetchTopContentLeaderboards,
  fetchWatchTimeLeaderboard,
} from "@/lib/wrapped/tautulli-statistics"
import { computePercentile } from "@/lib/wrapped/derived-statistics"
import {
  type GenerationRefusalCode,
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
 * Re-read after a refused limit: true when another run, such as one a second
 * tab started a moment earlier, holds the row or is claiming it (`pending` is
 * the row `claimGeneration` has just created). A member is then told the Rewind
 * is being made rather than to wait.
 */
async function runInFlight(userId: string, year: number): Promise<boolean> {
  const row = await prisma.plexWrapped.findUnique({
    where: { userId_year: { userId, year } },
    select: { status: true, updatedAt: true },
  })
  return row !== null && (row.status === "pending" || isLiveClaim(row, new Date()))
}

/**
 * Generate the Rewind for one member and the season year.
 *
 * ## Guardrails (SEC-22, RWP-12), in order
 *
 * 1. A session, then `getWrappedSettings()`: generation is enabled and,
 *    for members, the season window is open; `wrappedYear` is the season
 *    year.
 * 2. Zod: `year` must be exactly the season year.
 * 3. A non-admin acts only on their own row, checked before the member is
 *    read so another id gets the same answer whether or not it exists; then
 *    the member exists.
 * 4. Entitlement through `getAccessGateStatus` (a no-op while Stripe is off;
 *    admins are entitled): `NOT_ENTITLED`.
 * 5. Only admins regenerate a completed Rewind, and a live run already making
 *    this Rewind returns `ALREADY_GENERATING` before any limit is spent. A
 *    member with no Plex identity then gets `REWIND_NOT_ELIGIBLE` before the
 *    configuration is read, so a direct call on a Jellyfin-only server gets
 *    the same answer as the card. The configuration a run needs (Plex,
 *    Tautulli) is checked next, and then the Tautulli match
 *    (`lib/wrapped/eligibility.ts`): no match is `REWIND_NOT_ELIGIBLE` too
 *    (FR-48, RWP-08). A failure that a retry cannot fix costs nothing and
 *    writes no row.
 * 6. Non-admins spend a point of `rw:gen:burst` (1 per 10 minutes) and
 *    `rw:gen:daily` (3 per day): `RATE_LIMITED` with `retryAfterSec`, unless
 *    a run that started since check 5 now holds the row (`ALREADY_GENERATING`).
 * 7. The single-flight claim (`lib/wrapped/generation-claim.ts`). Losing it,
 *    or an error while claiming, refunds the points; losing it returns
 *    `ALREADY_GENERATING`.
 *
 * The run's outcome is written only while it holds the claim, so a run that
 * was taken over after 15 minutes cannot overwrite the newer one; such a run
 * returns `ALREADY_GENERATING`, whatever its own outcome.
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

    // Members generate only while the season is open; admins whenever the feature is on
    const { wrappedEnabled, featureEnabled, wrappedYear } = await getWrappedSettings()
    if (!wrappedEnabled && !(isAdmin && featureEnabled)) {
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

    // Check 3: non-admins act only on their own row; then the member exists
    if (!isAdmin && currentUserId !== validUserId) {
      return { success: false, error: "Unauthorized: You can only generate your own wrapped" }
    }

    const user = await prisma.user.findUnique({
      where: { id: validUserId },
    })

    if (!user) {
      return { success: false, error: "User not found" }
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

    // No Plex identity, so no Plex watch history: refuse before any lookup (FR-48).
    const { plexUserId } = user
    if (!plexUserId) {
      return refused("REWIND_NOT_ELIGIBLE")
    }

    // Get Plex server config
    const plexServer = await prisma.plexServer.findFirst({
      where: { isActive: true },
    })

    if (!plexServer) {
      return { success: false, error: "No active Plex server configured" }
    }

    const tautulli = await prisma.tautulli.findFirst({
      where: { isActive: true },
    })

    if (!tautulli) {
      return { success: false, error: "No active Tautulli server configured" }
    }

    // No Tautulli match, so no Plex watch history to read: refuse before any
    // row or point (FR-48). A fresh match is handed to the statistics fetch.
    const eligibility = await checkRewindEligibility({ id: user.id, plexUserId })
    if (!eligibility.eligible) {
      return refused("REWIND_NOT_ELIGIBLE")
    }

    // Check 6: member limits; admins are exempt
    if (!isAdmin) {
      const limit = await consumeGenerationPoints(validUserId)
      if (!limit.ok) {
        // A second tab that passed check 5 just before the first one claimed.
        if (await runInFlight(validUserId, validYear)) {
          return refused("ALREADY_GENERATING")
        }
        return refused("RATE_LIMITED", limit.retryAfterSec)
      }
    }

    // Check 7: one run at a time. Generation never touches shareToken: sharing is
    // opt-in through enableWrappedShareLink, and a regeneration keeps a link
    // the member already turned on (SEC-16).
    let claim: GenerationClaim | null = null
    try {
      claim = await claimGeneration(validUserId, validYear, { regenerate: isAdmin })
    } finally {
      // A lost claim or a failed claim query gives the member their points back.
      if (!claim && !isAdmin) {
        await refundGenerationPoints(validUserId)
      }
    }
    if (!claim) {
      return refused("ALREADY_GENERATING")
    }

    const startTime = Date.now()

    try {
      // 1. Fetch statistics from Tautulli
      const tautulliStats = await fetchTautulliStatistics(
        {
          url: tautulli.url,
          apiKey: tautulli.apiKey,
        },
        { plexUserId },
        validYear,
        eligibility.tautulliUser
      )

      // A known cause is stored as a code, and the member gets fixed copy.
      if (tautulliStats.code) {
        if (!(await writeIfClaimed(claim, { status: "failed", error: toStoredError(tautulliStats.code) }))) {
          return refused("ALREADY_GENERATING")
        }
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
      if (plexServer) {
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
          { plexUserId, email: user.email },
          validYear
        )
        if (overseerrData.success && overseerrData.data) {
          overseerrStats = overseerrData.data
        }
      }

      // 4. Fetch leaderboard data
      let leaderboards
      if (tautulliStatsData.tautulliUserId) {
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
      const recorded = await writeIfClaimed(claim, {
        status: "failed",
        error: error instanceof Error ? error.message : "Failed to generate wrapped",
      })
      if (!recorded) {
        // A newer run holds the row: this failure is not the member's outcome.
        logger.error("Rewind run failed after losing its claim", error)
        return refused("ALREADY_GENERATING")
      }
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
