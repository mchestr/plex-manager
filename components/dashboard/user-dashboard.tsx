"use client"

import { ChatProvider } from "@/components/admin/chatbot/chat-context"
import { Chatbot } from "@/components/admin/chatbot/chat-window"
import { DiscordLinkCallout, type DashboardDiscordConnection } from "@/components/discord/link-callout"
import { WrappedHomeButton } from "@/components/wrapped/wrapped-home-button"
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
}

export function UserDashboard({
  userId,
  userName,
  serverName,
  isAdmin,
  discordEnabled,
  discordConnection,
  serverInviteCode,
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
        <header className="w-full p-4 flex items-center justify-end gap-4 z-20">
          {isAdmin && (
            <Link
              href="/admin"
              className="px-4 py-2 text-sm font-medium text-cyan-400 hover:text-cyan-300 transition-colors rounded-lg hover:bg-white/5"
            >
              Admin Dashboard
            </Link>
          )}
          <button
            onClick={handleSignOut}
            className="px-4 py-2 text-sm font-medium text-red-400 hover:text-red-300 transition-colors rounded-lg hover:bg-white/5"
          >
            Sign Out
          </button>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 md:p-12 lg:p-24 pb-20 md:pb-24 -mt-16">
          <div className="z-10 w-full max-w-5xl">
            <div className="w-full max-w-4xl mx-auto space-y-6">
              <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 sm:p-10 shadow-2xl shadow-black/40 ring-1 ring-white/10 backdrop-blur">
                <WrappedHomeButton userId={userId} serverName={serverName} />
              </section>
              {discordEnabled && <DiscordLinkCallout connection={discordConnection} isEnabled={discordEnabled} serverInviteCode={serverInviteCode} />}
            </div>
          </div>
        </main>

        <Chatbot userName={userName} />
      </div>
    </ChatProvider>
  )
}
