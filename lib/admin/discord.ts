import "server-only"

import { readGatewayStats } from "@/lib/discord/login-ledger"
import { prisma } from "@/lib/prisma"
import type { DiscordState } from "@/lib/ui/status"

/** The support bot's part of {@link DiscordState}. */
export type DiscordBotStatus = Pick<DiscordState, "botEnabled" | "hasBotToken" | "lastRenewedAt" | "loginBlock">

/**
 * The support bot's row (P11.7): "Turned off", "Waiting for a bot token" or
 * "Online" (or offline) through `discordStatus`. It reads the integration and
 * the `discord-bot` lease row. A token counts when it is saved or set in
 * `DISCORD_BOT_TOKEN`, the same rule the bot's poller starts it by
 * (`isDiscordBotReady`).
 */
export async function getDiscordBotStatus(): Promise<DiscordBotStatus> {
  const [integration, lock, stats] = await Promise.all([
    prisma.discordIntegration.findUnique({ where: { id: "discord" }, select: { botEnabled: true, botToken: true } }),
    prisma.leaseLock.findUnique({ where: { name: "discord-bot" }, select: { lastRenewedAt: true } }),
    readGatewayStats().catch(() => null),
  ])
  return {
    botEnabled: integration?.botEnabled ?? false,
    hasBotToken: Boolean(integration?.botToken || process.env.DISCORD_BOT_TOKEN),
    lastRenewedAt: lock?.lastRenewedAt ?? null,
    loginBlock: stats && stats.health !== "ok" ? stats.health : null,
  }
}

export interface DiscordOverview {
  /** The input to `discordStatus` for the two status rows. */
  state: DiscordState
  /** Commands in the last hour, which move while past windows don't. */
  lastHourCommands: number
  lastCommandAt: string | null
  /** Members with a live (not revoked) Discord link. */
  linkedMembers: number
}

/**
 * The live part of `/admin/discord` (P10.5): the integration flags, whether
 * credentials are saved (never their values), the bot's status, the
 * last hour's commands and the linked members. The page gates the admin.
 */
export async function getDiscordOverview(now = new Date()): Promise<DiscordOverview> {
  const [integration, bot, lastHourCommands, lastCommand, linkedMembers] = await Promise.all([
    prisma.discordIntegration.findUnique({
      where: { id: "discord" },
      select: { isEnabled: true, clientId: true, clientSecret: true },
    }),
    getDiscordBotStatus(),
    prisma.discordCommandLog.count({ where: { createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) } } }),
    prisma.discordCommandLog.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.discordConnection.count({ where: { revokedAt: null } }),
  ])

  return {
    state: {
      isEnabled: integration?.isEnabled ?? false,
      hasClientCredentials: Boolean(integration?.clientId && integration.clientSecret),
      ...bot,
    },
    lastHourCommands,
    lastCommandAt: lastCommand?.createdAt.toISOString() ?? null,
    linkedMembers,
  }
}
