/**
 * Discord Command Audit — error and interaction metrics
 *
 * Failure analysis plus selection-menu and help-command usage breakdowns.
 */

import { prisma } from "@/lib/prisma"
import type {
  DiscordCommandStatus,
  DiscordCommandType,
} from "@/lib/generated/prisma/client"
import { dateRangeWhere, toDateKey } from "../query-helpers"

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

/**
 * Get error analysis
 */
export async function getErrorAnalysis(
  startDate: Date,
  endDate: Date
): Promise<ErrorAnalysis> {
  const where = {
    status: { in: ["FAILED", "TIMEOUT"] as DiscordCommandStatus[] },
    ...dateRangeWhere(startDate, endDate),
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
    const dateKey = toDateKey(log.createdAt)
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

export interface SelectionMenuStats {
  totalSelections: number
  selectionsByNumber: { selection: string; count: number }[]
  successRate: number
  avgResponseTimeMs: number | null
}

/**
 * Get selection menu statistics
 */
export async function getSelectionMenuStats(
  startDate: Date,
  endDate: Date
): Promise<SelectionMenuStats> {
  const where = {
    commandType: "SELECTION" as DiscordCommandType,
    ...dateRangeWhere(startDate, endDate),
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
    successRate:
      totalSelections > 0 ? (successCount / totalSelections) * 100 : 0,
    avgResponseTimeMs: avgResponse._avg.responseTimeMs,
  }
}

export interface HelpCommandStats {
  totalHelpRequests: number
  helpByTopic: { topic: string; count: number }[]
  generalHelpCount: number
  specificHelpCount: number
}

/**
 * Get help command statistics
 */
export async function getHelpCommandStats(
  startDate: Date,
  endDate: Date
): Promise<HelpCommandStats> {
  const where = {
    commandType: "HELP" as DiscordCommandType,
    ...dateRangeWhere(startDate, endDate),
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
