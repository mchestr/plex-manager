/**
 * Discord Command Audit Logging — write path
 *
 * Functions to log Discord bot interactions to the database when commands
 * start, complete, or execute in a single call. Imported by the bot runtime.
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
