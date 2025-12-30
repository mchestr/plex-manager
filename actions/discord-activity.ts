"use server"

import { requireAdmin } from "@/lib/admin"
import {
  getCommandLogs,
  getCommandStats,
  getDailyActivity,
  getActiveUsers,
  getSummaryStats,
  getHelpCommandStats,
  getAccountLinkingMetrics,
  getMediaMarkingBreakdown,
  getContextMetrics,
  getErrorAnalysis,
  getSelectionMenuStats,
  type GetCommandLogsParams,
} from "@/lib/discord/audit"
import { prisma } from "@/lib/prisma"
import { toEndOfDayExclusive } from "@/lib/utils/formatters"
import { createLogger } from "@/lib/utils/logger"
import type { DiscordCommandType, DiscordCommandStatus } from "@/lib/generated/prisma"

const logger = createLogger("DISCORD_ACTIVITY_ACTIONS")

export interface GetActivityLogsParams {
  limit?: number
  offset?: number
  discordUserId?: string
  userId?: string
  commandType?: DiscordCommandType
  commandName?: string
  status?: DiscordCommandStatus
  startDate?: string
  endDate?: string
  search?: string
}

export async function getDiscordActivityLogs(params: GetActivityLogsParams = {}) {
  await requireAdmin()

  try {
    const queryParams: GetCommandLogsParams = {
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
      discordUserId: params.discordUserId,
      userId: params.userId,
      commandType: params.commandType,
      commandName: params.commandName,
      status: params.status,
      startDate: params.startDate ? new Date(params.startDate) : undefined,
      endDate: toEndOfDayExclusive(params.endDate),
    }

    const result = await getCommandLogs(queryParams)

    // Serialize dates for client
    const logs = result.logs.map((log) => ({
      ...log,
      startedAt: log.startedAt.toISOString(),
      completedAt: log.completedAt?.toISOString() ?? null,
      createdAt: log.createdAt.toISOString(),
    }))

    return { success: true, logs, total: result.total }
  } catch (error) {
    logger.error("Failed to get Discord activity logs", error instanceof Error ? error : undefined)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get activity logs",
      logs: [],
      total: 0,
    }
  }
}

export interface GetStatsParams {
  startDate: string
  endDate: string
}

export async function getDiscordCommandStats(params: GetStatsParams) {
  await requireAdmin()

  try {
    const stats = await getCommandStats(
      new Date(params.startDate),
      toEndOfDayExclusive(params.endDate)!
    )

    return { success: true, stats }
  } catch (error) {
    logger.error("Failed to get Discord command stats", error instanceof Error ? error : undefined)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get command stats",
      stats: [],
    }
  }
}

export async function getDiscordDailyActivity(params: GetStatsParams) {
  await requireAdmin()

  try {
    const activity = await getDailyActivity(
      new Date(params.startDate),
      toEndOfDayExclusive(params.endDate)!
    )

    return { success: true, activity }
  } catch (error) {
    logger.error("Failed to get Discord daily activity", error instanceof Error ? error : undefined)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get daily activity",
      activity: [],
    }
  }
}

export async function getDiscordActiveUsers(params: GetStatsParams & { limit?: number }) {
  await requireAdmin()

  try {
    const users = await getActiveUsers(
      new Date(params.startDate),
      toEndOfDayExclusive(params.endDate)!,
      params.limit ?? 20
    )

    // Serialize dates for client
    const serializedUsers = users.map((user) => ({
      ...user,
      lastActiveAt: user.lastActiveAt.toISOString(),
    }))

    return { success: true, users: serializedUsers }
  } catch (error) {
    logger.error("Failed to get Discord active users", error instanceof Error ? error : undefined)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get active users",
      users: [],
    }
  }
}

export async function getDiscordSummaryStats(params: GetStatsParams) {
  await requireAdmin()

  try {
    const summary = await getSummaryStats(
      new Date(params.startDate),
      toEndOfDayExclusive(params.endDate)!
    )

    return { success: true, summary }
  } catch (error) {
    logger.error("Failed to get Discord summary stats", error instanceof Error ? error : undefined)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get summary stats",
      summary: null,
    }
  }
}

export async function getDiscordBotStatus() {
  await requireAdmin()

  try {
    // Get Discord integration settings
    const integration = await prisma.discordIntegration.findUnique({
      where: { id: "discord" },
    })

    // Get bot lock status
    const lock = await prisma.discordBotLock.findUnique({
      where: { id: "discord-bot" },
    })

    // Check if lock is still valid (not expired)
    const isLockValid = lock != null && lock.expiresAt > new Date()

    // Get recent activity count (last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const recentActivityCount = await prisma.discordCommandLog.count({
      where: {
        createdAt: { gte: oneHourAgo },
      },
    })

    // Get last command time
    const lastCommand = await prisma.discordCommandLog.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    })

    return {
      success: true,
      status: {
        isEnabled: integration?.isEnabled ?? false,
        botEnabled: integration?.botEnabled ?? false,
        isConnected: isLockValid,
        instanceId: lock?.instanceId ?? null,
        lastRenewedAt: lock?.lastRenewedAt?.toISOString() ?? null,
        expiresAt: lock?.expiresAt?.toISOString() ?? null,
        recentActivityCount,
        lastCommandAt: lastCommand?.createdAt?.toISOString() ?? null,
      },
    }
  } catch (error) {
    logger.error("Failed to get Discord bot status", error instanceof Error ? error : undefined)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get bot status",
      status: null,
    }
  }
}

export async function getDiscordDashboardData(params: GetStatsParams) {
  await requireAdmin()

  try {
    const [summaryResult, activityResult, statsResult, usersResult, statusResult] = await Promise.all([
      getDiscordSummaryStats(params),
      getDiscordDailyActivity(params),
      getDiscordCommandStats(params),
      getDiscordActiveUsers({ ...params, limit: 10 }),
      getDiscordBotStatus(),
    ])

    return {
      success: true,
      data: {
        summary: summaryResult.success ? summaryResult.summary : null,
        dailyActivity: activityResult.success ? activityResult.activity : [],
        commandStats: statsResult.success ? statsResult.stats : [],
        activeUsers: usersResult.success ? usersResult.users : [],
        botStatus: statusResult.success ? statusResult.status : null,
      },
    }
  } catch (error) {
    logger.error("Failed to get Discord dashboard data", error instanceof Error ? error : undefined)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get dashboard data",
      data: null,
    }
  }
}

export async function getDiscordHelpStats(params: GetStatsParams) {
  await requireAdmin()

  try {
    const stats = await getHelpCommandStats(
      new Date(params.startDate),
      toEndOfDayExclusive(params.endDate)!
    )

    return { success: true, stats }
  } catch (error) {
    logger.error("Failed to get Discord help stats", error instanceof Error ? error : undefined)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get help stats",
      stats: null,
    }
  }
}

export async function getDiscordLinkingMetrics(params: GetStatsParams) {
  await requireAdmin()

  try {
    const metrics = await getAccountLinkingMetrics(
      new Date(params.startDate),
      toEndOfDayExclusive(params.endDate)!
    )

    return { success: true, metrics }
  } catch (error) {
    logger.error("Failed to get Discord linking metrics", error instanceof Error ? error : undefined)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get linking metrics",
      metrics: null,
    }
  }
}

export async function getDiscordMediaMarkingBreakdown(params: GetStatsParams) {
  await requireAdmin()

  try {
    const breakdown = await getMediaMarkingBreakdown(
      new Date(params.startDate),
      toEndOfDayExclusive(params.endDate)!
    )

    return { success: true, breakdown }
  } catch (error) {
    logger.error("Failed to get Discord media marking breakdown", error instanceof Error ? error : undefined)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get media marking breakdown",
      breakdown: null,
    }
  }
}

export async function getDiscordContextMetrics(params: GetStatsParams) {
  await requireAdmin()

  try {
    const metrics = await getContextMetrics(
      new Date(params.startDate),
      toEndOfDayExclusive(params.endDate)!
    )

    return { success: true, metrics }
  } catch (error) {
    logger.error("Failed to get Discord context metrics", error instanceof Error ? error : undefined)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get context metrics",
      metrics: null,
    }
  }
}

export async function getDiscordErrorAnalysis(params: GetStatsParams) {
  await requireAdmin()

  try {
    const analysis = await getErrorAnalysis(
      new Date(params.startDate),
      toEndOfDayExclusive(params.endDate)!
    )

    return { success: true, analysis }
  } catch (error) {
    logger.error("Failed to get Discord error analysis", error instanceof Error ? error : undefined)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get error analysis",
      analysis: null,
    }
  }
}

export async function getDiscordSelectionStats(params: GetStatsParams) {
  await requireAdmin()

  try {
    const stats = await getSelectionMenuStats(
      new Date(params.startDate),
      toEndOfDayExclusive(params.endDate)!
    )

    return { success: true, stats }
  } catch (error) {
    logger.error("Failed to get Discord selection stats", error instanceof Error ? error : undefined)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get selection stats",
      stats: null,
    }
  }
}

export async function getDiscordDetailedStats(params: GetStatsParams) {
  await requireAdmin()

  try {
    const [helpResult, linkingResult, mediaResult, contextResult, errorResult, selectionResult] =
      await Promise.all([
        getDiscordHelpStats(params),
        getDiscordLinkingMetrics(params),
        getDiscordMediaMarkingBreakdown(params),
        getDiscordContextMetrics(params),
        getDiscordErrorAnalysis(params),
        getDiscordSelectionStats(params),
      ])

    return {
      success: true,
      data: {
        helpStats: helpResult.success ? helpResult.stats : null,
        linkingMetrics: linkingResult.success ? linkingResult.metrics : null,
        mediaMarkingBreakdown: mediaResult.success ? mediaResult.breakdown : null,
        contextMetrics: contextResult.success ? contextResult.metrics : null,
        errorAnalysis: errorResult.success ? errorResult.analysis : null,
        selectionStats: selectionResult.success ? selectionResult.stats : null,
      },
    }
  } catch (error) {
    logger.error("Failed to get Discord detailed stats", error instanceof Error ? error : undefined)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get detailed stats",
      data: null,
    }
  }
}
