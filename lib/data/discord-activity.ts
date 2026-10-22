/**
 * `/admin/discord`'s reads (P11.5, BP-06, DUP-06): one loader, one admin
 * check and one session read per page load, instead of five `'use server'`
 * wrappers that each looked the session up again.
 *
 * Each figure is read on its own: one that fails is logged and comes back
 * empty (null or `[]`), so a broken query blanks its card, not the page.
 *
 * @module lib/data/discord-activity
 */

import "server-only"

import { z } from "zod"

import { assertAdmin } from "@/lib/admin"
import {
  getAccountLinkingMetrics,
  getActiveUsers,
  getCommandLogs,
  getCommandStats,
  getContextMetrics,
  getDailyActivity,
  getErrorAnalysis,
  getHelpCommandStats,
  getMediaMarkingBreakdown,
  getSelectionMenuStats,
  getSummaryStats,
} from "@/lib/discord/audit"
import { MarkType, type Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { dayWindow } from "@/lib/utils/day-window"
import { createLogger } from "@/lib/utils/logger"
import { serverZone } from "@/lib/utils/server-zone"

const logger = createLogger("DISCORD_DASHBOARD")

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD day")

/** A URL value that must be one of `options`; anything else reads as unset. */
const lenient = <const T extends readonly [string, ...string[]]>(options: T) =>
  z
    .string()
    .optional()
    .transform((value) => z.enum(options).safeParse(value).data)

/**
 * The page's inputs: an inclusive day range in the server zone, and the
 * marked-media filters from the URL. A mark type or source the URL got wrong
 * is ignored rather than refused.
 */
export const discordDashboardInput = z.object({
  startDate: dayKey,
  endDate: dayKey,
  markType: lenient(Object.values(MarkType) as [MarkType, ...MarkType[]]),
  source: lenient(["all", "discord", "web"]),
  search: z.string().trim().max(200).optional(),
  marksOffset: z.number().int().min(0).max(100_000).default(0),
  marksLimit: z.number().int().min(10).max(100).default(25),
  recentLimit: z.number().int().min(1).max(100).default(20),
})

export type DiscordDashboardInput = z.input<typeof discordDashboardInput>

/** A figure, or `fallback` when its query fails. */
async function settle<T, F>(label: string, read: () => Promise<T>, fallback: F): Promise<T | F> {
  try {
    return await read()
  } catch (error) {
    logger.error(`Failed to load ${label}`, error)
    return fallback
  }
}

const ALL_MARK_TYPES = Object.values(MarkType)

/**
 * What members marked (the `UserMediaMark` table, every source): a per-type
 * summary over the date and source scope, and one filtered page of marks.
 */
async function markedMedia(
  input: z.output<typeof discordDashboardInput>,
  [gte, lt]: [Date, Date]
) {
  const baseWhere: Prisma.UserMediaMarkWhereInput = { markedAt: { gte, lt } }
  if (input.source && input.source !== "all") baseWhere.markedVia = input.source

  // The summary ignores the type and title search, so its counts share the list's scope
  const listWhere: Prisma.UserMediaMarkWhereInput = { ...baseWhere }
  if (input.markType) listWhere.markType = input.markType
  if (input.search) listWhere.title = { contains: input.search, mode: "insensitive" }

  const [rows, total, byTypeGroups] = await Promise.all([
    prisma.userMediaMark.findMany({
      where: listWhere,
      orderBy: { markedAt: "desc" },
      take: input.marksLimit,
      skip: input.marksOffset,
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
    }),
    prisma.userMediaMark.count({ where: listWhere }),
    prisma.userMediaMark.groupBy({ by: ["markType"], where: baseWhere, _count: { _all: true } }),
  ])

  const countByType = new Map(byTypeGroups.map((group) => [group.markType, group._count._all]))
  return {
    total,
    summary: ALL_MARK_TYPES.map((markType) => ({ markType, count: countByType.get(markType) ?? 0 })),
    marks: rows.map((row) => ({
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
      user: { id: row.user.id, name: row.user.name, email: row.user.email, image: row.user.image },
    })),
  }
}

/**
 * Everything `/admin/discord` shows for a period (admin only): the summary,
 * daily series, command and member tables, the detailed breakdowns, the
 * latest commands and one page of marked media.
 *
 * @throws the `PM_FORBIDDEN` or `PM_UNAUTHENTICATED` error from {@link assertAdmin}, or a ZodError for a malformed range
 */
export async function getDiscordDashboardData(raw: DiscordDashboardInput) {
  await assertAdmin()
  const input = discordDashboardInput.parse(raw)

  // React 19 serializes Date across the RSC boundary, so rows keep theirs (P10.7)
  const window = dayWindow({ from: input.startDate, to: input.endDate }, await serverZone())
  const bounds: [Date, Date] = [window.gte, window.lt]

  const [summary, dailyActivity, commandStats, activeUsers, help, linking, marking, context, errors, selection, logs, marks] =
    await Promise.all([
      settle("the summary", () => getSummaryStats(...bounds), null),
      settle("the daily activity", () => getDailyActivity(window), []),
      settle("the command stats", () => getCommandStats(...bounds), []),
      settle("the active members", () => getActiveUsers(...bounds, 10), []),
      settle("the help stats", () => getHelpCommandStats(...bounds), null),
      settle("the linking metrics", () => getAccountLinkingMetrics(window.gte, window.lt, window.zone), null),
      settle("the marking breakdown", () => getMediaMarkingBreakdown(...bounds), null),
      settle("the context metrics", () => getContextMetrics(...bounds), null),
      settle("the error analysis", () => getErrorAnalysis(window), null),
      settle("the selection stats", () => getSelectionMenuStats(...bounds), null),
      settle("the recent commands", () => getCommandLogs({ limit: input.recentLimit, offset: 0 }), { logs: [], total: 0 }),
      settle("the marked media", () => markedMedia(input, bounds), null),
    ])

  return {
    window,
    summary,
    dailyActivity,
    commandStats,
    activeUsers,
    detailed: {
      helpStats: help,
      linkingMetrics: linking,
      mediaMarkingBreakdown: marking,
      contextMetrics: context,
      errorAnalysis: errors,
      selectionStats: selection,
    },
    recent: logs,
    markedMedia: marks,
  }
}
