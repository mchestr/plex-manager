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
import { dayWindow } from "@/lib/utils/day-window"
import { toEndOfDayExclusive } from "@/lib/utils/format"
import { serverZone } from "@/lib/utils/server-zone"
import { createLogger } from "@/lib/utils/logger"
import type {
  DiscordCommandType,
  DiscordCommandStatus,
  MarkType,
  Prisma,
} from "@/lib/generated/prisma"

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

    // React 19 serializes Date across the RSC boundary, so rows keep theirs (P10.7)
    const result = await getCommandLogs(queryParams)

    return { success: true, logs: result.logs, total: result.total }
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

/** An inclusive range of `YYYY-MM-DD` day keys in the server zone (`?from=` and `?to=`). */
export interface GetStatsParams {
  startDate: string
  endDate: string
}

/** The params' inclusive days as a window in the server zone, for the zero-filled daily series. */
async function statsWindow(params: GetStatsParams) {
  return dayWindow({ from: params.startDate, to: params.endDate }, await serverZone())
}

/** The same window as instants: its first midnight and the midnight after its last day. */
async function statBounds(params: GetStatsParams): Promise<[Date, Date]> {
  const { gte, lt } = await statsWindow(params)
  return [gte, lt]
}

async function getDiscordCommandStats(params: GetStatsParams) {
  await requireAdmin()

  try {
    const stats = await getCommandStats(
      ...(await statBounds(params))
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

async function getDiscordDailyActivity(params: GetStatsParams) {
  await requireAdmin()

  try {
    const activity = await getDailyActivity(await statsWindow(params))

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

async function getDiscordActiveUsers(params: GetStatsParams & { limit?: number }) {
  await requireAdmin()

  try {
    const users = await getActiveUsers(
      ...(await statBounds(params)),
      params.limit ?? 20
    )

    return { success: true, users }
  } catch (error) {
    logger.error("Failed to get Discord active users", error instanceof Error ? error : undefined)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get active users",
      users: [],
    }
  }
}

async function getDiscordSummaryStats(params: GetStatsParams) {
  await requireAdmin()

  try {
    const summary = await getSummaryStats(
      ...(await statBounds(params))
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

export async function getDiscordDashboardData(params: GetStatsParams) {
  await requireAdmin()

  try {
    const [summaryResult, activityResult, statsResult, usersResult] = await Promise.all([
      getDiscordSummaryStats(params),
      getDiscordDailyActivity(params),
      getDiscordCommandStats(params),
      getDiscordActiveUsers({ ...params, limit: 10 }),
    ])

    return {
      success: true,
      data: {
        summary: summaryResult.success ? summaryResult.summary : null,
        dailyActivity: activityResult.success ? activityResult.activity : [],
        commandStats: statsResult.success ? statsResult.stats : [],
        activeUsers: usersResult.success ? usersResult.users : [],
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

async function getDiscordHelpStats(params: GetStatsParams) {
  await requireAdmin()

  try {
    const stats = await getHelpCommandStats(
      ...(await statBounds(params))
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

async function getDiscordLinkingMetrics(params: GetStatsParams) {
  await requireAdmin()

  try {
    const window = await statsWindow(params)
    const metrics = await getAccountLinkingMetrics(window.gte, window.lt, window.zone)

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

async function getDiscordMediaMarkingBreakdown(params: GetStatsParams) {
  await requireAdmin()

  try {
    const breakdown = await getMediaMarkingBreakdown(
      ...(await statBounds(params))
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

async function getDiscordContextMetrics(params: GetStatsParams) {
  await requireAdmin()

  try {
    const metrics = await getContextMetrics(
      ...(await statBounds(params))
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

async function getDiscordErrorAnalysis(params: GetStatsParams) {
  await requireAdmin()

  try {
    const analysis = await getErrorAnalysis(await statsWindow(params))

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

async function getDiscordSelectionStats(params: GetStatsParams) {
  await requireAdmin()

  try {
    const stats = await getSelectionMenuStats(
      ...(await statBounds(params))
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

const ALL_MARK_TYPES: MarkType[] = [
  "FINISHED_WATCHING",
  "NOT_INTERESTED",
  "KEEP_FOREVER",
  "REWATCH_CANDIDATE",
  "POOR_QUALITY",
  "WRONG_VERSION",
]

export interface GetMarkedMediaParams {
  markType?: MarkType
  /** "discord" | "web" | undefined (all sources). Matched against markedVia. */
  source?: string
  search?: string
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
}

/**
 * Admin view of the ACTUAL media people have marked, sourced from the
 * `UserMediaMark` table (the source of truth) rather than inferred from command
 * log args. Answers "what did people mark as X?" with a per-type summary plus a
 * filterable, paginated list. Includes marks from every source (Discord + web)
 * with a `markedVia` badge.
 */
export async function getDiscordMarkedMedia(params: GetMarkedMediaParams = {}) {
  await requireAdmin()

  try {
    const range =
      params.startDate && params.endDate ? await statBounds({ startDate: params.startDate, endDate: params.endDate }) : null
    const [startDate, endDate] = range ?? [undefined, undefined]

    // Date range applies to when the mark was made.
    const markedAtFilter: Prisma.DateTimeFilter = {}
    if (startDate) markedAtFilter.gte = startDate
    if (endDate) markedAtFilter.lt = endDate
    const hasDateFilter = startDate != null || endDate != null

    const baseWhere: Prisma.UserMediaMarkWhereInput = {}
    if (hasDateFilter) baseWhere.markedAt = markedAtFilter
    if (params.source === "discord") baseWhere.markedVia = "discord"
    else if (params.source && params.source !== "all") baseWhere.markedVia = params.source

    // Full filter also narrows by type + title search (summary ignores those so
    // the per-type counts always reflect the same date/source scope).
    const listWhere: Prisma.UserMediaMarkWhereInput = { ...baseWhere }
    if (params.markType) listWhere.markType = params.markType
    if (params.search && params.search.trim()) {
      listWhere.title = { contains: params.search.trim(), mode: "insensitive" }
    }

    const limit = params.limit ?? 25
    const offset = params.offset ?? 0

    const [rows, total, byTypeGroups] = await Promise.all([
      prisma.userMediaMark.findMany({
        where: listWhere,
        orderBy: { markedAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      }),
      prisma.userMediaMark.count({ where: listWhere }),
      prisma.userMediaMark.groupBy({
        by: ["markType"],
        where: baseWhere,
        _count: { _all: true },
      }),
    ])

    const countByType = new Map(byTypeGroups.map((g) => [g.markType, g._count._all]))
    const summary = ALL_MARK_TYPES.map((markType) => ({
      markType,
      count: countByType.get(markType) ?? 0,
    }))

    const marks = rows.map((row) => ({
      id: row.id,
      title: row.title,
      year: row.year,
      mediaType: row.mediaType,
      markType: row.markType,
      seasonNumber: row.seasonNumber,
      episodeNumber: row.episodeNumber,
      parentTitle: row.parentTitle,
      note: row.note,
      markedVia: row.markedVia,
      markedAt: row.markedAt,
      radarrTitleSlug: row.radarrTitleSlug,
      sonarrTitleSlug: row.sonarrTitleSlug,
      user: {
        id: row.user.id,
        name: row.user.name,
        email: row.user.email,
        image: row.user.image,
      },
    }))

    return { success: true, marks, total, summary }
  } catch (error) {
    logger.error("Failed to get Discord marked media", error instanceof Error ? error : undefined)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get marked media",
      marks: [],
      total: 0,
      summary: [],
    }
  }
}
