import "server-only"

import { prisma } from "@/lib/prisma"
import type { DiscordState } from "@/lib/ui/status"

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
 * credentials are saved (never their values), the bot lease's heartbeat, the
 * last hour's commands and the linked members. The page gates the admin.
 */
export async function getDiscordOverview(now = new Date()): Promise<DiscordOverview> {
  const [integration, lock, lastHourCommands, lastCommand, linkedMembers] = await Promise.all([
    prisma.discordIntegration.findUnique({
      where: { id: "discord" },
      select: { isEnabled: true, botEnabled: true, clientId: true, clientSecret: true, botToken: true },
    }),
    prisma.discordBotLock.findUnique({ where: { id: "discord-bot" }, select: { lastRenewedAt: true } }),
    prisma.discordCommandLog.count({ where: { createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) } } }),
    prisma.discordCommandLog.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.discordConnection.count({ where: { revokedAt: null } }),
  ])

  return {
    state: {
      isEnabled: integration?.isEnabled ?? false,
      hasClientCredentials: Boolean(integration?.clientId && integration.clientSecret),
      botEnabled: integration?.botEnabled ?? false,
      hasBotToken: Boolean(integration?.botToken),
      lastRenewedAt: lock?.lastRenewedAt ?? null,
    },
    lastHourCommands,
    lastCommandAt: lastCommand?.createdAt.toISOString() ?? null,
    linkedMembers,
  }
}
