import { JellyfinSignInForm } from "@/components/auth/jellyfin-sign-in-form"
import { Monogram, Pass, PassStub } from "@/components/auth/pass"
import { PlexSignInButton } from "@/components/auth/plex-sign-in-button"
import { InviteVoided, voidedTitle } from "@/components/invite/invite-voided"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { affiliateInviteHeadline } from "@/lib/affiliates/copy"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"
import type { InvitePassData } from "@/types/invite"

export interface InvitePassProps extends InvitePassData {
  /** The owner's Discord invite code: voided passes offer "Ask on Discord". */
  discordInviteCode?: string | null
  /** P10.1's admin preview: the accept action is drawn but inert. */
  preview?: boolean
}

const HEADING_ID = "invite-pass-heading"

/**
 * The invite as a ticket (ui-design-system 6.6, UI-36, UI-40). The main part
 * names the inviter and the server, lists the libraries and holds the accept
 * action: `PlexSignInButton` for Plex, `JellyfinSignInForm` for Jellyfin. An
 * affiliate invite puts the affiliate in the headline itself ("Sam invited you
 * to …"). The stub shows the code in mono, the uses left, the expiry and the
 * monogram.
 *
 * Expired, used-up, unusable and unknown invites draw a voided pass: a
 * StatusScreen with their own headline, the code struck through and the stub
 * muted.
 * No client directive: the accept actions are the only client islands.
 */
export function InvitePass(props: InvitePassProps) {
  const voided = props.state !== "valid"
  return (
    <Pass
      aria-labelledby={voided ? undefined : HEADING_ID}
      aria-label={props.state === "valid" ? undefined : voidedTitle(props.state)}
      data-testid="invite-pass"
      data-state={props.state}
    >
      <div className="flex min-w-0 flex-col p-6 sm:p-7">
        {props.state !== "valid" ? (
          <InviteVoided
            state={props.state}
            inviter={props.inviter}
            expiresOn={props.expiresOn}
            discordInviteCode={props.discordInviteCode ?? null}
          />
        ) : (
          <ValidMain {...props} />
        )}
      </div>
      <InviteStub {...props} voided={voided} />
    </Pass>
  )
}

function ValidMain({ code, serverType, kind, serverName, inviter, libraries, preview }: InvitePassProps) {
  const plex = serverType === "PLEX"
  const affiliate = kind === "AFFILIATE"
  return (
    <>
      {inviter && !affiliate && (
        <p className="mb-4 flex items-center gap-2.5 text-ui text-muted-foreground" data-testid="invite-pass-inviter">
          <span
            aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-full bg-secondary text-caption font-medium text-foreground"
          >
            {initials(inviter)}
          </span>
          {inviter} invited you
        </p>
      )}
      <h1 id={HEADING_ID} className="text-display text-foreground" data-testid="valid-invite-heading">
        {affiliate ? affiliateInviteHeadline(inviter, serverName) : <>You&apos;re invited to {serverName}</>}
      </h1>
      <p className="mt-2.5 max-w-[46ch] text-body text-muted-foreground">
        {plex
          ? "Accept the invite to watch its libraries."
          : "Choose a username and password for your new Jellyfin account."}
      </p>
      {libraries.length > 0 && (
        <ul aria-label="Libraries in this invite" className="mt-4 flex flex-wrap gap-1.5" data-testid="invite-pass-libraries">
          {libraries.map((library) => (
            <li key={library}>
              <Badge variant="neutral">{library}</Badge>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6">
        {preview ? (
          <Button size="lg" disabled icon={<Icon icon={plex ? icons.signIn : icons.jellyfin} />} data-testid="invite-pass-preview-accept">
            {plex ? "Accept with Plex" : "Create account"}
          </Button>
        ) : plex ? (
          <div data-testid="plex-invite-sign-in">
            <PlexSignInButton inviteCode={code} />
          </div>
        ) : (
          <JellyfinSignInForm data-testid="jellyfin-invite-form" inviteCode={code} serverName={serverName} />
        )}
      </div>
    </>
  )
}

function InviteStub({ state, code, serverType, monogram, usesLeft, expiresOn, voided }: InvitePassProps & { voided: boolean }) {
  return (
    <PassStub voided={voided} className="gap-4" data-testid="invite-pass-stub">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-label text-muted-foreground">Invite code</p>
          <p
            className={cn(
              "mt-1 font-mono text-h3 font-semibold tracking-wider break-all",
              voided ? "text-muted-foreground line-through decoration-[1.5px]" : "text-foreground",
            )}
            data-testid="invite-pass-code"
          >
            {code || "Unknown"}
          </p>
        </div>
        {state !== "unknown" && (
          <dl className="flex gap-6 text-ui">
            {usesLeft && (
              <div>
                <dt className="text-muted-foreground">Uses left</dt>
                <dd className="font-medium text-foreground tabular-nums" data-testid="invite-pass-uses">
                  {usesLeft.left} of {usesLeft.total}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">{state === "expired" ? "Ended" : "Expires"}</dt>
              <dd className="font-medium text-foreground tabular-nums" data-testid="invite-pass-expiry">
                {expiresOn ?? "Never"}
              </dd>
            </div>
          </dl>
        )}
      </div>
      <div className="flex items-center gap-2.5">
        <Monogram letter={monogram} size="sm" />
        <span className="text-caption text-muted-foreground">
          For one {serverType === "JELLYFIN" ? "Jellyfin" : "Plex"} account
        </span>
      </div>
    </PassStub>
  )
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase() ?? "")
    .join("")
}
