import type { LucideIcon } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { StatusScreen } from "@/components/ui/status-screen"
import { icons } from "@/lib/ui/icons"
import type { InviteState } from "@/types/invite"

type VoidedState = Exclude<InviteState, "valid">

interface InviteVoidedProps {
  state: VoidedState
  inviter: string | null
  expiresOn: string | null
  discordInviteCode: string | null
}

const COPY: Record<VoidedState, { icon: LucideIcon; title: string }> = {
  expired: { icon: icons.pending, title: "This invite has expired" },
  "used-up": { icon: icons.invites, title: "This invite has been used up" },
  unknown: { icon: icons.notFound, title: "We couldn't find that invite" },
}

function description({ state, inviter, expiresOn }: InviteVoidedProps): string {
  const ask = inviter ? `Ask ${inviter}, who sent it, for a new link.` : "Ask the person who sent it for a new link."
  switch (state) {
    case "expired":
      return expiresOn ? `It stopped working on ${expiresOn}. ${ask}` : `It has stopped working. ${ask}`
    case "used-up":
      return `Every use of this invite has been taken. ${ask}`
    case "unknown":
      return "The link may be mistyped, or the invite may have been deleted. Ask the person who sent it for a new link."
  }
}

/** The voided headline, which also names the pass's section. */
export function voidedTitle(state: VoidedState): string {
  return COPY[state].title
}

/**
 * The voided pass's main part (UI-40): P10.17's StatusScreen with the state's
 * own headline on `invalid-invite-heading`, the inviter's name, and "Ask on
 * Discord" when the owner set a Discord invite code. There is no "Go to
 * home": the sign-in it leads to is only for people already on the server.
 */
export function InviteVoided(props: InviteVoidedProps) {
  const { icon, title } = COPY[props.state]
  const signIn = (
    <Button
      size="lg"
      variant={props.discordInviteCode ? "ghost" : "secondary"}
      nativeButton={false}
      render={<Link href="/" />}
      data-testid="invite-member-sign-in"
    >
      Already a member? Sign in
    </Button>
  )

  return (
    <div className="flex justify-center">
      <StatusScreen
        icon={icon}
        title={title}
        titleTestId="invalid-invite-heading"
        titleState={props.state}
        description={description(props)}
        primaryAction={
          props.discordInviteCode ? (
            <Button
              size="lg"
              variant="secondary"
              nativeButton={false}
              render={
                <a
                  href={`https://discord.gg/${encodeURIComponent(props.discordInviteCode)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
              data-testid="invite-ask-discord"
            >
              Ask on Discord
              <Icon icon={icons.externalLink} />
            </Button>
          ) : (
            signIn
          )
        }
        secondaryAction={props.discordInviteCode ? signIn : undefined}
      />
    </div>
  )
}
