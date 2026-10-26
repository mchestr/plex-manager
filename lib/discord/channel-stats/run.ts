/**
 * The Discord stat channels job: reads Tautulli, then renames the channels an
 * admin assigned, skipping any whose name would not change.
 *
 * ## Steps
 *
 * 1. Read the settings; a scheduled run stops while the job is off.
 * 2. Call `get_activity` and `get_libraries`; work out the server status.
 * 3. For each assigned channel: skip it when its source call failed or its name
 *    is already what the channel was last renamed to; otherwise rename it.
 * 4. A failed rename never stops the next channel. A `429` is counted and left
 *    for the next run; a global `429` ends the run.
 * 5. Remember the names that went through (`Config.discordStatsLastNames`,
 *    keyed by channel id, so choosing another channel renames it at once).
 *
 * @module lib/discord/channel-stats/run
 */

import { z } from "zod"

import { channelsFromConfig } from "@/lib/discord/channel-stats/config"
import { formatChannelName } from "@/lib/discord/channel-stats/format"
import { renameChannel } from "@/lib/discord/channel-stats/rename"
import {
  activitySchema,
  activityValues,
  librariesSchema,
  libraryValues,
  serverStatus,
  STAT_KEYS,
  STATUS_EMOJI,
  type ServerStatus,
  type StatValues,
} from "@/lib/discord/channel-stats/stats"
import { serverName } from "@/lib/brand"
import { tautulliCommand } from "@/lib/connections/tautulli"
import { getDiscordBotToken } from "@/lib/discord/config"
import { getActiveService } from "@/lib/data/active-service"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("DISCORD_CHANNEL_STATS")

export interface ChannelStatsResult {
  status: ServerStatus
  renamed: number
  unchanged: number
  failed: number
  rateLimited: number
  /** Why nothing was renamed, such as a missing bot token. */
  skipped?: string
}

const lastNamesSchema = z.record(z.string(), z.string())

export async function runChannelStats(
  trigger: "scheduled" | "admin",
  { signal }: { signal?: AbortSignal } = {}
): Promise<ChannelStatsResult | null> {
  const config = await prisma.config.findUnique({
    where: { id: "config" },
    select: { discordStatsEnabled: true, discordStatsChannels: true, discordStatsLastNames: true },
  })
  if (trigger === "scheduled" && !config?.discordStatsEnabled) return null

  const tautulli = await getActiveService("tautulli")
  const [activity, libraries] = tautulli
    ? await Promise.all([
        tautulliCommand(tautulli, "get_activity", {}, activitySchema, { signal, attempts: 1 }),
        tautulliCommand(tautulli, "get_libraries", {}, librariesSchema, { signal, attempts: 1 }),
      ])
    : [null, null]

  const status = serverStatus(Boolean(activity?.ok), Boolean(libraries?.ok))
  const values: StatValues = {
    status: STATUS_EMOJI[status],
    ...(activity?.ok ? activityValues(activity.data) : {}),
    ...(libraries?.ok ? libraryValues(libraries.data) : {}),
  }

  const result: ChannelStatsResult = { status, renamed: 0, unchanged: 0, failed: 0, rateLimited: 0 }
  const token = await getDiscordBotToken()
  if (!token) return { ...result, skipped: "No Discord bot token" }

  const channels = channelsFromConfig(config?.discordStatsChannels)
  const server = await serverName()
  const parsedLast = lastNamesSchema.safeParse(config?.discordStatsLastNames)
  const lastNames: Record<string, string> = parsedLast.success ? parsedLast.data : {}
  const next: Record<string, string> = {}
  let stopped = false

  for (const key of STAT_KEYS) {
    const { channelId, format } = channels[key]
    const value = values[key]
    if (!channelId) continue
    const name = value === undefined ? undefined : formatChannelName(format, { server, value })
    if (name === undefined || stopped || signal?.aborted) {
      // Keep what the channel last had, so the next good run compares against it
      if (lastNames[channelId] !== undefined) next[channelId] = lastNames[channelId]
      continue
    }
    if (lastNames[channelId] === name) {
      next[channelId] = name
      result.unchanged++
      continue
    }
    const renamed = await renameChannel(token, channelId, name, { signal })
    if (renamed.ok) {
      next[channelId] = name
      result.renamed++
      continue
    }
    if (lastNames[channelId] !== undefined) next[channelId] = lastNames[channelId]
    if (renamed.code === "RATE_LIMITED") {
      result.rateLimited++
      stopped = renamed.global
    } else {
      result.failed++
    }
  }

  await prisma.config.updateMany({ where: { id: "config" }, data: { discordStatsLastNames: next } })
  logger.info("discord.channel_stats", { ...result })
  return result
}
