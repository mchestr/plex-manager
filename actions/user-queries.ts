"use server"

import { requireAdmin } from "@/lib/admin"
import { checkUserServerAccess, getPlexServerIdentity, getPlexUsers, unshareUserFromPlexServer } from "@/lib/connections/plex"
import { prisma } from "@/lib/prisma"
import { aggregateLlmUsage } from "@/lib/utils"
import { createLogger } from "@/lib/utils/logger"
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
 * Get user's Plex Wrapped
 */
export async function getUserPlexWrapped(
  userId: string,
  year: number = new Date().getFullYear()
) {
  try {
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

    return wrapped
  } catch (error) {
    logger.error("Error getting user wrapped", error)
    return null
  }
}

/**
 * Get detailed user information including all wrapped, shares, visits, and LLM usage
 */
export async function getUserDetails(userId: string): Promise<UserDetails | null> {
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
 * Get all users with their wrapped status
 */
export async function getAllUsersWithWrapped(year?: number): Promise<AdminUserWithWrappedStats[]> {
  try {
    const currentYear = year || new Date().getFullYear()

    // 1. Fetch users and their wrapped data
    const users = await fetchUsersWithWrappedData(currentYear)

    // 2. Build Plex access map
    const accessMap = await buildPlexAccessMap(users)

    // 3. Fetch share statistics for all users
    const shareStatsMap = await fetchShareStatsMap(users.map(u => u.id))

    // 4. Map users to DTO
    return users.map((user) => {
      const wrapped = user.plexWrapped[0]
      const currentYearLlmUsageRecords = wrapped?.llmUsage || []

      // Aggregate all LLM usage records for current year's wrapped (includes regenerations)
      const currentYearUsage = aggregateLlmUsage(currentYearLlmUsageRecords)

      // Aggregate ALL LLM usage records for this user (across all years and regenerations)
      const totalUsage = aggregateLlmUsage(user.llmUsage || [])

      const hasPlexAccess = accessMap.get(user.id) ?? null
      const shareStatsForUser = shareStatsMap.get(user.id) || { totalShares: 0, totalVisits: 0 }

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
      }
    })
  } catch (error) {
    logger.error("Error getting all users", error)
    return []
  }
}

/**
 * Unshare library access for a user from the Plex server (admin only)
 */
export async function unshareUserLibrary(userId: string): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()

  try {
    // Get the user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        plexUserId: true,
        isAdmin: true,
      },
    })

    if (!user) {
      return { success: false, error: "User not found" }
    }

    // Don't allow unsharing admin users
    if (user.isAdmin) {
      return { success: false, error: "Cannot unshare library access for admin users" }
    }

    if (!user.plexUserId) {
      return { success: false, error: "User Plex ID is required to unshare library access" }
    }

    // Get active Plex server
    const plexServer = await prisma.plexServer.findFirst({
      where: { isActive: true },
    })

    if (!plexServer) {
      return { success: false, error: "No active Plex server configured" }
    }

    // Unshare the user
    const result = await unshareUserFromPlexServer(
      {
        url: plexServer.url,
        token: plexServer.token,
      },
      user.plexUserId
    )

    if (!result.success) {
      logger.error("Failed to unshare user library", undefined, {
        userId: user.id,
        email: user.email,
        error: result.error,
      })
      return result
    }

    logger.info("Successfully unshared user library", {
      userId: user.id,
      email: user.email,
    })

    return { success: true }
  } catch (error) {
    logger.error("Error unsharing user library", error, { userId })
    if (error instanceof Error) {
      return { success: false, error: `Error unsharing library: ${error.message}` }
    }
    return { success: false, error: "Failed to unshare user library" }
  }
}

// --- Internal Helpers (Exported for testing) ---

export async function fetchUsersWithWrappedData(year: number) {
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

export async function buildPlexAccessMap(users: { id: string; plexUserId: string | null }[]): Promise<Map<string, boolean | null>> {
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

export async function fetchShareStatsMap(userIds: string[]): Promise<Map<string, { totalShares: number; totalVisits: number }>> {
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
 * Get user's first watch date from Tautulli
 * Returns the timestamp of their earliest watch history entry
 */
export async function getUserFirstWatchDate(
  plexUserId: string,
  userEmail: string | null
): Promise<{ success: boolean; firstWatchDate?: string; error?: string }> {
  try {
    // Get active Tautulli configuration
    const tautulli = await prisma.tautulli.findFirst({
      where: { isActive: true },
    })

    if (!tautulli) {
      logger.debug("No active Tautulli configured, cannot get first watch date")
      return { success: false, error: "Tautulli not configured" }
    }

    const baseUrl = `${tautulli.url}/api/v2`
    const apiKey = tautulli.apiKey

    // Get all users from Tautulli
    const usersResponse = await fetch(
      `${baseUrl}?apikey=${apiKey}&cmd=get_users`,
      { headers: { "Accept": "application/json" } }
    )

    if (!usersResponse.ok) {
      return { success: false, error: "Failed to fetch users from Tautulli" }
    }

    const usersData = await usersResponse.json()
    const users = Array.isArray(usersData.response?.data)
      ? usersData.response.data
      : usersData.response?.data?.users || []

    // Find the user by email or Plex ID
    interface TautulliUserResponse {
      user_id: number
      email?: string
      username?: string
      friendly_name?: string
      plex_id?: string
    }

    let tautulliUser: TautulliUserResponse | null = null

    if (userEmail) {
      tautulliUser = users.find(
        (u: TautulliUserResponse) => u.email?.toLowerCase() === userEmail.toLowerCase()
      ) ?? null
    }

    if (!tautulliUser) {
      tautulliUser = users.find(
        (u: TautulliUserResponse) =>
          u.plex_id?.toString() === plexUserId ||
          u.user_id?.toString() === plexUserId
      ) ?? null
    }

    if (!tautulliUser) {
      logger.debug("User not found in Tautulli", { plexUserId, userEmail })
      return { success: false, error: "User not found in Tautulli" }
    }

    // Fetch user's oldest history entry
    // We need to get the oldest, so we'll fetch history ordered by date ascending
    const historyResponse = await fetch(
      `${baseUrl}?apikey=${apiKey}&cmd=get_history&user_id=${tautulliUser.user_id}&order_dir=asc&length=1`,
      { headers: { "Accept": "application/json" } }
    )

    if (!historyResponse.ok) {
      return { success: false, error: "Failed to fetch user history from Tautulli" }
    }

    const historyData = await historyResponse.json()
    const historyItems = historyData.response?.data?.data || []

    if (historyItems.length === 0) {
      logger.debug("No watch history found for user", { plexUserId })
      return { success: false, error: "No watch history found" }
    }

    // Get the first item's date (Unix timestamp)
    const firstItem = historyItems[0]
    const timestamp = firstItem.date || firstItem.started

    if (!timestamp) {
      return { success: false, error: "No timestamp found in history" }
    }

    // Convert Unix timestamp to ISO string
    const firstWatchDate = new Date(timestamp * 1000).toISOString()

    logger.debug("Found first watch date", { plexUserId, firstWatchDate })
    return { success: true, firstWatchDate }
  } catch (error) {
    logger.error("Error getting user first watch date", error, { plexUserId })
    return { success: false, error: "Failed to get first watch date" }
  }
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
