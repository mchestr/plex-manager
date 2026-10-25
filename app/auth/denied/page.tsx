import type { Metadata } from "next"

import { getSetupStatus } from "@/lib/setup/status"
import { DeniedSignOut } from "@/app/auth/denied/denied-sign-out"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { StatusScreen } from "@/components/ui/status-screen"
import { serverName as getServerName } from "@/lib/brand"
import { prisma } from "@/lib/prisma"
import { icons } from "@/lib/ui/icons"
import { redirect } from "next/navigation"

export const metadata: Metadata = { title: "Not a member yet" }

/**
 * A Plex account that signed in but is not on the share (ui-design-system
 * 6.6): a StatusScreen with the invite explanation, "Ask for an invite" on
 * Discord when the owner set an invite code, and Sign out.
 */
export default async function DeniedAccessPage() {
  const { isComplete } = await getSetupStatus()
  if (!isComplete) {
    redirect("/setup")
  }

  const [name, discord] = await Promise.all([
    getServerName(),
    prisma.discordIntegration.findUnique({ where: { id: "discord" }, select: { serverInviteCode: true } }),
  ])
  const inviteCode = discord?.serverInviteCode

  return (
    <div className="flex w-full justify-center" data-testid="access-denied-page">
      <StatusScreen
        icon={icons.invites}
        title={`You're not a member of ${name} yet`}
        titleTestId="access-denied-heading"
        description="This Plex account isn't on the server. Ask the server owner for an invite link, then sign in again."
        primaryAction={
          inviteCode ? (
            <Button
              size="lg"
              nativeButton={false}
              render={<a href={`https://discord.gg/${encodeURIComponent(inviteCode)}`} target="_blank" rel="noopener noreferrer" />}
              data-testid="denied-ask-invite"
            >
              Ask for an invite
              <Icon icon={icons.externalLink} />
            </Button>
          ) : (
            <DeniedSignOut variant="primary" />
          )
        }
        secondaryAction={inviteCode ? <DeniedSignOut variant="secondary" /> : undefined}
      />
    </div>
  )
}
