"use client"

import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { StyledInput } from "@/components/ui/styled-input"
import { isRateLimitedSignInError, RATE_LIMITED_MESSAGE } from "@/lib/security/rate-limit-messages"
import { createLogger } from "@/lib/utils/logger"
import { signIn } from "next-auth/react"
import { FormEvent, useState } from "react"

const logger = createLogger("JELLYFIN_SIGN_IN")

export interface JellyfinSignInButtonProps {
  /**
   * Server name to display in messages
   */
  serverName?: string
  /**
   * Custom submit button text
   * @default "Sign in with Jellyfin"
   */
  buttonText?: string
  /**
   * Custom loading text
   * @default "Signing in..."
   */
  loadingText?: string
  /**
   * Whether to show the privacy disclaimer
   * @default true
   */
  showDisclaimer?: boolean
  /**
   * A same-origin path to land on afterwards; `/` reads it once onboarding is checked
   */
  callbackUrl?: string
  /**
   * Callback fired when sign-in is initiated
   */
  onSignInStart?: () => void
  /**
   * Callback fired when an error occurs
   */
  onError?: (error: string) => void
  /**
   * Callback fired when sign-in succeeds
   */
  onSuccess?: () => void
}

export function JellyfinSignInButton({
  serverName,
  buttonText = "Sign in with Jellyfin",
  loadingText = "Signing in...",
  showDisclaimer = true,
  callbackUrl,
  onSignInStart,
  onError,
  onSuccess,
}: JellyfinSignInButtonProps) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!username || !password) {
      const errorMsg = "Username and password are required"
      setError(errorMsg)
      onError?.(errorMsg)
      return
    }

    setIsLoading(true)
    setError(null)
    onSignInStart?.()

    try {
      const result = await signIn("jellyfin", {
        username,
        password,
        redirect: false,
      })

      if (result?.error) {
        const errorMsg = isRateLimitedSignInError(result.error)
          ? RATE_LIMITED_MESSAGE
          : "Invalid username or password. Please try again."

        setError(errorMsg)
        onError?.(errorMsg)
        setIsLoading(false)
      } else if (result?.ok) {
        onSuccess?.()
        // Home checks onboarding first, then follows the callback path
        window.location.href = callbackUrl ? `/?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/"
      } else {
        const errorMsg = "An unexpected error occurred. Please try again."
        setError(errorMsg)
        onError?.(errorMsg)
        setIsLoading(false)
      }
    } catch (err) {
      logger.error('Sign-in error', err)
      // Fixed copy only: an exception's text never reaches the screen (UI-19)
      const errorMsg = "We couldn't sign you in. Please check your connection and try again."

      setError(errorMsg)
      onError?.(errorMsg)
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md mx-auto space-y-6" data-testid="jellyfin-sign-in-form">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="jellyfin-username">
            Username
          </Label>
          <StyledInput
            id="jellyfin-username"
            name="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your Jellyfin username"
            disabled={isLoading}
            required
            autoComplete="username"
            data-testid="jellyfin-username"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="jellyfin-password">
            Password
          </Label>
          <StyledInput
            id="jellyfin-password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            disabled={isLoading}
            required
            autoComplete="current-password"
            data-testid="jellyfin-password"
          />
        </div>

        {error && (
          <Alert tone="destructive" data-testid="jellyfin-error">
            {error}
          </Alert>
        )}

        <Button
          type="submit"
          className="w-full"
          loading={isLoading}
          loadingLabel={loadingText}
          data-testid="jellyfin-submit"
        >
          {buttonText}
        </Button>
      </form>

      {showDisclaimer && (
        <p className="text-xs text-muted-foreground text-center">
          By signing in, you agree to allow this application to access your {serverName || "Jellyfin"} account information.
        </p>
      )}
    </div>
  )
}
