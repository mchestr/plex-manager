/**
 * Discord Command Audit — command log reader
 *
 * Paginated, filterable access to raw command log rows. Backs the activity
 * log table in the /admin/discord dashboard.
 */

import { prisma } from "@/lib/prisma"
import type {
  DiscordCommandLog,
  DiscordCommandStatus,
  DiscordCommandType,
} from "@/lib/generated/prisma/client"

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

/**
 * Get recent command logs with optional filtering
 */
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
