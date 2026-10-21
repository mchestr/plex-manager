import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"

import { DiscordLinkChecklist } from "@/components/discord/link-checklist"
import { authOptions } from "@/lib/auth"
import { serverName } from "@/lib/brand"
import { getDiscordIntegration, getDiscordLinkStatus } from "@/lib/discord/integration"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Link Discord",
}

const CONNECT_URL = "/discord/connect?redirect=%2Fdiscord%2Flink"

export default async function DiscordLinkPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect("/")
  }

  const [status, integration, user, name] = await Promise.all([
    getDiscordLinkStatus(session.user.id),
    getDiscordIntegration(true),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { plexUserId: true, email: true, name: true } }),
    serverName(),
  ])
  const plexAccount = user?.plexUserId ? user.email || user.name || "your Plex account" : null

  return (
    <div className="px-4 py-10 sm:px-6">
      <div className="mx-auto flex w-full max-w-140 flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-h1 text-foreground">Link your Discord account</h1>
          <p className="text-body text-muted-foreground">
            Linking proves you&apos;re a member and gives you the Member role in the {name} Discord.
          </p>
        </div>
        {/* Only non-secret integration fields cross into the client component. */}
        <DiscordLinkChecklist
          plexAccount={plexAccount}
          connection={status.connection}
          isEnabled={status.isEnabled}
          isOnServer={status.isOnServer}
          connectUrl={CONNECT_URL}
          serverName={name}
          instructions={integration?.instructions ?? null}
          serverInviteCode={integration?.serverInviteCode ?? null}
        />
      </div>
    </div>
  )
}
