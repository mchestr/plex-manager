"use client"

import { Alert } from "@/components/ui/alert"
import { Spinner } from "@/components/ui/spinner"
import { startPlexSignIn } from "@/lib/plex-auth"
import { redirectTo } from "@/lib/utils/navigation"
import { useState } from "react"

/** The invite page's Plex button (P10.26 rebuilds the page around it). */
export interface PlexSignInButtonProps {
  /**
   * Optional invite code to include in the auth URL
   */
  inviteCode?: string
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
  buttonText = "Sign in with Plex",
  loadingText = "Connecting...",
  buttonClassName,
  onSignInStart,
  onError,
}: PlexSignInButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSignIn = async () => {
    setIsLoading(true)
    setError(null)
    onSignInStart?.()

    try {
      // The PIN (and any invite code) stays in an httpOnly cookie; only the
      // app.plex.tv URL comes back.
      const started = await startPlexSignIn({ inviteCode })
      if (!started.success) {
        setError(started.error)
        setIsLoading(false)
        onError?.(started.error)
        return
      }
      // One click, straight to plex.tv: no forced wait (UI-35)
      redirectTo(started.data.authUrl)
    } catch {
      // Fixed copy only: an exception's text never reaches the screen
      const errorMessage = "Failed to start authentication"
      setError(errorMessage)
      setIsLoading(false)
      onError?.(errorMessage)
    }
  }

  const defaultButtonClassName =
    "w-full py-2.5 sm:py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"

  return (
    <div className="flex flex-col items-center gap-4 sm:gap-6 w-full max-w-md">
      <button
        onClick={handleSignIn}
        disabled={isLoading}
        data-testid="sign-in-with-plex"
        className={buttonClassName || defaultButtonClassName}
      >
        {isLoading ? (
          <>
            <Spinner size={20} />
            {loadingText}
          </>
        ) : (
          buttonText
        )}
      </button>

      {error && (
        <Alert tone="destructive" className="w-full max-w-md">
          {error}
        </Alert>
      )}
    </div>
  )
}
