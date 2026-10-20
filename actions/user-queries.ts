"use server"

import { z } from "zod"

import { memberAction } from "@/lib/actions/define-action"
import { type ActionErrorCode, type ActionResult, fail, ok, toActionError } from "@/lib/actions/result"
import { requireAdmin } from "@/lib/admin"
import { checkUserServerAccess, getPlexServerIdentity, getPlexUsers, unshareUserFromPlexServer } from "@/lib/connections/plex"
import { type PlexUnshareErrorCode } from "@/lib/connections/plex-invitations"
import { prisma } from "@/lib/prisma"
import { endUserSessions } from "@/lib/session-revocation"
import { SubscriptionStatus } from "@/lib/generated/prisma/client"
import { aggregateLlmUsage } from "@/lib/utils"
import { createLogger } from "@/lib/utils/logger"
import { parseStoredRewind } from "@/lib/wrapped/data/parse-stored"
import { readStoredError, toStoredError } from "@/lib/wrapped/generation-errors"
import { userIdSchema, yearSchema } from "@/lib/validations/shared-schemas"
import {
  AdminUserWithWrappedStats,
  DiscordCommandActivity,
  MediaMarkActivity,
  UserActivityItem,
  UserActivityTimelineData,
  UserDetails,
  WrappedSummary
} from "@/types/admin"

const logger = createLogger("USER_QUERIES")

// --- Exported Actions ---

/**
 * Get user's Plex Wrapped.
 *
 * A non-admin caller gets `error` normalised to a stored code
 * (`{"code":"..."}`), so legacy free text, such as a pre-P0.9 row listing
 * Tautulli's users, never reaches a member's browser. Admins get the stored
 * text as is.
 *
 * `data` never carries `statistics.leaderboards`: rows written before P0.8
 * hold every member's name and yearly watch minutes there until P0.20's
 * clean-up runs, and no viewer reads them.
 *
 * A member may read only their own row (`FORBIDDEN` otherwise); admins may
 * read any. `data` is null when there is no row for the year.
 *
 * @param input - `{ userId, year }`
 */
export const getUserPlexWrapped = memberAction({
  input: z.object({ userId: userIdSchema, year: yearSchema }),
  fallbackError: "Failed to load the Rewind",
  handler: async ({ userId, year }, { session }) => {
    // This action is a public endpoint, so the ownership check must live here:
    // nothing gates direct Server Action calls.
    if (session.user.id !== userId && !session.user.isAdmin) {
      logger.warn("Unauthorized attempt to read another user's wrapped", {
        requesterId: session.user.id,
        targetUserId: userId,
      })
      return fail("FORBIDDEN", "You can only open your own Rewind.")
    }

    const wrapped = await prisma.plexWrapped.findUnique({
      where: {
        userId_year: {
          userId,
          year,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    })

    if (!wrapped) {
      return ok(null)
    }
    const visible = { ...wrapped, data: withoutLeaderboards(wrapped.data) }
    if (!visible.error || session.user.isAdmin) {
      return ok(visible)
    }
    return ok({ ...visible, error: toStoredError(readStoredError(visible.error)) })
  },
})

/**
 * Get detailed user information including all wrapped, shares, visits, and LLM usage
 */
export async function getUserDetails(userId: string): Promise<UserDetails | null> {
  // Admin-only: returns another user's full PII. Placed before the try so the
  // thrown auth error propagates to the error boundary instead of being
  // swallowed into a null return by the catch below.
  await requireAdmin()

  try {
    // Get active Plex server for access checking
    const plexServer = await prisma.plexServer.findFirst({
      where: { isActive: true },
    })

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        plexWrapped: {
          orderBy: { year: "desc" },
          include: {
            _count: {
              select: {
                shareVisits: true,
              },
            },
          },
        },
        llmUsage: true,
        discordConnection: true,
      },
    })

    if (!user) {
      return null
    }

    // Check Plex access
    let hasPlexAccess: boolean | null = null
    if (user.plexUserId && plexServer) {
      const accessResult = await checkUserServerAccess(
        {
          url: plexServer.url,
          token: plexServer.token,
          adminPlexUserId: plexServer.adminPlexUserId,
        },
        user.plexUserId
      )
      hasPlexAccess = accessResult.success ? accessResult.hasAccess : null
    }

    // Calculate share and visit stats
    let totalShares = 0
    let totalVisits = 0
    const wrapped: WrappedSummary[] = user.plexWrapped.map((w) => {
      if (w.shareToken) {
        totalShares += 1
      }
      totalVisits += w._count.shareVisits
      return {
        id: w.id,
        year: w.year,
        status: w.status,
        generatedAt: w.generatedAt,
        createdAt: w.createdAt,
        shareToken: w.shareToken,
        shareVisits: w._count.shareVisits,
      }
    })

    // Aggregate LLM usage
    const llmUsage = aggregateLlmUsage(user.llmUsage || [])

    const discordConnection = user.discordConnection
      ? {
          discordUserId: user.discordConnection.discordUserId,
          username: user.discordConnection.username,
          discriminator: user.discordConnection.discriminator,
          globalName: user.discordConnection.globalName,
          avatar: user.discordConnection.avatar,
          metadataSyncedAt: user.discordConnection.metadataSyncedAt,
          linkedAt: user.discordConnection.linkedAt,
          revokedAt: user.discordConnection.revokedAt,
          lastError: user.discordConnection.lastError,
        }
      : null

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      plexUserId: user.plexUserId,
      isAdmin: user.isAdmin,
      disabledAt: user.disabledAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      hasPlexAccess,
      wrapped,
      totalShares,
      totalVisits,
      llmUsage,
      discordConnection,
    }
  } catch (error) {
    logger.error("Error getting user details", error)
    return null
  }
}

/**
 * Get all users with their wrapped status for `year` (the caller passes the
 * season year; there is no calendar default).
 */
export async function getAllUsersWithWrapped(year: number): Promise<AdminUserWithWrappedStats[]> {
  // Admin-only: enumerates every user's PII. Placed before the try so the auth
  // error propagates rather than being swallowed into an empty array.
  await requireAdmin()

  try {
    // 1. Fetch users and their wrapped data
    const users = await fetchUsersWithWrappedData(year)

    // 2. Build Plex access map
    const accessMap = await buildPlexAccessMap(users)

    // 3. Fetch share statistics for all users
    const shareStatsMap = await fetchShareStatsMap(users.map(u => u.id))

    // 4. Batch-load subscriptions for all users (single query; no N+1)
    const subscriptionMap = await fetchSubscriptionMap(users.map(u => u.id))

    // 5. Map users to DTO
    return users.map((user) => {
      const wrapped = user.plexWrapped[0]
      const currentYearLlmUsageRecords = wrapped?.llmUsage || []

      // Aggregate all LLM usage records for current year's wrapped (includes regenerations)
      const currentYearUsage = aggregateLlmUsage(currentYearLlmUsageRecords)

      // Aggregate ALL LLM usage records for this user (across all years and regenerations)
      const totalUsage = aggregateLlmUsage(user.llmUsage || [])

      const hasPlexAccess = accessMap.get(user.id) ?? null
      const shareStatsForUser = shareStatsMap.get(user.id) || { totalShares: 0, totalVisits: 0 }
      const subscription = subscriptionMap.get(user.id) ?? null

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        plexUserId: user.plexUserId,
        isAdmin: user.isAdmin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        wrappedStatus: wrapped?.status || null,
        wrappedGeneratedAt: wrapped?.generatedAt || null,
        totalWrappedCount: user._count.plexWrapped,
        totalShares: shareStatsForUser.totalShares,
        totalVisits: shareStatsForUser.totalVisits,
        hasPlexAccess,
        llmUsage: currentYearUsage, // Current year's usage
        totalLlmUsage: totalUsage, // Total usage across all years
        subscriptionStatus: subscription?.status ?? null,
        currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
        isExempt: user.isExempt,
        exemptReason: user.exemptReason,
        stripeCustomerId: subscription?.stripeCustomerId ?? null,
      }
    })
  } catch (error) {
    logger.error("Error getting all users", error)
    return []
  }
}

/** Admin copy for each unshare failure; Plex's own text is never shown. */
const UNSHARE_ERROR_COPY: Record<PlexUnshareErrorCode, string> = {
  PLEX_AUTH: "Plex rejected Plex Manager's token. Reconnect Plex in settings.",
  PLEX_UNAVAILABLE: "Plex didn't respond. Try again in a few minutes.",
}

/**
 * Removes a user's share of the configured Plex server (admin only), leaving
 * their plex.tv friendship and the owner's other servers alone. A share that
 * is already gone succeeds as `already_removed`. Either success also ends the
 * user's sessions (SEC-10).
 */
export async function unshareUserLibrary(
  userId: string
): Promise<ActionResult<{ status: "removed" | "already_removed" }, ActionErrorCode | PlexUnshareErrorCode>> {
  const session = await requireAdmin()

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        plexUserId: true,
        isAdmin: true,
      },
    })

    if (!user) {
      return fail("NOT_FOUND", "User not found")
    }

    if (user.isAdmin) {
      return fail("FORBIDDEN", "Cannot unshare library access for admin users")
    }

    if (!user.plexUserId) {
      return fail("VALIDATION", "User Plex ID is required to unshare library access")
    }

    const plexServer = await prisma.plexServer.findFirst({
      where: { isActive: true },
    })

    if (!plexServer) {
      return fail("NOT_FOUND", "No active Plex server configured")
    }

    const result = await unshareUserFromPlexServer(
      {
        url: plexServer.url,
        token: plexServer.token,
      },
      user.plexUserId
    )

    if (!result.success) {
      logger.warn("Failed to unshare user library", { userId: user.id, code: result.code })
      return { success: false, code: result.code, error: UNSHARE_ERROR_COPY[result.code] }
    }

    await endUserSessions(user.id, "unshared", session.user.id)

    logger.info("Unshared user library", { userId: user.id, status: result.status })

    return ok({ status: result.status })
  } catch (error) {
    return toActionError(error, "Failed to unshare user library")
  }
}

// --- Internal Helpers ---
// NOT exported: every export in a "use server" module is a directly-invocable
// endpoint. These return user PII and are only consumed by getAllUsersWithWrapped
// (which is admin-gated), so they must not be independently callable.

/**
 * A stored `PlexWrapped.data` string without `statistics.leaderboards`: v1
 * and v2 rows are re-serialised from the parser, which drops them. Other rows
 * hold no leaderboards and pass through.
 */
function withoutLeaderboards(data: string): string {
  const stored = parseStoredRewind(data)
  return stored.version === 1 || stored.version === 2 ? JSON.stringify(stored.legacy) : data
}

async function fetchUsersWithWrappedData(year: number) {
  // Uses `include` (not `select`), so every scalar User column — including
  // `isExempt` and `exemptReason` used by the subscription column — is returned
  // by default alongside the related wrapped/llmUsage records below.
  return prisma.user.findMany({
    orderBy: [
      { isAdmin: "desc" },
      { name: "asc" },
    ],
    include: {
      plexWrapped: {
        where: {
          year: year,
        },
        take: 1,
        include: {
          llmUsage: true,
        },
      },
      llmUsage: true, // Include ALL LLM usage records for this user
      _count: {
        select: {
          plexWrapped: true,
        },
      },
    },
  })
}

async function buildPlexAccessMap(users: { id: string; plexUserId: string | null }[]): Promise<Map<string, boolean | null>> {
  const accessMap = new Map<string, boolean | null>()

  const plexServer = await prisma.plexServer.findFirst({
    where: { isActive: true },
  })

  if (!plexServer) {
    users.forEach(user => accessMap.set(user.id, null))
    return accessMap
  }

  try {
    // Get the server's machine identifier once
    const identityResult = await getPlexServerIdentity({
      url: plexServer.url,
      token: plexServer.token,
    })

    if (identityResult.success && identityResult.machineIdentifier) {
      // Fetch all users from Plex.tv API once
      const usersResult = await getPlexUsers(plexServer.token)

      if (usersResult.success && usersResult.data) {
        // Create a map of users by ID for efficient lookup
        const plexUserMap = new Map<string, { id: string; username: string; servers: Array<{ machineIdentifier: string }> }>()
        for (const plexUser of usersResult.data) {
          plexUserMap.set(plexUser.id, plexUser)
        }

        const machineIdentifier = identityResult.machineIdentifier
        const adminPlexUserId = plexServer.adminPlexUserId

        // Ensure admin user has their server in their servers list
        if (adminPlexUserId && machineIdentifier) {
          const normalizedAdminId = String(adminPlexUserId).trim()
          const adminUser = plexUserMap.get(normalizedAdminId)
          if (adminUser) {
            const hasServer = adminUser.servers.some((server) => server.machineIdentifier === machineIdentifier)
            if (!hasServer) {
              adminUser.servers.push({ machineIdentifier })
            }
          }
        }

        // Check access for each user using the fetched data
        for (const user of users) {
          if (!user.plexUserId) {
            accessMap.set(user.id, null)
            continue
          }

          const normalizedPlexUserId = String(user.plexUserId).trim()

          // Check if user is admin
          if (adminPlexUserId && normalizedPlexUserId === String(adminPlexUserId).trim()) {
            accessMap.set(user.id, true)
            continue
          }

          // Check if user exists in the map
          const plexUser = plexUserMap.get(normalizedPlexUserId)
          if (!plexUser) {
            accessMap.set(user.id, false)
            continue
          }

          // Check if user has access to the server by machine identifier
          const hasAccess = plexUser.servers.some((server) => server.machineIdentifier === machineIdentifier)
          accessMap.set(user.id, hasAccess)
        }
      } else {
        users.forEach(user => accessMap.set(user.id, null))
      }
    } else {
      users.forEach(user => accessMap.set(user.id, null))
    }
  } catch (error) {
    logger.error("Error checking Plex access for users", error)
    users.forEach(user => accessMap.set(user.id, null))
  }

  return accessMap
}

async function fetchShareStatsMap(userIds: string[]): Promise<Map<string, { totalShares: number; totalVisits: number }>> {
  const shareStats = await prisma.plexWrapped.findMany({
    where: {
      userId: {
        in: userIds,
      },
    },
    select: {
      userId: true,
      shareToken: true,
      _count: {
        select: {
          shareVisits: true,
        },
      },
    },
  })

  const shareStatsMap = new Map<string, { totalShares: number; totalVisits: number }>()
  for (const stat of shareStats) {
    const existing = shareStatsMap.get(stat.userId) || { totalShares: 0, totalVisits: 0 }
    if (stat.shareToken) {
      existing.totalShares += 1
    }
    existing.totalVisits += stat._count.shareVisits
    shareStatsMap.set(stat.userId, existing)
  }

  return shareStatsMap
}

/**
 * Batch-load subscriptions for the given users, keyed by user id.
 *
 * Mirrors the {@link fetchShareStatsMap} pattern: a single `findMany` with a
 * `userId in (...)` filter avoids per-user (N+1) queries. Each user has at most
 * one subscription (`Subscription.userId` is unique), so the map holds one row
 * per user. Users without a subscription are simply absent from the map.
 */
async function fetchSubscriptionMap(userIds: string[]): Promise<Map<string, {
  status: SubscriptionStatus
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  stripeCustomerId: string | null
}>> {
  const subscriptions = await prisma.subscription.findMany({
    where: {
      userId: {
        in: userIds,
      },
    },
    select: {
      userId: true,
      status: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      stripeCustomerId: true,
    },
  })

  const subscriptionMap = new Map<string, {
    status: SubscriptionStatus
    currentPeriodEnd: Date | null
    cancelAtPeriodEnd: boolean
    stripeCustomerId: string | null
  }>()
  for (const subscription of subscriptions) {
    subscriptionMap.set(subscription.userId, {
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      stripeCustomerId: subscription.stripeCustomerId,
    })
  }

  return subscriptionMap
}

/**
 * Get user activity timeline (Discord commands + media marks)
 */
export async function getUserActivityTimeline(
  userId: string,
  options: { page?: number; pageSize?: number } = {}
): Promise<UserActivityTimelineData | null> {
  await requireAdmin()

  const { page = 1, pageSize = 10 } = options

  try {
    // Fetch both data sources and counts in parallel
    const [discordLogs, mediaMarks, discordCount, mediaMarkCount] = await Promise.all([
      prisma.discordCommandLog.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: pageSize * 2, // Fetch extra to merge properly
      }),
      prisma.userMediaMark.findMany({
        where: { userId },
        orderBy: { markedAt: "desc" },
        take: pageSize * 2,
      }),
      prisma.discordCommandLog.count({ where: { userId } }),
      prisma.userMediaMark.count({ where: { userId } }),
    ])

    // Transform Discord logs to activity items
    const discordActivities: DiscordCommandActivity[] = discordLogs.map((log) => ({
      type: "discord_command" as const,
      id: log.id,
      timestamp: log.createdAt,
      commandType: log.commandType,
      commandName: log.commandName,
      commandArgs: log.commandArgs,
      status: log.status,
      responseTimeMs: log.responseTimeMs,
      channelType: log.channelType,
    }))

    // Transform media marks to activity items
    const mediaMarkActivities: MediaMarkActivity[] = mediaMarks.map((mark) => ({
      type: "media_mark" as const,
      id: mark.id,
      timestamp: mark.markedAt,
      markType: mark.markType,
      mediaType: mark.mediaType,
      title: mark.title,
      year: mark.year,
      seasonNumber: mark.seasonNumber,
      episodeNumber: mark.episodeNumber,
      parentTitle: mark.parentTitle,
      markedVia: mark.markedVia,
    }))

    // Merge and sort by timestamp (most recent first)
    const allActivities: UserActivityItem[] = [...discordActivities, ...mediaMarkActivities].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    )

    // Apply pagination
    const total = discordCount + mediaMarkCount
    const totalPages = Math.ceil(total / pageSize)
    const offset = (page - 1) * pageSize
    const paginatedItems = allActivities.slice(offset, offset + pageSize)

    return {
      items: paginatedItems,
      total,
      page,
      pageSize,
      totalPages,
    }
  } catch (error) {
    logger.error("Error fetching user activity timeline", error, { userId })
    return null
  }
}
