import type { LucideIcon } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import type { ReactNode } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { icons } from "@/lib/ui/icons"
import type { AuthService } from "@/types/onboarding"

interface HelpCardProps {
  service: AuthService
  /** The Discord support channel, when the bot watches one; else the card links Help's support section. */
  supportChannelUrl: string | null
}

const rowClass =
  "-mx-2 flex h-9 items-center gap-2.5 rounded-md px-2 text-ui text-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"

function Row({ icon, end, children }: { icon: LucideIcon; end: LucideIcon; children: ReactNode }) {
  return (
    <>
      <Icon icon={icon} className="text-muted-foreground" />
      <span>{children}</span>
      <Icon icon={end} className="ml-auto text-muted-foreground" />
    </>
  )
}

/** Home's help card: the playback guide on `/help`, and where to ask for help. */
export function HelpCard({ service, supportChannelUrl }: HelpCardProps) {
  const app = service === "jellyfin" ? "Jellyfin" : "Plex"

  return (
    <Card aria-labelledby="home-help-title" role="region" data-testid="home-help-card">
      <CardHeader>
        <CardTitle as="h2" id="home-help-title">
          Playback trouble?
        </CardTitle>
        <CardDescription>Buffering or a soft picture usually means your {app} app is limiting quality.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col pt-2.5 pb-4">
        {/* The nav's /help link prefetches the route; with Cache Components, a
            second prefetch for /help#… leaves its request open (Next 16.4) */}
        <Link href={"/help#playback" as Route} prefetch={false} className={rowClass} data-testid="home-help-playback">
          <Row icon={icons.playback} end={icons.internalLink}>
            Revisit the quality guide
          </Row>
        </Link>
        {supportChannelUrl ? (
          <a
            href={supportChannelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={rowClass}
            data-testid="home-help-support"
          >
            <Row icon={icons.discord} end={icons.externalLink}>
              Ask in the support channel on Discord<span className="sr-only"> (opens in a new tab)</span>
            </Row>
          </a>
        ) : (
          <Link href={"/help#support" as Route} prefetch={false} className={rowClass} data-testid="home-help-support">
            <Row icon={icons.info} end={icons.internalLink}>
              Report a problem
            </Row>
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
