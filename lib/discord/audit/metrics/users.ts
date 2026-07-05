/**
 * Discord Command Audit — user metrics
 *
 * Per-user rollups: most-active users and account-linking request metrics.
 */

import { prisma } from "@/lib/prisma"
import type { DiscordCommandType } from "@/lib/generated/prisma/client"
import { dateRangeWhere, toDateKey } from "../query-helpers"

export interface ActiveUser {
  discordUserId: string
  discordUsername: string | null
  userId: string | null
  commandCount: number
  lastActiveAt: Date
}

/**
 * Get active users (unique Discord users who have used the bot)
 */
export async function getActiveUsers(
  startDate: Date,
  endDate: Date,
  limit: number = 20
): Promise<ActiveUser[]> {
  const users = await prisma.discordCommandLog.groupBy({
    by: ["discordUserId", "discordUsername", "userId"],
    where: dateRangeWhere(startDate, endDate),
    _count: {
      _all: true,
    },
    _max: {
      createdAt: true,
    },
    orderBy: {
      _count: {
        discordUserId: "desc",
      },
    },
    take: limit,
  })

  return users.map((user) => ({
    discordUserId: user.discordUserId,
    discordUsername: user.discordUsername,
    userId: user.userId,
    commandCount: user._count._all,
    lastActiveAt: user._max.createdAt!,
  }))
}

export interface AccountLinkingMetrics {
  totalLinkRequests: number
  uniqueUnlinkedUsers: number
  linkRequestsByDay: { date: string; count: number }[]
  repeatRequestUsers: {
    discordUserId: string
    discordUsername: string | null
    requestCount: number
  }[]
}

/**
 * Get account linking metrics
 */
export async function getAccountLinkingMetrics(
  startDate: Date,
  endDate: Date
): Promise<AccountLinkingMetrics> {
  const where = {
    commandType: "LINK_REQUEST" as DiscordCommandType,
    ...dateRangeWhere(startDate, endDate),
  }

  const [totalLinkRequests, userGroups, logs] = await Promise.all([
    prisma.discordCommandLog.count({ where }),
    prisma.discordCommandLog.groupBy({
      by: ["discordUserId", "discordUsername"],
      where,
      _count: true,
    }),
    prisma.discordCommandLog.findMany({
      where,
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ])

  // Group by date for trend
  const requestsByDate = new Map<string, number>()
  for (const log of logs) {
    const dateKey = toDateKey(log.createdAt)
    requestsByDate.set(dateKey, (requestsByDate.get(dateKey) || 0) + 1)
  }

  const linkRequestsByDay = Array.from(requestsByDate.entries()).map(
    ([date, count]) => ({ date, count })
  )

  // Find users with multiple requests (repeat requesters)
  const repeatRequestUsers = userGroups
    .filter((u) => u._count > 1)
    .sort((a, b) => b._count - a._count)
    .map((u) => ({
      discordUserId: u.discordUserId,
      discordUsername: u.discordUsername,
      requestCount: u._count,
    }))

  return {
    totalLinkRequests,
    uniqueUnlinkedUsers: userGroups.length,
    linkRequestsByDay,
    repeatRequestUsers,
  }
}
