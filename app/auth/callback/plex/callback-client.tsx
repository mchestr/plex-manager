"use client"

import { FinishingSignIn } from "@/components/auth/finishing-sign-in"
import { Button } from "@/components/ui/button"
import { StatusScreen } from "@/components/ui/status-screen"
import { finishPlexSignIn, pollPlexSignIn, startPlexSignIn } from "@/lib/plex-auth"
import {
  PLEX_SIGN_IN_COPY,
  plexSignInCodeFor,
  type ShownPlexSignInCode,
} from "@/lib/plex-sign-in-codes"
import { icons } from "@/lib/ui/icons"
import { redirectTo } from "@/lib/utils/navigation"
import { signIn } from "next-auth/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

/** plex.tv is asked every 3 s, for up to 5 minutes. */
const POLL_INTERVAL_MS = 3000
const MAX_POLLS = 100

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Finishes a Plex sign-in in the browser that started it. The PIN lives in an
 * httpOnly cookie, so this page only asks whether plex.tv has authorised it,
 * then lets the Plex provider read the token on the server. No token ever
 * reaches this code.
 */
export function PlexCallbackPageClient() {
  const router = useRouter()
  const [code, setCode] = useState<ShownPlexSignInCode | null>(null)
  const startedRef = useRef(false)

  // A real effect: the Plex PIN poll finishes sign-in once, after plex.tv sends the member back
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const complete = async () => {
      // next-auth answers `ok` without a session when its CSRF check fails, so
      // a missing session after `ok` gets one more `signIn`.
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await signIn("plex", { redirect: false })
        if (!result?.ok) {
          const failure = plexSignInCodeFor(result?.error)
          if (failure === "access_denied") {
            router.push("/auth/denied")
          } else {
            setCode(failure)
          }
          return
        }

        const finished = await finishPlexSignIn()
        if (finished.success) {
          // Full page load, so the new session cookie is used everywhere
          redirectTo(finished.data.next)
          return
        }
        if (finished.code !== "UNAUTHENTICATED") {
          redirectTo("/")
          return
        }
      }
      setCode("sign_in_failed")
    }

    const run = async () => {
      try {
        for (let poll = 0; poll < MAX_POLLS; poll++) {
          const result = await pollPlexSignIn()
          if (!result.success) {
            setCode(result.code === "RATE_LIMITED" ? "rate_limited" : "sign_in_failed")
            return
          }
          if (result.data.status === "ready") {
            await complete()
            return
          }
          if (result.data.status === "expired") {
            setCode("plex_pin_expired")
            return
          }
          await wait(POLL_INTERVAL_MS)
        }
        setCode("plex_pin_expired")
      } catch {
        setCode("sign_in_failed")
      }
    }

    void run()
  }, [router])

  if (code) {
    return <CallbackFailure code={code} onRetryFailed={setCode} />
  }

  return <FinishingSignIn data-testid="plex-callback-waiting" />
}

/**
 * "Sign-in didn't finish" and its siblings (ui-design-system 6.6): fixed copy
 * by code, never server text. Try again starts a new PIN at once, keeping the
 * invite code and callback path of the failed one; a refused
 * invite only goes home.
 */
function CallbackFailure({
  code,
  onRetryFailed,
}: {
  code: ShownPlexSignInCode
  onRetryFailed: (code: ShownPlexSignInCode) => void
}) {
  const [restarting, setRestarting] = useState(false)
  const copy = PLEX_SIGN_IN_COPY[code]

  const tryAgain = async () => {
    setRestarting(true)
    try {
      const started = await startPlexSignIn({ retry: true })
      if (started.success) {
        redirectTo(started.data.authUrl)
        return
      }
      onRetryFailed(started.code === "RATE_LIMITED" ? "rate_limited" : "sign_in_failed")
    } catch {
      onRetryFailed("sign_in_failed")
    }
    setRestarting(false)
  }

  const goHome = (
    <Button size="lg" variant={code === "invite_invalid" ? "primary" : "secondary"} nativeButton={false} render={<Link href="/" />} data-testid="plex-callback-home">
      Go to home
    </Button>
  )

  return (
    <div className="flex w-full justify-center" data-testid={`plex-callback-error-${code}`}>
      <StatusScreen
        icon={code === "invite_invalid" ? icons.invites : icons.warning}
        code={code}
        title={copy.title}
        titleTestId="plex-callback-error-heading"
        description={copy.message}
        primaryAction={
          code === "invite_invalid" ? (
            goHome
          ) : (
            <Button size="lg" loading={restarting} loadingLabel="Opening Plex" onClick={tryAgain} data-testid="plex-callback-retry">
              Try again
            </Button>
          )
        }
        secondaryAction={code === "invite_invalid" ? undefined : goHome}
      />
    </div>
  )
}
