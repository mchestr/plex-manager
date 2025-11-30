/**
 * Discord Command Audit Logging Service
 *
 * Provides functions to log all Discord bot interactions to the database
 * for monitoring, analytics, and debugging purposes.
 */

import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import type {
  DiscordCommandLog,
  DiscordCommandStatus,
  DiscordCommandType,
} from "@/lib/generated/prisma/client"

const logger = createLogger("discord-audit")

export interface CreateCommandLogParams {
  discordUserId: string
  discordUsername?: string
  userId?: string
  commandType: DiscordCommandType
  commandName: string
  commandArgs?: string
  channelId: string
  channelType: string
  guildId?: string
}

export interface UpdateCommandLogParams {
  status: DiscordCommandStatus
  error?: string
  responseTimeMs?: number
}

/**
 * Create a new command log entry when a command starts processing
 */
export async function createCommandLog(
  params: CreateCommandLogParams
): Promise<DiscordCommandLog | null> {
  try {
    const log = await prisma.discordCommandLog.create({
      data: {
        discordUserId: params.discordUserId,
        discordUsername: params.discordUsername,
        userId: params.userId,
        commandType: params.commandType,
        commandName: params.commandName,
        commandArgs: params.commandArgs,
        channelId: params.channelId,
        channelType: params.channelType,
        guildId: params.guildId,
        status: "PENDING",
        startedAt: new Date(),
      },
    })
    return log
  } catch (error) {
    logger.error("Failed to create command log", { error, params })
    return null
  }
}

/**
 * Update a command log entry when processing completes
 */
export async function updateCommandLog(
  logId: string,
  params: UpdateCommandLogParams
): Promise<DiscordCommandLog | null> {
  try {
    const log = await prisma.discordCommandLog.update({
      where: { id: logId },
      data: {
        status: params.status,
        error: params.error,
        responseTimeMs: params.responseTimeMs,
        completedAt: new Date(),
      },
    })
    return log
  } catch (error) {
    logger.error("Failed to update command log", { error, logId, params })
    return null
  }
}

/**
 * Helper to log a complete command execution in one call
 * Use this for simple commands that don't need separate start/end tracking
 */
export async function logCommandExecution(
  params: CreateCommandLogParams & {
    status: DiscordCommandStatus
    error?: string
    responseTimeMs?: number
  }
): Promise<DiscordCommandLog | null> {
  try {
    const log = await prisma.discordCommandLog.create({
      data: {
        discordUserId: params.discordUserId,
        discordUsername: params.discordUsername,
        userId: params.userId,
        commandType: params.commandType,
        commandName: params.commandName,
        commandArgs: params.commandArgs,
        channelId: params.channelId,
        channelType: params.channelType,
        guildId: params.guildId,
        status: params.status,
        error: params.error,
        responseTimeMs: params.responseTimeMs,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    })
    return log
  } catch (error) {
    logger.error("Failed to log command execution", { error, params })
    return null
  }
}

/**
 * Get recent command logs with optional filtering
 */
export interface GetCommandLogsParams {
  limit?: number
  offset?: number
  discordUserId?: string
  userId?: string
  commandType?: DiscordCommandType
  commandName?: string
  status?: DiscordCommandStatus
  channelId?: string
  startDate?: Date
  endDate?: Date
}

export interface GetCommandLogsResult {
  logs: DiscordCommandLog[]
  total: number
}

export async function getCommandLogs(
  params: GetCommandLogsParams = {}
): Promise<GetCommandLogsResult> {
  const {
    limit = 50,
    offset = 0,
    discordUserId,
    userId,
    commandType,
    commandName,
    status,
    channelId,
    startDate,
    endDate,
  } = params

  const where = {
    ...(discordUserId && { discordUserId }),
    ...(userId && { userId }),
    ...(commandType && { commandType }),
    ...(commandName && { commandName }),
    ...(status && { status }),
    ...(channelId && { channelId }),
    ...(startDate || endDate
      ? {
          createdAt: {
            ...(startDate && { gte: startDate }),
            ...(endDate && { lt: endDate }),
          },
        }
      : {}),
  }

  const [logs, total] = await Promise.all([
    prisma.discordCommandLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.discordCommandLog.count({ where }),
  ])

  return { logs, total }
}

/**
 * Get command usage statistics for a date range
 */
export interface CommandStats {
  commandName: string
  commandType: DiscordCommandType
  totalCount: number
  successCount: number
  failedCount: number
  avgResponseTimeMs: number | null
}

export async function getCommandStats(
  startDate: Date,
  endDate: Date
): Promise<CommandStats[]> {
  const logs = await prisma.discordCommandLog.groupBy({
    by: ["commandName", "commandType"],
    where: {
      createdAt: {
        gte: startDate,
        lt: endDate,
      },
    },
    _count: {
      _all: true,
    },
    _avg: {
      responseTimeMs: true,
    },
  })

  // Get success/failed counts separately
  const statsPromises = logs.map(async (log) => {
    const [successCount, failedCount] = await Promise.all([
      prisma.discordCommandLog.count({
        where: {
          commandName: log.commandName,
          commandType: log.commandType,
          status: "SUCCESS",
          createdAt: { gte: startDate, lt: endDate },
        },
      }),
      prisma.discordCommandLog.count({
        where: {
          commandName: log.commandName,
          commandType: log.commandType,
          status: "FAILED",
          createdAt: { gte: startDate, lt: endDate },
        },
      }),
    ])

    return {
      commandName: log.commandName,
      commandType: log.commandType,
      totalCount: log._count._all,
      successCount,
      failedCount,
      avgResponseTimeMs: log._avg.responseTimeMs,
    }
  })

  return Promise.all(statsPromises)
}

/**
 * Get daily activity counts for trending chart
 */
export interface DailyActivity {
  date: string
  total: number
  success: number
  failed: number
}

export async function getDailyActivity(
  startDate: Date,
  endDate: Date
): Promise<DailyActivity[]> {
  // Get all logs in the date range
  const logs = await prisma.discordCommandLog.findMany({
    where: {
      createdAt: {
        gte: startDate,
        lt: endDate,
      },
    },
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
    const dateKey = log.createdAt.toISOString().split("T")[0]
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

  // Convert to array
  return Array.from(activityByDate.entries()).map(([date, counts]) => ({
    date,
    ...counts,
  }))
}

/**
 * Get active users (unique Discord users who have used the bot)
 */
export interface ActiveUser {
  discordUserId: string
  discordUsername: string | null
  userId: string | null
  commandCount: number
  lastActiveAt: Date
}

export async function getActiveUsers(
  startDate: Date,
  endDate: Date,
  limit: number = 20
): Promise<ActiveUser[]> {
  const users = await prisma.discordCommandLog.groupBy({
    by: ["discordUserId", "discordUsername", "userId"],
    where: {
      createdAt: {
        gte: startDate,
        lt: endDate,
      },
    },
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

/**
 * Get summary statistics
 */
export interface SummaryStats {
  totalCommands: number
  successRate: number
  avgResponseTimeMs: number | null
  uniqueUsers: number
  commandsByType: { type: DiscordCommandType; count: number }[]
}

export async function getSummaryStats(
  startDate: Date,
  endDate: Date
): Promise<SummaryStats> {
  const where = {
    createdAt: {
      gte: startDate,
      lt: endDate,
    },
  }

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
