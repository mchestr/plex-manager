"use client"

import { useId, useState } from "react"

import { JellyfinSignInButton } from "@/components/auth/jellyfin-sign-in-button"
import { Monogram, Pass, PassStub } from "@/components/auth/pass"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { startPlexSignIn } from "@/lib/plex-auth"
import { icons } from "@/lib/ui/icons"
import { redirectTo } from "@/lib/utils/navigation"

const START_FAILED = "We couldn't reach Plex. Please try again in a moment."

interface MemberPassProps {
  serverName: string
  /** `monogramFor(serverName)`; null draws the pip-only tile. */
  monogram: string | null
  /** An active Plex server: "Continue with Plex" is the primary action. */
  plex: boolean
  /** A Jellyfin server enabled for login: "Use Jellyfin instead", or the only option without Plex. */
  jellyfin: boolean
  /** A same-origin path (`safeCallbackPath`) to land on after signing in. */
  callbackUrl?: string
  /** `getAssistantDisclosure()`: admins can review assistant conversations, and who processes them (P11.16). */
  assistantDisclosure: string
}

/**
 * The signed-out `/` (ui-design-system 6.6, UI-35): the member pass. One
 * click on "Continue with Plex" starts the PIN on the server and goes
 * straight to plex.tv, with no forced wait. Jellyfin is the secondary option,
 * revealed in place. The copy says the Plex token is kept (GAP-34).
 */
export function MemberPass({ serverName, monogram, plex, jellyfin, callbackUrl, assistantDisclosure }: MemberPassProps) {
  const headingId = useId()
  return (
    <Pass aria-labelledby={headingId} data-testid="member-pass">
      <div className="flex flex-col p-6 sm:p-7">
        <Monogram letter={monogram} />
        <h1 id={headingId} className="mt-5 text-display text-foreground">
          Sign in to {serverName}
        </h1>
        <p className="mt-2 text-lead text-muted-foreground">Members watch, request titles and open their Rewind here.</p>
        {plex ? (
          <PlexOptions serverName={serverName} jellyfin={jellyfin} callbackUrl={callbackUrl} />
        ) : (
          <div className="mt-6">
            <JellyfinSignInButton serverName={serverName} showDisclaimer={false} callbackUrl={callbackUrl} />
          </div>
        )}
        <p className="mt-6 text-caption text-muted-foreground" data-testid="member-pass-privacy">
          Server admins can see your watch activity and your Rewind. Some Rewind text is written by an AI service.{" "}
          {assistantDisclosure}
        </p>
      </div>
      <PassStub>
        <p className="text-label text-muted-foreground">Member pass</p>
        <p className="text-ui font-medium text-foreground">Good for every account on the share</p>
        <p className="text-caption text-muted-foreground">Not a member yet? Ask the server owner for an invite link.</p>
      </PassStub>
    </Pass>
  )
}

function PlexOptions({ serverName, jellyfin, callbackUrl }: Omit<MemberPassProps, "monogram" | "plex" | "assistantDisclosure">) {
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jellyfinOpen, setJellyfinOpen] = useState(false)
  const jellyfinId = useId()

  const continueWithPlex = async () => {
    setStarting(true)
    setError(null)
    try {
      // The PIN, invite and callback path stay in an httpOnly cookie; only the app.plex.tv URL comes back.
      const started = await startPlexSignIn(callbackUrl ? { callbackPath: callbackUrl } : {})
      if (!started.success) {
        setError(started.error)
        setStarting(false)
        return
      }
      redirectTo(started.data.authUrl)
    } catch {
      setError(START_FAILED)
      setStarting(false)
    }
  }

  return (
    <>
      <Button
        size="lg"
        className="mt-6 w-full"
        icon={<Icon icon={icons.signIn} />}
        loading={starting}
        loadingLabel="Opening Plex"
        onClick={continueWithPlex}
        data-testid="sign-in-button"
      >
        Continue with Plex
      </Button>
      <p className="mt-2 text-caption text-muted-foreground" data-testid="member-pass-token-copy">
        You&apos;ll approve access on plex.tv. {serverName} keeps your Plex sign-in token to sync your watchlist and
        accept invites for you.
      </p>
      {error && (
        <Alert tone="destructive" className="mt-4" data-testid="sign-in-error">
          {error}
        </Alert>
      )}
      {jellyfin && (
        <>
          <div className="my-5 flex items-center gap-3 text-caption text-muted-foreground">
            <span aria-hidden="true" className="h-px flex-1 bg-border" />
            or
            <span aria-hidden="true" className="h-px flex-1 bg-border" />
          </div>
          <Button
            size="lg"
            variant="secondary"
            className="w-full"
            icon={<Icon icon={icons.jellyfin} />}
            aria-expanded={jellyfinOpen}
            aria-controls={jellyfinId}
            onClick={() => setJellyfinOpen((open) => !open)}
            data-testid="toggle-jellyfin"
          >
            Use Jellyfin instead
          </Button>
          <div id={jellyfinId} hidden={!jellyfinOpen} className="mt-4">
            {jellyfinOpen && (
              <JellyfinSignInButton serverName={serverName} showDisclaimer={false} callbackUrl={callbackUrl} />
            )}
          </div>
        </>
      )}
    </>
  )
}
