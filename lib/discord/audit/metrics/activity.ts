/**
 * Discord Command Audit — activity metrics
 *
 * Time-bucketed and summary rollups: daily activity trends and top-level
 * dashboard summary statistics.
 */

import { prisma } from "@/lib/prisma"
import type { DiscordCommandType } from "@/lib/generated/prisma/client"
import { zeroFill, type DayWindow } from "@/lib/utils/day-window"

import { dateRangeWhere, toDateKey } from "../query-helpers"

export interface DailyActivity {
  date: string
  total: number
  success: number
  failed: number
}

/**
 * Daily command counts for the trend chart: one entry per day of the window,
 * keyed in its zone, with zeros on quiet days.
 */
export async function getDailyActivity(window: DayWindow): Promise<DailyActivity[]> {
  const logs = await prisma.discordCommandLog.findMany({
    where: dateRangeWhere(window.gte, window.lt),
    select: {
      createdAt: true,
      status: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  })

  // Group by date
  const activityByDate = new Map<
    string,
    { total: number; success: number; failed: number }
  >()

  for (const log of logs) {
    const dateKey = toDateKey(log.createdAt, window.zone)
    const existing = activityByDate.get(dateKey) || {
      total: 0,
      success: 0,
      failed: 0,
    }
    existing.total++
    if (log.status === "SUCCESS") {
      existing.success++
    } else if (log.status === "FAILED") {
      existing.failed++
    }
    activityByDate.set(dateKey, existing)
  }

  return zeroFill(window.keys, activityByDate, { total: 0, success: 0, failed: 0 })
}

export interface SummaryStats {
  totalCommands: number
  successRate: number
  avgResponseTimeMs: number | null
  uniqueUsers: number
  commandsByType: { type: DiscordCommandType; count: number }[]
}

/**
 * Get summary statistics
 */
export async function getSummaryStats(
  startDate: Date,
  endDate: Date
): Promise<SummaryStats> {
  const where = dateRangeWhere(startDate, endDate)

  const [
    totalCommands,
    successCount,
    avgResponseTime,
    uniqueUsersResult,
    commandsByType,
  ] = await Promise.all([
    prisma.discordCommandLog.count({ where }),
    prisma.discordCommandLog.count({
      where: { ...where, status: "SUCCESS" },
    }),
    prisma.discordCommandLog.aggregate({
      where,
      _avg: { responseTimeMs: true },
    }),
    prisma.discordCommandLog.groupBy({
      by: ["discordUserId"],
      where,
    }),
    prisma.discordCommandLog.groupBy({
      by: ["commandType"],
      where,
      _count: { _all: true },
    }),
  ])

  return {
    totalCommands,
    successRate: totalCommands > 0 ? (successCount / totalCommands) * 100 : 0,
    avgResponseTimeMs: avgResponseTime._avg.responseTimeMs,
    uniqueUsers: uniqueUsersResult.length,
    commandsByType: commandsByType.map((c) => ({
      type: c.commandType,
      count: c._count._all,
    })),
  }
}
