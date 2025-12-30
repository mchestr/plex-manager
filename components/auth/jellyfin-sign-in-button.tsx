"use client"

import { Button } from "@/components/ui/button"
import { StyledInput } from "@/components/ui/input"
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
        const errorMsg = result.error === "NO_SERVER_CONFIGURED"
          ? "Jellyfin server is not configured. Please contact your administrator."
          : "Invalid username or password. Please try again."

        setError(errorMsg)
        onError?.(errorMsg)
        setIsLoading(false)
      } else if (result?.ok) {
        onSuccess?.()
        // Redirect to home page to check onboarding status
        window.location.href = "/"
      } else {
        const errorMsg = "An unexpected error occurred. Please try again."
        setError(errorMsg)
        onError?.(errorMsg)
        setIsLoading(false)
      }
    } catch (err) {
      logger.error('Sign-in error', err)
      let errorMsg = "Failed to sign in. Please try again."

      // Provide more specific error messages based on error type
      if (err instanceof Error) {
        if (err.message.includes('fetch')) {
          errorMsg = "Unable to reach the server. Please check your connection."
        } else if (err.message.includes('credentials') || err.message.includes('unauthorized')) {
          errorMsg = "Invalid username or password."
        } else if (err.message) {
          errorMsg = `Failed to sign in: ${err.message}`
        }
      }

      setError(errorMsg)
      onError?.(errorMsg)
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md mx-auto space-y-6" data-testid="jellyfin-sign-in-form">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="jellyfin-username" className="block text-sm font-medium text-cyan-400">
            Username
          </label>
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
          <label htmlFor="jellyfin-password" className="block text-sm font-medium text-cyan-400">
            Password
          </label>
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
          <div
            className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-lg text-sm"
            role="alert"
            data-testid="jellyfin-error"
          >
            {error}
          </div>
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={isLoading}
          data-testid="jellyfin-submit"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              {loadingText}
            </span>
          ) : (
            buttonText
          )}
        </Button>
      </form>

      {showDisclaimer && (
        <p className="text-xs text-slate-400 text-center">
          By signing in, you agree to allow this application to access your {serverName || "Jellyfin"} account information.
        </p>
      )}
    </div>
  )
}
