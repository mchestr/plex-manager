import type { LucideIcon } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"

import type { SupportDiscord } from "@/components/guides/support-guide"
import { Icon } from "@/components/ui/icon"
import { icons } from "@/lib/ui/icons"
import type { AuthService } from "@/types/onboarding"

export interface QuickLinksProps {
  /**
   * One entry per linked media server, the member's own first (P11.10): its
   * name and where its web app opens, or a null URL to hide that tile.
   */
  media: { service: AuthService; serverName: string; url: string | null }[]
  /** The request site's public URL, or null. */
  requestsUrl: string | null
  discord: SupportDiscord | null
}

interface QuickLink {
  id: string
  icon: LucideIcon
  title: string
  description: string
  href: string
  external: boolean
}

/** The tiles that can work right now; a missing URL drops its tile, never leaves a gap (UI-38). */
function quickLinksFor({ media, requestsUrl, discord }: QuickLinksProps): QuickLink[] {
  const links: QuickLink[] = []
  for (const server of media) {
    if (!server.url) continue
    const plex = server.service === "plex"
    links.push({
      id: server.service,
      icon: plex ? icons.plex : icons.jellyfin,
      title: plex ? "Watch on Plex" : "Watch on Jellyfin",
      description: plex ? `Open ${server.serverName} in Plex Web` : `Open ${server.serverName}`,
      href: server.url,
      external: true,
    })
  }
  if (requestsUrl) {
    links.push({
      id: "requests",
      icon: icons.requests,
      title: "Request a title",
      description: "Ask for a movie or show that is missing",
      href: requestsUrl,
      external: true,
    })
  }
  if (discord?.linkEnabled) {
    links.push({
      id: "discord",
      icon: icons.discord,
      title: discord.handle ? "Discord" : "Link Discord",
      description: discord.handle ? `Linked as ${discord.handle}` : "Get the Member role on Discord",
      href: "/discord/link",
      external: false,
    })
  }
  if (discord?.inviteUrl) {
    links.push({
      id: "discord-join",
      icon: icons.discord,
      title: "Join the Discord",
      description: "Chat with other members",
      href: discord.inviteUrl,
      external: true,
    })
  }
  return links
}

function Tile({ link }: { link: QuickLink }) {
  const body = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-foreground">
        <Icon icon={link.icon} size={20} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 pr-5 wrap-anywhere">
        <span className="text-ui font-semibold text-foreground">{link.title}</span>
        <span className="text-caption text-muted-foreground">{link.description}</span>
      </span>
      {link.external && <Icon icon={icons.externalLink} className="absolute top-3.5 right-3.5 text-muted-foreground" />}
    </>
  )
  const className =
    "relative flex w-full items-start gap-3 rounded-lg border bg-card p-4 transition-colors duration-(--duration-base) hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
  const testId = `home-quick-link-${link.id}`

  if (!link.external) {
    return (
      <Link href={link.href as Route} className={className} data-testid={testId}>
        {body}
      </Link>
    )
  }
  return (
    <a href={link.href} target="_blank" rel="noopener noreferrer" className={className} data-testid={testId}>
      {body}
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  )
}

/** Home's quick links (UI-38): only tiles that go somewhere, in an auto-fit grid. */
export function QuickLinks(props: QuickLinksProps) {
  const links = quickLinksFor(props)
  if (links.length === 0) return null

  return (
    <section aria-labelledby="home-quick-links-title" className="flex flex-col gap-3" data-testid="home-quick-links">
      <h2 id="home-quick-links-title" className="text-h3 text-foreground">
        Quick links
      </h2>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] sm:gap-3">
        {links.map((link) => (
          <li key={link.id} className="flex">
            <Tile link={link} />
          </li>
        ))}
      </ul>
    </section>
  )
}
