"use client"

import type { AnnouncementData } from "@/actions/announcements"
import { ChatProvider } from "@/components/admin/chatbot/chat-context"
import { Chatbot } from "@/components/admin/chatbot/chat-window"
import { AnnouncementsCard } from "@/components/dashboard/announcements-card"
import { DiscordCard } from "@/components/dashboard/discord-card"
import { PlexLinkCard } from "@/components/dashboard/plex-link-card"
import { RequestsCard } from "@/components/dashboard/requests-card"
import { WrappedCard } from "@/components/dashboard/wrapped-card"
import type { DashboardDiscordConnection } from "@/components/discord/link-callout"
import { signOut } from "next-auth/react"
import Link from "next/link"
import { useRouter } from "next/navigation"

interface UserDashboardProps {
  userId: string
  userName: string
  serverName: string
  isAdmin: boolean
  discordEnabled: boolean
  discordConnection: DashboardDiscordConnection | null
  serverInviteCode?: string | null
  announcements: AnnouncementData[]
  overseerrUrl?: string | null
}

export function UserDashboard({
  userId,
  userName,
  serverName,
  isAdmin,
  discordEnabled,
  discordConnection,
  serverInviteCode,
  announcements,
  overseerrUrl,
}: UserDashboardProps) {
  const router = useRouter()

  const handleSignOut = async () => {
    await signOut({ redirect: false })
    router.push("/")
    router.refresh()
  }

  return (
    <ChatProvider>
      <div className="relative min-h-screen flex flex-col bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
        {/* Header */}
        <header className="w-full px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between z-20">
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            {serverName}
          </h1>
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
        <main className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 pb-24">
          <div className="w-full max-w-4xl space-y-4">
            {/* Announcements - Only shown when there are announcements */}
            {announcements.length > 0 && (
              <AnnouncementsCard announcements={announcements} />
            )}

            {/* Quick Links - centered, responsive grid */}
            <div className="flex flex-wrap justify-center gap-4">
              <div className="w-full sm:w-auto sm:min-w-[280px] sm:max-w-[320px]">
                <PlexLinkCard serverName={serverName} />
              </div>
              {overseerrUrl && (
                <div className="w-full sm:w-auto sm:min-w-[280px] sm:max-w-[320px]">
                  <RequestsCard url={overseerrUrl} />
                </div>
              )}
              {(serverInviteCode || discordEnabled) && (
                <div className="w-full sm:w-auto sm:min-w-[280px] sm:max-w-[320px]">
                  <DiscordCard
                    connection={discordConnection}
                    serverInviteCode={serverInviteCode}
                  />
                </div>
              )}
            </div>

            {/* Wrapped - Full width row */}
            <WrappedCard userId={userId} />
          </div>
        </main>

        <Chatbot userName={userName} />
      </div>
    </ChatProvider>
  )
}
