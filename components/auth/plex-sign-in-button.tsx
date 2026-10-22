"use client"

import { useState } from "react"

import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { startPlexSignIn } from "@/lib/plex-auth"
import { icons } from "@/lib/ui/icons"
import { redirectTo } from "@/lib/utils/navigation"

const START_FAILED = "We couldn't reach Plex. Please try again in a moment."

/**
 * The invite pass's "Accept with Plex" (ui-design-system 6.6): one click
 * starts the PIN on the server with the invite code and goes straight to
 * plex.tv (UI-35). Failures after plex.tv belong to the callback screen.
 */
export function PlexSignInButton({ inviteCode }: { inviteCode: string }) {
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const accept = async () => {
    setStarting(true)
    setError(null)
    try {
      // The PIN and the invite code stay in an httpOnly cookie; only the app.plex.tv URL comes back.
      const started = await startPlexSignIn({ inviteCode })
      if (!started.success) {
        setError(started.error)
        setStarting(false)
        return
      }
      redirectTo(started.data.authUrl)
    } catch {
      // Fixed copy only: an exception's text never reaches the screen
      setError(START_FAILED)
      setStarting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        size="lg"
        className="w-full sm:w-auto sm:min-w-56"
        icon={<Icon icon={icons.signIn} />}
        loading={starting}
        loadingLabel="Opening Plex"
        onClick={accept}
        data-testid="sign-in-with-plex"
      >
        Accept with Plex
      </Button>
      <p className="text-caption text-muted-foreground">You&apos;ll approve access on plex.tv, then come straight back.</p>
      {error && (
        <Alert tone="destructive" data-testid="plex-invite-error">
          {error}
        </Alert>
      )}
    </div>
  )
}
