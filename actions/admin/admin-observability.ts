"use server"

import { requireAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { getAdminSettings } from "./admin-settings"

export interface ServiceStatus {
  configured: boolean
  name: string
  description: string
}

export interface ActivityTrendPoint {
  date: string
  requests: number
  cost: number
  tokens: number
}

export interface TopUser {
  userId: string
  name: string
  email: string
  image: string | null
  requests: number
  cost: number
  tokens: number
}

export interface ObservabilityData {
  services: {
    plex: ServiceStatus
    tautulli: ServiceStatus
    overseerr: ServiceStatus
    sonarr: ServiceStatus
    radarr: ServiceStatus
    discord: ServiceStatus
    llm: ServiceStatus
  }
  users: {
    total: number
    admins: number
    regular: number
  }
  wrapped: {
    completed: number
    generating: number
    pending: number
    failed: number
  }
  llm: {
    requests24h: number
    cost24h: number
    totalCost: number
  }
  maintenance: {
    pendingCandidates: number
    approvedCandidates: number
    totalDeletions: number
  }
  activityTrend: ActivityTrendPoint[]
  topUsers: TopUser[]
}

/**
 * Get observability dashboard data (admin only)
 */
export async function getObservabilityData(): Promise<ObservabilityData> {
  await requireAdmin()

  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [
    settings,
    userCounts,
    wrappedCounts,
    llmStats24h,
    llmStatsTotal,
    maintenanceStats,
    activityTrendRaw,
    topUsersRaw,
  ] = await Promise.all([
    getAdminSettings(),
    // User counts
    prisma.user.groupBy({
      by: ["isAdmin"],
      _count: true,
    }),
    // Wrapped status counts
    prisma.plexWrapped.groupBy({
      by: ["status"],
      _count: true,
    }),
    // LLM usage last 24 hours
    prisma.lLMUsage.aggregate({
      where: {
        createdAt: { gte: yesterday },
      },
      _count: true,
      _sum: { cost: true },
    }),
    // Total LLM cost
    prisma.lLMUsage.aggregate({
      _sum: { cost: true },
    }),
    // Maintenance stats
    Promise.all([
      prisma.maintenanceCandidate.count({ where: { reviewStatus: "PENDING" } }),
      prisma.maintenanceCandidate.count({ where: { reviewStatus: "APPROVED" } }),
      prisma.maintenanceCandidate.count({ where: { reviewStatus: "DELETED" } }),
    ]),
    // 7-day activity trend
    prisma.lLMUsage.findMany({
      where: {
        createdAt: { gte: sevenDaysAgo },
      },
      select: {
        createdAt: true,
        cost: true,
        totalTokens: true,
      },
    }),
    // Top users by LLM usage (last 30 days)
    prisma.lLMUsage.groupBy({
      by: ["userId"],
      where: {
        createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
      },
      _count: true,
      _sum: {
        cost: true,
        totalTokens: true,
      },
      orderBy: {
        _sum: {
          cost: "desc",
        },
      },
      take: 5,
    }),
  ])

  // Calculate user counts
  const adminCount = userCounts.find((u) => u.isAdmin === true)?._count || 0
  const regularCount = userCounts.find((u) => u.isAdmin === false)?._count || 0

  // Calculate wrapped counts
  const wrappedStatusMap = wrappedCounts.reduce(
    (acc, item) => {
      acc[item.status] = item._count
      return acc
    },
    {} as Record<string, number>
  )

  // Process activity trend - aggregate by date
  const activityByDate = new Map<string, { requests: number; cost: number; tokens: number }>()
  for (const record of activityTrendRaw) {
    const dateKey = record.createdAt.toISOString().split("T")[0]
    const existing = activityByDate.get(dateKey) || { requests: 0, cost: 0, tokens: 0 }
    activityByDate.set(dateKey, {
      requests: existing.requests + 1,
      cost: existing.cost + (record.cost || 0),
      tokens: existing.tokens + (record.totalTokens || 0),
    })
  }
  const activityTrend: ActivityTrendPoint[] = Array.from(activityByDate.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Get user details for top users
  const topUserIds = topUsersRaw.map((u) => u.userId)
  const userDetails = await prisma.user.findMany({
    where: { id: { in: topUserIds } },
    select: { id: true, name: true, email: true, image: true },
  })
  const userDetailsMap = new Map(userDetails.map((u) => [u.id, u]))

  const topUsers: TopUser[] = topUsersRaw.map((u) => {
    const user = userDetailsMap.get(u.userId)
    return {
      userId: u.userId,
      name: user?.name || "Unknown",
      email: user?.email || "",
      image: user?.image || null,
      requests: u._count,
      cost: u._sum.cost || 0,
      tokens: u._sum.totalTokens || 0,
    }
  })

  return {
    services: {
      plex: {
        configured: !!settings.plexServer,
        name: "Plex",
        description: "Media server",
      },
      tautulli: {
        configured: !!settings.tautulli,
        name: "Tautulli",
        description: "Plex monitoring",
      },
      overseerr: {
        configured: !!settings.overseerr,
        name: "Overseerr",
        description: "Request management",
      },
      sonarr: {
        configured: !!settings.sonarr,
        name: "Sonarr",
        description: "TV show management",
      },
      radarr: {
        configured: !!settings.radarr,
        name: "Radarr",
        description: "Movie management",
      },
      discord: {
        configured: !!settings.discordIntegration?.isEnabled,
        name: "Discord",
        description: "Bot integration",
      },
      llm: {
        configured: !!settings.llmProvider || !!settings.chatLLMProvider,
        name: "LLM Provider",
        description: "AI generation",
      },
    },
    users: {
      total: adminCount + regularCount,
      admins: adminCount,
      regular: regularCount,
    },
    wrapped: {
      completed: wrappedStatusMap["completed"] || 0,
      generating: wrappedStatusMap["generating"] || 0,
      pending: wrappedStatusMap["pending"] || 0,
      failed: wrappedStatusMap["failed"] || 0,
    },
    llm: {
      requests24h: llmStats24h._count || 0,
      cost24h: llmStats24h._sum.cost || 0,
      totalCost: llmStatsTotal._sum.cost || 0,
    },
    maintenance: {
      pendingCandidates: maintenanceStats[0],
      approvedCandidates: maintenanceStats[1],
      totalDeletions: maintenanceStats[2],
    },
    activityTrend,
    topUsers,
  }
}
