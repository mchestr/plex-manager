import type { LucideIcon } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import type { ReactNode } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { icons } from "@/lib/ui/icons"

interface HelpCardProps {
  /** The Discord support channel, when the bot watches one; else the card links Help's support section. */
  supportChannelUrl: string | null
  /** Problem reports are on: a row links to `/report`, in place of Help's support section. */
  reportsEnabled: boolean
}

const rowClass =
  "-mx-2 flex min-h-9 items-center gap-2.5 rounded-md px-2 py-1.5 text-ui text-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"

function Row({ icon, end, children }: { icon: LucideIcon; end: LucideIcon; children: ReactNode }) {
  return (
    <>
      <Icon icon={icon} className="text-muted-foreground" />
      <span>{children}</span>
      <Icon icon={end} className="ml-auto text-muted-foreground" />
    </>
  )
}

/** Home's help card: the playback guide on `/help`, reporting a problem, and where to ask for help. */
export function HelpCard({ supportChannelUrl, reportsEnabled }: HelpCardProps) {
  return (
    <Card aria-labelledby="home-help-title" role="region" data-testid="home-help-card">
      <CardHeader>
        <CardTitle as="h2" id="home-help-title">
          Playback trouble?
        </CardTitle>
        <CardDescription>Buffering or a soft picture usually means your Plex app is limiting quality.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col pt-2.5 pb-4">
        <Link href={"/help#playback" as Route} className={rowClass} data-testid="home-help-playback">
          <Row icon={icons.playback} end={icons.internalLink}>
            Open the quality guide
          </Row>
        </Link>
        {reportsEnabled && (
          <Link href={"/report" as Route} className={rowClass} data-testid="home-help-report">
            <Row icon={icons.problemReport} end={icons.internalLink}>
              Report a problem
            </Row>
          </Link>
        )}
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
          !reportsEnabled && (
            <Link href={"/help#support" as Route} className={rowClass} data-testid="home-help-support">
              <Row icon={icons.info} end={icons.internalLink}>
                Report a problem
              </Row>
            </Link>
          )
        )}
      </CardContent>
    </Card>
  )
}
