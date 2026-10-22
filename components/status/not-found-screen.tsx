import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { StatusScreen } from "@/components/ui/status-screen"
import { prisma } from "@/lib/prisma"
import { icons } from "@/lib/ui/icons"

/**
 * The 404 StatusScreen (ui-design-system 6.7, BP-35), with "Ask for help on
 * Discord" when the owner has set a Discord invite code (`notFoundInviteCode`). It brings no shell:
 * the root 404 wraps it in PublicShell, the member 404 sits in AppShell's main.
 */
export function NotFoundScreen({ inviteCode }: { inviteCode?: string | null }) {
  return (
    <StatusScreen
      icon={icons.notFound}
      code="404"
      title="This page doesn't exist"
      description="The link may be old, or the page may have moved."
      primaryAction={
        <Button size="lg" nativeButton={false} render={<Link href="/" />} data-testid="not-found-home">
          Go to home
        </Button>
      }
      secondaryAction={
        inviteCode ? (
          <Button
            size="lg"
            variant="secondary"
            nativeButton={false}
            render={<a href={`https://discord.gg/${encodeURIComponent(inviteCode)}`} target="_blank" rel="noopener noreferrer" />}
            data-testid="not-found-discord"
          >
            Ask for help on Discord
            <Icon icon={icons.externalLink} />
          </Button>
        ) : undefined
      }
    />
  )
}

/** The owner's Discord invite code, for the 404's help action. */
export async function notFoundInviteCode() {
  const discord = await prisma.discordIntegration.findUnique({ where: { id: "discord" }, select: { serverInviteCode: true } })
  return discord?.serverInviteCode ?? null
}
