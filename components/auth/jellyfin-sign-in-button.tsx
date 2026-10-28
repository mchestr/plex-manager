"use client"

import { signIn } from "next-auth/react"
import { useActionState } from "react"

import { Alert } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/ui/submit-button"
import { isRateLimitedSignInError, RATE_LIMITED_MESSAGE } from "@/lib/security/rate-limit-messages"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("JELLYFIN_SIGN_IN")

export interface JellyfinSignInButtonProps {
  /** Server name to display in messages */
  serverName?: string
  /**
   * Whether to show the privacy disclaimer
   * @default true
   */
  showDisclaimer?: boolean
  /** A same-origin path to land on afterwards; `/` reads it once onboarding is checked */
  callbackUrl?: string
}

interface SignInState {
  error: string | null
  /** The username as typed, re-seeded after an error; the password never is. */
  username: string
}

const IDLE: SignInState = { error: null, username: "" }

/** Signs in through NextAuth's Jellyfin provider; every failure is fixed copy (UI-19). */
async function signInWithJellyfin(form: FormData, callbackUrl: string | undefined): Promise<SignInState> {
  const username = String(form.get("username") ?? "")
  const password = String(form.get("password") ?? "")
  if (!username || !password) return { error: "Enter your username and password.", username }

  try {
    const result = await signIn("jellyfin", { username, password, redirect: false })
    if (result?.ok && !result.error) {
      // Home checks onboarding first, then follows the callback path
      window.location.href = callbackUrl ? `/?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/"
      return { error: null, username }
    }
    if (result?.error) {
      return { error: isRateLimitedSignInError(result.error) ? RATE_LIMITED_MESSAGE : "Incorrect username or password.", username }
    }
    return { error: "Could not sign in. Try again.", username }
  } catch (err) {
    logger.error("Sign-in error", err)
    return { error: "Could not sign in. Check your connection, then try again.", username }
  }
}

/**
 * The Jellyfin sign-in form on the member pass: a `<form action>` with
 * `useActionState` (P10.7). The username is kept after a failed attempt.
 */
export function JellyfinSignInButton({ serverName, showDisclaimer = true, callbackUrl }: JellyfinSignInButtonProps) {
  const [state, formAction] = useActionState((_previous: SignInState, form: FormData) => signInWithJellyfin(form, callbackUrl), IDLE)

  return (
    <div className="w-full max-w-md mx-auto space-y-6" data-testid="jellyfin-sign-in-form">
      <form action={formAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="jellyfin-username">Username</Label>
          <Input
            id="jellyfin-username"
            name="username"
            type="text"
            defaultValue={state.username}
            required
            autoComplete="username"
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? "jellyfin-sign-in-error" : undefined}
            data-testid="jellyfin-username"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="jellyfin-password">Password</Label>
          <Input
            id="jellyfin-password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? "jellyfin-sign-in-error" : undefined}
            data-testid="jellyfin-password"
          />
        </div>

        {state.error && (
          <Alert id="jellyfin-sign-in-error" tone="destructive" data-testid="jellyfin-error">
            {state.error}
          </Alert>
        )}

        <SubmitButton className="w-full" loadingLabel="Signing in" data-testid="jellyfin-submit">
          Sign in with Jellyfin
        </SubmitButton>
      </form>

      {showDisclaimer && (
        <p className="text-xs text-muted-foreground text-center">
          When you sign in, this app can read your {serverName || "Jellyfin"} account information.
        </p>
      )}
    </div>
  )
}
