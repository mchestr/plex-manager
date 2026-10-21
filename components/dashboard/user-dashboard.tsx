"use client"

import type { AnnouncementData } from "@/actions/announcements"
import type { StatusData } from "@/actions/prometheus-status"
import { AnnouncementsCard } from "@/components/dashboard/announcements-card"
import { DiscordCard } from "@/components/dashboard/discord-card"
import { MediaServerLinkCard } from "@/components/dashboard/media-server-link-card"
import { RequestsCard } from "@/components/dashboard/requests-card"
import { StatusFooter } from "@/components/dashboard/status-background"
import type { DashboardDiscordConnection } from "@/types/discord"
import { WatchlistSyncCard } from "@/components/watchlist/sync-settings-card"

interface UserDashboardProps {
  serverName: string
  discordEnabled: boolean
  discordConnection: DashboardDiscordConnection | null
  serverInviteCode?: string | null
  announcements: AnnouncementData[]
  overseerrUrl?: string | null
  prometheusStatus?: StatusData
  renderedAt: string // the server clock, so relative dates hydrate unchanged
  primaryAuthService?: string | null // "plex" or "jellyfin"
  mediaServerUrl?: string | null // URL to the media server
  subscriptionSlot?: React.ReactNode // the link to /membership, for Stripe subscribers
  rewindSlot?: React.ReactNode // the server-rendered RewindCard (P6.9)
}

export function UserDashboard({
  serverName,
  discordEnabled,
  discordConnection,
  serverInviteCode,
  announcements,
  overseerrUrl,
  prometheusStatus,
  renderedAt,
  primaryAuthService,
  mediaServerUrl,
  subscriptionSlot,
  rewindSlot,
}: UserDashboardProps) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8 pb-24">
        <div className="mx-auto w-full max-w-4xl space-y-6 sm:space-y-8">
          {/* Server Name - Front and Center */}
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              {serverName}
            </h1>
          </div>

          {/* Announcements - Only shown when there are announcements */}
          {announcements.length > 0 && (
            <AnnouncementsCard announcements={announcements} now={renderedAt} />
          )}

            {rewindSlot}

            {/* Quick Links - visually separated section */}
            <div className="space-y-3 sm:space-y-4 pt-2">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-1">Quick Links</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <MediaServerLinkCard
                  serverName={serverName}
                  service={primaryAuthService === "jellyfin" ? "jellyfin" : "plex"}
                  serverUrl={mediaServerUrl}
                />
                {overseerrUrl ? (
                  <RequestsCard url={overseerrUrl} />
                ) : (
                  <div className="hidden sm:block" />
                )}
                {(serverInviteCode || discordEnabled) ? (
                  <DiscordCard connection={discordConnection} />
                ) : (
                  <div className="hidden sm:block" />
                )}
              </div>
            </div>

            {/* Features section */}
            <div className="space-y-3 sm:space-y-4 pt-2">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-1">Features</h2>
              <div className="grid grid-cols-1 gap-3 sm:gap-4">
                <WatchlistSyncCard />
              </div>
            </div>

            {/* Membership - a link to /membership, only present for Stripe subscribers */}
            {subscriptionSlot && (
              <div className="space-y-3 sm:space-y-4 pt-2">
                <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-1">Membership</h2>
                {subscriptionSlot}
              </div>
            )}
          </div>
        </div>

      {/* Status Footer */}
      {prometheusStatus && (
        <StatusFooter
          status={prometheusStatus}
          primaryAuthService={primaryAuthService}
        />
      )}
    </div>
  )
}
