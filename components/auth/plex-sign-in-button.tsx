"use client"

import { Button } from "@/components/ui/button"
import { createPlexAuthUrl, createPlexPin } from "@/lib/plex-auth"
import { useEffect, useState } from "react"

export interface PlexSignInButtonProps {
  /**
   * Optional invite code to include in the auth URL
   */
  inviteCode?: string
  /**
   * Whether to show a warning message before redirecting
   * @default false
   */
  showWarning?: boolean
  /**
   * Delay in milliseconds before redirecting (only used if showWarning is true)
   * @default 5000
   */
  warningDelay?: number
  /**
   * Server name to display in messages
   */
  serverName?: string
  /**
   * Custom button text
   * @default "Sign in with Plex"
   */
  buttonText?: string
  /**
   * Custom loading text
   * @default "Connecting..."
   */
  loadingText?: string
  /**
   * Custom button className
   */
  buttonClassName?: string
  /**
   * Whether to show the privacy disclaimer
   * @default true
   */
  showDisclaimer?: boolean
  /**
   * Custom warning message
   */
  warningMessage?: string
  /**
   * Callback fired when sign-in is initiated
   */
  onSignInStart?: () => void
  /**
   * Callback fired when an error occurs
   */
  onError?: (error: string) => void
}

export function PlexSignInButton({
  inviteCode,
  showWarning = false,
  warningDelay = 5000,
  serverName,
  buttonText = "Sign in with Plex",
  loadingText = "Connecting...",
  buttonClassName,
  showDisclaimer = true,
  warningMessage,
  onSignInStart,
  onError,
}: PlexSignInButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showWarningState, setShowWarningState] = useState(false)
  const [_authUrl, setAuthUrl] = useState<string | null>(null)

  const handleSignIn = async () => {
    setIsLoading(true)
    setError(null)
    onSignInStart?.()

    try {
      // Create a Plex PIN
      const { id, code } = await createPlexPin()

      // Create the authorization URL (with optional invite code)
      const url = await createPlexAuthUrl(id, code, inviteCode)
      setAuthUrl(url)

      if (showWarning) {
        // Show warning transition
        setShowWarningState(true)

        // Wait for delay then redirect (enough time to read the warning)
        setTimeout(() => {
          window.location.href = url
        }, warningDelay)
      } else {
        // Redirect immediately
        window.location.href = url
      }
    } catch (err) {
      console.error("[AUTH] - Error initiating sign in:", err)
      const errorMessage = err instanceof Error ? err.message : "Failed to start authentication"
      setError(errorMessage)
      setIsLoading(false)
      setShowWarningState(false)
      onError?.(errorMessage)
    }
  }

  // Reset warning if user navigates away or component unmounts
  useEffect(() => {
    return () => {
      setShowWarningState(false)
    }
  }, [])

  // Note: buttonClassName prop allows overriding default Button styles for special cases
  const useCustomClassName = Boolean(buttonClassName)

  // Different warning messages based on context
  const getDefaultWarningMessage = () => {
    if (inviteCode) {
      // For invite flow: explain we need it to invite and accept the invite
      return serverName
        ? `You may see a warning, but this is needed to invite you to ${serverName} and accept the invite on your behalf.`
        : "You may see a warning, but this is needed to invite you to the Plex server and accept the invite on your behalf."
    } else {
      // For regular sign-in: explain we need it to match account to subscriber
      return serverName
        ? `You may see a warning, but this is only needed to match your Plex account to a ${serverName} subscriber.`
        : "You may see a warning, but this is only needed to match your Plex account to the server subscriber."
    }
  }

  const defaultWarningMessage = getDefaultWarningMessage()

  return (
    <div className="flex flex-col items-center gap-4 sm:gap-6 w-full max-w-md">
      {!showWarningState && (
        <>
          {useCustomClassName ? (
            <button
              onClick={handleSignIn}
              disabled={isLoading}
              data-testid="sign-in-with-plex"
              className={buttonClassName}
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5 text-white"
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
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  {loadingText}
                </>
              ) : (
                buttonText
              )}
            </button>
          ) : (
            <Button
              onClick={handleSignIn}
              disabled={isLoading}
              data-testid="sign-in-with-plex"
              className="w-full"
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5 text-white"
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
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  {loadingText}
                </>
              ) : (
                buttonText
              )}
            </Button>
          )}

          {error && (
            <div className="w-full max-w-md rounded-lg bg-red-900/30 border border-red-500/50 p-3 sm:p-4">
              <p className="text-xs sm:text-sm text-red-300 text-center">{error}</p>
            </div>
          )}

          {showDisclaimer && (
            <div className="w-full space-y-2 text-center px-1">
              {/* Only show subscriber message for regular sign-in, not invite flow */}
              {serverName && !inviteCode && (
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  Only subscribers on <span className="font-medium text-slate-300">{serverName}</span> will be able to
                  generate a wrapped.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* Device Warning Alert - Shows as transition */}
      {showWarningState && showWarning && (
        <div className="w-full max-w-md rounded-lg bg-purple-900/20 border border-purple-500/30 p-4 sm:p-5">
          <div className="flex flex-col items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <svg
              className="w-5 h-5 text-purple-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <p className="text-xs sm:text-sm text-purple-200 leading-relaxed text-center px-1">
              {warningMessage || defaultWarningMessage}
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-3 border-t border-purple-500/20">
            <svg
              className="animate-spin h-4 w-4 text-purple-400"
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
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <p className="text-xs sm:text-sm text-purple-300/80">Redirecting to Plex...</p>
          </div>
        </div>
      )}
    </div>
  )
}

