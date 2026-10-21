import type { Route } from "next"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { icons } from "@/lib/ui/icons"

/** The server's Discord, when an admin has set any of it up. */
export interface SupportDiscord {
  /** Account linking is on: the member can link (or has linked) Discord. */
  linkEnabled: boolean
  /** The linked Discord username, or null when not linked. */
  handle: string | null
  /** `https://discord.gg/{code}` when an invite code is set. */
  inviteUrl: string | null
  /** The support channel on the server, when the bot watches one. */
  supportChannelUrl: string | null
}

interface SupportGuideProps {
  /** Null when Discord is not set up: only the reporting guidance shows. */
  discord: SupportDiscord | null
  /** Where "Link Discord" goes; onboarding passes its own return path. Default `/discord/link`. */
  linkHref?: Route
  /** The admin's server notes for Discord, shown as plain text. */
  instructions?: string | null
}

function ExternalButton({ href, children, testId }: { href: string; children: string; testId: string }) {
  return (
    <Button
      variant="secondary"
      size="sm"
      nativeButton={false}
      render={<a href={href} target="_blank" rel="noopener noreferrer" />}
      data-testid={testId}
    >
      {children}
      <Icon icon={icons.externalLink} />
      <span className="sr-only">(opens in a new tab)</span>
    </Button>
  )
}

/**
 * How to report a problem, and the Discord support channel (6.1). Shared by
 * Help and onboarding. With Discord off only the Discord block hides; there
 * is no "coming soon". Server-safe: no hooks and no server imports.
 */
export function SupportGuide({ discord, linkHref = "/discord/link", instructions }: SupportGuideProps) {
  const hasDiscordActions = discord && (discord.linkEnabled || discord.inviteUrl || discord.supportChannelUrl)

  return (
    <div className="flex flex-col gap-4 text-ui text-foreground" data-testid="support-guide">
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground">
          Trouble with playback, subtitles or a missing episode? Tell us and we will fix it as soon as we can.
        </p>
        <p className="text-muted-foreground">
          Include the title, the episode if it is a show, the device you watch on and what went wrong.
        </p>
      </div>

      {hasDiscordActions && (
        <div className="flex flex-col gap-3 rounded-md border bg-muted p-4" data-testid="support-guide-discord">
          <p>
            {discord.supportChannelUrl
              ? "The fastest way to get help is the support channel on Discord."
              : "Get help and outage news on Discord."}
            {discord.handle && ` You are linked as ${discord.handle}.`}
          </p>
          <div className="flex flex-wrap gap-2">
            {discord.supportChannelUrl && (
              <ExternalButton href={discord.supportChannelUrl} testId="support-guide-channel">
                Open the support channel
              </ExternalButton>
            )}
            {discord.inviteUrl && (
              <ExternalButton href={discord.inviteUrl} testId="support-guide-join">
                Join the Discord server
              </ExternalButton>
            )}
            {discord.linkEnabled && !discord.handle && (
              <Button
                variant="secondary"
                size="sm"
                nativeButton={false}
                render={<Link href={linkHref} />}
                data-testid="support-guide-link-discord"
              >
                Link Discord
              </Button>
            )}
          </div>
          {instructions && (
            <p className="whitespace-pre-line text-caption text-muted-foreground" data-testid="support-guide-notes">
              {instructions}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
