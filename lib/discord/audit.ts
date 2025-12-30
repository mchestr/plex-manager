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

/**
 * Get help command statistics
 */
export interface HelpCommandStats {
  totalHelpRequests: number
  helpByTopic: { topic: string; count: number }[]
  generalHelpCount: number
  specificHelpCount: number
}

export async function getHelpCommandStats(
  startDate: Date,
  endDate: Date
): Promise<HelpCommandStats> {
  const where = {
    commandType: "HELP" as DiscordCommandType,
    createdAt: {
      gte: startDate,
      lt: endDate,
    },
  }

  const logs = await prisma.discordCommandLog.findMany({
    where,
    select: {
      commandArgs: true,
    },
  })

  // Count by topic (commandArgs contains the help topic)
  const topicCounts = new Map<string, number>()
  let generalHelpCount = 0
  let specificHelpCount = 0

  for (const log of logs) {
    const topic = log.commandArgs?.trim() || "general"
    if (topic === "general" || topic === "") {
      generalHelpCount++
    } else {
      specificHelpCount++
    }
    topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1)
  }

  // Convert to sorted array
  const helpByTopic = Array.from(topicCounts.entries())
    .map(([topic, count]) => ({ topic: topic || "general", count }))
    .sort((a, b) => b.count - a.count)

  return {
    totalHelpRequests: logs.length,
    helpByTopic,
    generalHelpCount,
    specificHelpCount,
  }
}

/**
 * Get account linking metrics
 */
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

export async function getAccountLinkingMetrics(
  startDate: Date,
  endDate: Date
): Promise<AccountLinkingMetrics> {
  const where = {
    commandType: "LINK_REQUEST" as DiscordCommandType,
    createdAt: {
      gte: startDate,
      lt: endDate,
    },
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
    const dateKey = log.createdAt.toISOString().split("T")[0]
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

/**
 * Get media marking breakdown by command
 */
export interface MediaMarkingBreakdown {
  byCommand: {
    commandName: string
    count: number
    successCount: number
    failedCount: number
  }[]
  topMediaMarked: { title: string; count: number }[]
}

export async function getMediaMarkingBreakdown(
  startDate: Date,
  endDate: Date
): Promise<MediaMarkingBreakdown> {
  const where = {
    commandType: "MEDIA_MARK" as DiscordCommandType,
    createdAt: {
      gte: startDate,
      lt: endDate,
    },
  }

  const [commandGroups, logs] = await Promise.all([
    prisma.discordCommandLog.groupBy({
      by: ["commandName"],
      where,
      _count: true,
    }),
    prisma.discordCommandLog.findMany({
      where,
      select: {
        commandName: true,
        commandArgs: true,
        status: true,
      },
    }),
  ])

  // Calculate success/failed per command
  const commandStats = new Map<
    string,
    { count: number; successCount: number; failedCount: number }
  >()

  for (const log of logs) {
    const existing = commandStats.get(log.commandName) || {
      count: 0,
      successCount: 0,
      failedCount: 0,
    }
    existing.count++
    if (log.status === "SUCCESS") {
      existing.successCount++
    } else if (log.status === "FAILED") {
      existing.failedCount++
    }
    commandStats.set(log.commandName, existing)
  }

  const byCommand = commandGroups
    .sort((a, b) => b._count - a._count)
    .map((g) => {
      const stats = commandStats.get(g.commandName) || {
        count: 0,
        successCount: 0,
        failedCount: 0,
      }
      return {
        commandName: g.commandName,
        count: g._count,
        successCount: stats.successCount,
        failedCount: stats.failedCount,
      }
    })

  // Extract media titles from commandArgs (top 10)
  const titleCounts = new Map<string, number>()
  for (const log of logs) {
    if (log.commandArgs && log.status === "SUCCESS") {
      const title = log.commandArgs.trim()
      if (title) {
        titleCounts.set(title, (titleCounts.get(title) || 0) + 1)
      }
    }
  }

  const topMediaMarked = Array.from(titleCounts.entries())
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  return {
    byCommand,
    topMediaMarked,
  }
}

/**
 * Get context clear metrics
 */
export interface ContextMetrics {
  totalClears: number
  clearsByCommand: { commandName: string; count: number }[]
  topClearUsers: {
    discordUserId: string
    discordUsername: string | null
    clearCount: number
  }[]
}

export async function getContextMetrics(
  startDate: Date,
  endDate: Date
): Promise<ContextMetrics> {
  const where = {
    commandType: "CLEAR_CONTEXT" as DiscordCommandType,
    createdAt: {
      gte: startDate,
      lt: endDate,
    },
  }

  const [totalClears, commandGroups, userGroups] = await Promise.all([
    prisma.discordCommandLog.count({ where }),
    prisma.discordCommandLog.groupBy({
      by: ["commandName"],
      where,
      _count: true,
    }),
    prisma.discordCommandLog.groupBy({
      by: ["discordUserId", "discordUsername"],
      where,
      _count: true,
    }),
  ])

  return {
    totalClears,
    clearsByCommand: commandGroups
      .sort((a, b) => b._count - a._count)
      .map((g) => ({
        commandName: g.commandName,
        count: g._count,
      })),
    topClearUsers: userGroups
      .sort((a, b) => b._count - a._count)
      .slice(0, 10)
      .map((u) => ({
        discordUserId: u.discordUserId,
        discordUsername: u.discordUsername,
        clearCount: u._count,
      })),
  }
}

/**
 * Get error analysis
 */
export interface ErrorAnalysis {
  totalErrors: number
  errorsByType: { commandType: string; count: number }[]
  errorsByCommand: {
    commandName: string
    count: number
    sampleErrors: string[]
  }[]
  errorTrend: { date: string; count: number }[]
}

export async function getErrorAnalysis(
  startDate: Date,
  endDate: Date
): Promise<ErrorAnalysis> {
  const where = {
    status: { in: ["FAILED", "TIMEOUT"] as DiscordCommandStatus[] },
    createdAt: {
      gte: startDate,
      lt: endDate,
    },
  }

  const [totalErrors, typeGroups, commandGroups, logs] = await Promise.all([
    prisma.discordCommandLog.count({ where }),
    prisma.discordCommandLog.groupBy({
      by: ["commandType"],
      where,
      _count: true,
    }),
    prisma.discordCommandLog.groupBy({
      by: ["commandName"],
      where,
      _count: true,
    }),
    prisma.discordCommandLog.findMany({
      where,
      select: {
        commandName: true,
        error: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ])

  // Collect sample errors per command (up to 3 samples)
  const errorSamples = new Map<string, string[]>()
  for (const log of logs) {
    if (log.error) {
      const samples = errorSamples.get(log.commandName) || []
      if (samples.length < 3) {
        samples.push(log.error)
        errorSamples.set(log.commandName, samples)
      }
    }
  }

  // Group by date for trend
  const errorsByDate = new Map<string, number>()
  for (const log of logs) {
    const dateKey = log.createdAt.toISOString().split("T")[0]
    errorsByDate.set(dateKey, (errorsByDate.get(dateKey) || 0) + 1)
  }

  return {
    totalErrors,
    errorsByType: typeGroups
      .sort((a, b) => b._count - a._count)
      .map((g) => ({
        commandType: g.commandType,
        count: g._count,
      })),
    errorsByCommand: commandGroups
      .sort((a, b) => b._count - a._count)
      .slice(0, 10)
      .map((g) => ({
        commandName: g.commandName,
        count: g._count,
        sampleErrors: errorSamples.get(g.commandName) || [],
      })),
    errorTrend: Array.from(errorsByDate.entries()).map(([date, count]) => ({
      date,
      count,
    })),
  }
}

/**
 * Get selection menu statistics
 */
export interface SelectionMenuStats {
  totalSelections: number
  selectionsByNumber: { selection: string; count: number }[]
  successRate: number
  avgResponseTimeMs: number | null
}

export async function getSelectionMenuStats(
  startDate: Date,
  endDate: Date
): Promise<SelectionMenuStats> {
  const where = {
    commandType: "SELECTION" as DiscordCommandType,
    createdAt: {
      gte: startDate,
      lt: endDate,
    },
  }

  const [totalSelections, successCount, avgResponse, logs] = await Promise.all([
    prisma.discordCommandLog.count({ where }),
    prisma.discordCommandLog.count({ where: { ...where, status: "SUCCESS" } }),
    prisma.discordCommandLog.aggregate({
      where,
      _avg: { responseTimeMs: true },
    }),
    prisma.discordCommandLog.findMany({
      where,
      select: { commandArgs: true },
    }),
  ])

  // Count selections by number (1-5)
  const selectionCounts = new Map<string, number>()
  for (const log of logs) {
    const selection = log.commandArgs?.trim() || "unknown"
    selectionCounts.set(selection, (selectionCounts.get(selection) || 0) + 1)
  }

  const selectionsByNumber = Array.from(selectionCounts.entries())
    .map(([selection, count]) => ({ selection, count }))
    .sort((a, b) => {
      // Sort numerically if possible
      const aNum = parseInt(a.selection, 10)
      const bNum = parseInt(b.selection, 10)
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return aNum - bNum
      }
      return a.selection.localeCompare(b.selection)
    })

  return {
    totalSelections,
    selectionsByNumber,
    successRate: totalSelections > 0 ? (successCount / totalSelections) * 100 : 0,
    avgResponseTimeMs: avgResponse._avg.responseTimeMs,
  }
}
