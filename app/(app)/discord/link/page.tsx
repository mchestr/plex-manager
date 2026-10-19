import { DiscordLinkPanel } from "@/components/discord/link-panel"
import { authOptions } from "@/lib/auth"
import { getDiscordIntegration, getDiscordLinkStatus } from "@/lib/discord/integration"
import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: "Link Discord",
}

const CONNECT_URL = "/discord/connect?redirect=%2Fdiscord%2Flink"

export default async function DiscordLinkPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect("/")
  }

  const [status, integration] = await Promise.all([
    getDiscordLinkStatus(session.user.id),
    getDiscordIntegration(true),
  ])

  return (
    <main id="main" className="min-h-screen bg-slate-950 px-4 py-12 sm:px-6">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <h1 className="text-3xl font-bold text-white">Discord</h1>
        {/* Only non-secret integration fields cross into the client component. */}
        <DiscordLinkPanel
          connection={status.connection}
          isEnabled={status.isEnabled}
          isOnServer={status.isOnServer}
          connectUrl={CONNECT_URL}
          instructions={integration?.instructions ?? null}
          serverInviteCode={integration?.serverInviteCode ?? null}
        />
      </div>
    </main>
  )
}
