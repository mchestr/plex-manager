import "server-only"

import type { SupportDiscord } from "@/components/guides/support-guide"
import { serverName as getServerName } from "@/lib/brand"
import { primaryService } from "@/lib/members/service"
import { getProblemReportSettings } from "@/lib/problem-reports/settings"
import { prisma } from "@/lib/prisma"
import { safeHref } from "@/lib/ui/markdown"
import type { AuthService } from "@/types/onboarding"
import { getActiveService } from "@/lib/data/active-service"

/** What `/help` (and the onboarding guides, P10.23) need for one member. */
export interface HelpData {
  service: AuthService
  /** The app's server name. */
  serverName: string
  /** The request site's public URL, or null, which hides the requests guide. */
  requestsUrl: string | null
  discord: SupportDiscord | null
  instructions: string | null
  /** Problem reports are on, so help links to `/report`. */
  reportsEnabled: boolean
}

/**
 * Reads the member's service and the configured help destinations. Members
 * get public URLs only (SEC-57): an Overseerr row without `publicUrl` hides
 * the requests guide rather than leaking its internal address.
 */
export async function getHelpData(userId: string): Promise<HelpData> {
  const [user, overseerr, integration, connection, reports] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { primaryAuthService: true, plexUserId: true },
    }),
    getActiveService("overseerr"),
    prisma.discordIntegration.findUnique({
      where: { id: "discord" },
      select: {
        isEnabled: true,
        clientId: true,
        clientSecret: true,
        guildId: true,
        supportChannelId: true,
        serverInviteCode: true,
        instructions: true,
      },
    }),
    prisma.discordConnection.findUnique({ where: { userId }, select: { username: true } }),
    getProblemReportSettings(),
  ])

  const service: AuthService = user ? primaryService(user) : "plex"
  const serverName = await getServerName()

  return {
    service,
    serverName,
    requestsUrl: safeHref(overseerr?.publicUrl),
    discord: supportDiscord(integration, connection?.username ?? null),
    instructions: integration?.instructions ?? null,
    reportsEnabled: reports.enabled,
  }
}

type Integration = {
  isEnabled: boolean
  clientId: string | null
  clientSecret: string | null
  guildId: string | null
  supportChannelId: string | null
  serverInviteCode: string | null
} | null

function supportDiscord(integration: Integration, handle: string | null): SupportDiscord | null {
  if (!integration) return null
  const linkEnabled = Boolean(integration.isEnabled && integration.clientId && integration.clientSecret)
  const inviteUrl = integration.serverInviteCode
    ? `https://discord.gg/${encodeURIComponent(integration.serverInviteCode)}`
    : null
  const supportChannelUrl =
    integration.guildId && integration.supportChannelId
      ? `https://discord.com/channels/${encodeURIComponent(integration.guildId)}/${encodeURIComponent(integration.supportChannelId)}`
      : null
  if (!linkEnabled && !inviteUrl && !supportChannelUrl) return null
  return { linkEnabled, handle: linkEnabled ? handle : null, inviteUrl, supportChannelUrl }
}
