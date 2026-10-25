/**
 * Everything the signed-in home page needs, read on the server in one pass
 * (P10.21), so the page has no client fetch waterfall.
 *
 * ## Links
 *
 * - Watch on Plex opens the server in Plex Web by its machine id (cached for
 *   24 hours under the `plex-identity` tag), else `{publicUrl}/web`.
 * - Jellyfin members get the active Jellyfin row's own name and
 *   `publicUrl ?? url`, whether or not it signs members in; without a URL
 *   the tile hides (GAP-29).
 * - One media tile per linked service (P11.10), the member's own first, so a
 *   member with both accounts sees both.
 * - Requests use Overseerr's public URL only (SEC-57), through `getHelpData`.
 *
 * @module lib/member/home-data
 */

import "server-only"

import { getActiveAnnouncements, type AnnouncementData } from "@/actions/announcements"
import { getPrometheusStatus, type StatusData } from "@/actions/prometheus-status"
import { getWatchlistSyncSettings } from "@/actions/watchlist"
import type { QuickLinksProps } from "@/components/dashboard/quick-links"
import type { WatchlistSyncSettings } from "@/hooks/use-watchlist-sync"
import { serverName as getServerName } from "@/lib/brand"
import { getHelpData } from "@/lib/member/help"
import { memberServices } from "@/lib/members/service"
import { prisma } from "@/lib/prisma"
import { plexServerId } from "@/lib/rewind/item-links"
import { getFormatSettings } from "@/lib/settings/app-settings"
import { safeHref } from "@/lib/ui/markdown"
import { formatDate, type FormatSettings } from "@/lib/utils/format"
import { normalizeTimeZone, zonedParts } from "@/lib/utils/zoned-time"
import type { AuthService } from "@/types/onboarding"
import { getActiveService } from "@/lib/data/active-service"

/** Home shows the three announcements at the top of the list; `/announcements` has the rest. */
const HOME_ANNOUNCEMENTS = 3

const UNCONFIGURED: StatusData = { isConfigured: false, serviceName: "", segments: [], overallStatus: "unknown" }

export interface HomeData {
  serverName: string
  /** "Good evening, Morgan" */
  greeting: string
  /** "You've been watching on Northfield Plex since March 2024." */
  since: string
  service: AuthService
  announcements: AnnouncementData[]
  announcementsSeenAt: Date | null
  quickLinks: QuickLinksProps
  watchlist: WatchlistSyncSettings | null
  hasSubscription: boolean
  supportChannelUrl: string | null
  uptime: StatusData
  format: FormatSettings
}

/**
 * "Good morning" from 5 am, "Good afternoon" from noon, "Good evening" from
 * 6 pm, by the member's wall clock.
 * @internal
 */
export function greetingFor(now: Date, timeZone: string, name: string | null): string {
  const { hour } = zonedParts(now.getTime(), timeZone)
  const part = hour >= 5 && hour < 12 ? "morning" : hour >= 12 && hour < 18 ? "afternoon" : "evening"
  const first = name?.trim().split(/\s+/)[0]
  return first ? `Good ${part}, ${first}` : `Good ${part}`
}

/**
 * Where Watch on Plex goes: the server in Plex Web by its machine id, else
 * the server's own `{publicUrl}/web`, else null (the tile hides).
 * @internal
 */
export async function plexWebUrl(publicUrl: string | null): Promise<string | null> {
  const id = await plexServerId().catch(() => null)
  if (id) return `https://app.plex.tv/desktop/#!/media/${encodeURIComponent(id)}/com.plexapp.plugins.library`
  const base = safeHref(publicUrl)
  return base ? `${base.replace(/\/+$/, "")}/web` : null
}

/**
 * The Jellyfin tile: the active row's own name and `publicUrl ?? url`, with
 * no `enabledForLogin` filter.
 * @internal
 */
export async function jellyfinLink(): Promise<{ name: string; url: string | null } | null> {
  const row = await prisma.jellyfinServer.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { name: true, url: true, publicUrl: true },
  })
  if (!row) return null
  return { name: row.name, url: safeHref(row.publicUrl ?? row.url) }
}

type MediaLink = QuickLinksProps["media"][number]

async function mediaLink(service: AuthService, serverName: string): Promise<MediaLink> {
  if (service === "jellyfin") {
    const jellyfin = await jellyfinLink()
    return { service, serverName: jellyfin?.name ?? serverName, url: jellyfin?.url ?? null }
  }
  const plex = await getActiveService("plex")
  return { service, serverName, url: plex ? await plexWebUrl(plex.publicUrl) : null }
}

export async function getHomeData(userId: string, now: Date = new Date()): Promise<HomeData> {
  const [user, help, serverName, format, announcementsResult, uptimeResult, watchlistResult, subscription] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, timezone: true, createdAt: true, announcementsSeenAt: true, plexUserId: true, jellyfinUserId: true },
      }),
      getHelpData(userId),
      getServerName(),
      getFormatSettings(),
      getActiveAnnouncements(),
      getPrometheusStatus(),
      getWatchlistSyncSettings(),
      prisma.subscription.findUnique({ where: { userId }, select: { id: true } }),
    ])

  const zone = normalizeTimeZone(user?.timezone) ?? format.timeZone
  const others = (user ? memberServices(user) : []).filter((service) => service !== help.service)
  const [media, otherMedia] = await Promise.all([
    mediaLink(help.service, serverName),
    Promise.all(others.map((service) => mediaLink(service, serverName))),
  ])

  return {
    serverName,
    greeting: greetingFor(now, zone, user?.name ?? null),
    since: `You've been watching on ${media.serverName} since ${formatDate(user?.createdAt ?? now, "month-year", { ...format, timeZone: zone })}.`,
    service: help.service,
    announcements: announcementsResult.success ? announcementsResult.data.slice(0, HOME_ANNOUNCEMENTS) : [],
    announcementsSeenAt: user?.announcementsSeenAt ?? null,
    quickLinks: { media: [media, ...otherMedia], requestsUrl: help.requestsUrl, discord: help.discord },
    watchlist: watchlistResult.success ? watchlistResult.data : null,
    hasSubscription: Boolean(subscription),
    supportChannelUrl: help.discord?.supportChannelUrl ?? null,
    uptime: uptimeResult.success ? uptimeResult.data : UNCONFIGURED,
    format,
  }
}
