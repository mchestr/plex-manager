import type { Metadata } from "next"
import Link from "next/link"

import { PublicShell } from "@/components/shell/public-shell"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { StatusScreen } from "@/components/ui/status-screen"
import { serverName } from "@/lib/brand"
import { prisma } from "@/lib/prisma"
import { icons } from "@/lib/ui/icons"

export const metadata: Metadata = { title: "Page not found" }

/**
 * The app-wide 404 (ui-design-system 6.7, BP-35): a StatusScreen in
 * PublicShell, with "Ask for help on Discord" when the owner has set a
 * Discord invite code.
 */
export default async function NotFound() {
  const [name, discord] = await Promise.all([
    serverName(),
    prisma.discordIntegration.findUnique({ where: { id: "discord" }, select: { serverInviteCode: true } }),
  ])
  const inviteCode = discord?.serverInviteCode

  return (
    <PublicShell serverName={name}>
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
    </PublicShell>
  )
}
