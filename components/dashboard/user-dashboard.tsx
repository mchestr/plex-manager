"use client"

import type { AnnouncementData } from "@/actions/announcements"
import type { StatusData } from "@/actions/prometheus-status"
import { AnnouncementsCard } from "@/components/dashboard/announcements-card"
import { DiscordCard } from "@/components/dashboard/discord-card"
import { PlexLinkCard } from "@/components/dashboard/plex-link-card"
import { RequestsCard } from "@/components/dashboard/requests-card"
import { StatusFooter } from "@/components/dashboard/status-background"
import { WrappedCard } from "@/components/dashboard/wrapped-card"
import type { DashboardDiscordConnection } from "@/components/discord/link-callout"
import { signOut } from "next-auth/react"
import Link from "next/link"
import { useRouter } from "next/navigation"

interface UserDashboardProps {
  userId: string
  serverName: string
  isAdmin: boolean
  discordEnabled: boolean
  discordConnection: DashboardDiscordConnection | null
  serverInviteCode?: string | null
  announcements: AnnouncementData[]
  overseerrUrl?: string | null
  prometheusStatus?: StatusData
}

export function UserDashboard({
  userId,
  serverName,
  isAdmin,
  discordEnabled,
  discordConnection,
  serverInviteCode,
  announcements,
  overseerrUrl,
  prometheusStatus,
}: UserDashboardProps) {
  const router = useRouter()

  const handleSignOut = async () => {
    await signOut({ redirect: false })
    router.push("/")
    router.refresh()
  }

  return (
    <div className="relative min-h-[100dvh] flex flex-col bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      {/* Header - Navigation only */}
      <header className="sticky top-0 w-full px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-end z-20 bg-slate-900/80 backdrop-blur-sm border-b border-white/5 sm:border-transparent sm:bg-transparent sm:backdrop-blur-none">
        <div className="flex items-center gap-2 sm:gap-4">
          {isAdmin && (
            <Link
              href="/admin"
              className="px-3 sm:px-4 py-2 text-sm font-medium text-cyan-400 hover:text-cyan-300 transition-colors rounded-lg hover:bg-white/5"
              data-testid="admin-dashboard-link"
            >
              <span className="hidden sm:inline">Admin Dashboard</span>
              <span className="sm:hidden">Admin</span>
            </Link>
          )}
          <button
            onClick={handleSignOut}
            className="px-3 sm:px-4 py-2 text-sm font-medium text-red-400 hover:text-red-300 transition-colors rounded-lg hover:bg-white/5"
            data-testid="sign-out-button"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-start sm:items-center justify-center px-4 sm:px-6 lg:px-8 py-4 sm:py-0 pb-24 overflow-y-auto">
        <div className="w-full max-w-4xl space-y-6 sm:space-y-8">
          {/* Server Name - Front and Center */}
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              {serverName}
            </h1>
          </div>

          {/* Announcements - Only shown when there are announcements */}
          {announcements.length > 0 && (
            <AnnouncementsCard announcements={announcements} />
          )}

            {/* Wrapped - Hero callout at the top */}
            <WrappedCard userId={userId} />

            {/* Quick Links - visually separated section */}
            <div className="space-y-3 sm:space-y-4 pt-2">
              <h2 className="text-xs font-medium uppercase tracking-wider text-slate-500 px-1">Quick Links</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <PlexLinkCard serverName={serverName} />
                {overseerrUrl ? (
                  <RequestsCard url={overseerrUrl} />
                ) : (
                  <div className="hidden sm:block" />
                )}
                {(serverInviteCode || discordEnabled) ? (
                  <DiscordCard
                    connection={discordConnection}
                    serverInviteCode={serverInviteCode}
                  />
                ) : (
                  <div className="hidden sm:block" />
                )}
              </div>
            </div>
          </div>
        </main>

      {/* Status Footer */}
      {prometheusStatus && <StatusFooter status={prometheusStatus} />}
    </div>
  )
}
