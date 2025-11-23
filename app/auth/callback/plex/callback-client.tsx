"use client"

import { checkServerAccess } from "@/actions/auth"
import { getPlexAuthToken } from "@/lib/plex-auth"
import { signIn } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"

export function PlexCallbackPageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string>("Checking authorization...")
  const isProcessingRef = useRef(false)

  useEffect(() => {
    const authenticate = async () => {
      // Prevent multiple simultaneous executions
      if (isProcessingRef.current) {
        return
      }

      const pinId = searchParams.get("plexPinId")
      const inviteCode = searchParams.get("inviteCode")
      const testToken = searchParams.get("testToken")

      // TEST MODE BYPASS
      // Check for test token - only works when explicitly enabled via env var
      // Note: NEXT_PUBLIC_ prefix is required for client-side runtime access
      const isTestMode = process.env.NEXT_PUBLIC_ENABLE_TEST_AUTH === 'true'
      console.log('[AUTH] Callback - Test mode:', isTestMode, 'Has testToken:', !!testToken, 'Env var value:', process.env.NEXT_PUBLIC_ENABLE_TEST_AUTH)

      if (testToken) {
        if (!isTestMode) {
          console.error('[AUTH] Test token provided but test mode is not enabled!')
          setError('Test authentication is not enabled on this server')
          return
        }
      }

      if (testToken && isTestMode) {
        isProcessingRef.current = true
        setStatus("Using test token...")
        console.log('[AUTH] Attempting test token authentication')

        try {
          const result = await signIn("plex", {
            authToken: testToken,
            redirect: false,
          })

          console.log('[AUTH] signIn result:', result)

          if (result?.ok) {
            console.log("[AUTH] Test token authentication successful, redirecting to home")

            // Wait for session to be fully established before redirecting
            await new Promise(resolve => setTimeout(resolve, 1000))
            console.log('[AUTH] Session established, navigating...')

            // Use window.location for a clean navigation that avoids React Router issues
            window.location.href = '/'
            return
          } else {
            console.error("[AUTH] Test token sign in failed:", result?.error)
            setError(result?.error || "Failed to sign in with test token")
            isProcessingRef.current = false
            return
          }
        } catch (err) {
          console.error("[AUTH] Test token sign in error:", err)
          setError("Failed to sign in with test token")
          isProcessingRef.current = false
          return
        }
      }

      if (!pinId) {
        setError("No PIN ID received from Plex")
        return
      }

      isProcessingRef.current = true
      setStatus("Waiting for authorization...")

      // Poll for the auth token (user needs to authorize on Plex)
      // For invite flows, limit to 3 minutes (36 attempts) to ensure total wait time stays within 3 minutes
      // For regular flows, allow up to 5 minutes (60 attempts)
      const maxAttempts = inviteCode ? 36 : 60 // 3 minutes for invite flows, 5 minutes for regular flows (5 second intervals)
      let attempts = 0

      const pollForToken = async (): Promise<void> => {
        attempts++

        try {
          const authToken = await getPlexAuthToken(pinId)

          if (authToken) {
            // If we have an invite code, process it
            if (inviteCode) {
              setStatus("Processing invite...")
              const { processInvite } = await import("@/actions/invite")
              const result = await processInvite(inviteCode, authToken)

              if (!result.success) {
                // @ts-ignore - we know error exists if success is false
                setError(result.error || "Failed to process invite")
                isProcessingRef.current = false
                return
              }

              // After processing invite, we can sign the user in or just redirect
              // Let's sign them in so they can see the dashboard immediately
            }

            setStatus("Checking server access...")

            // Check if user has access to the server before signing in
            // For invite flows, use retry logic since Plex needs time to propagate the user
            // For regular flows, no retries - fail immediately if no access
            const accessCheck = inviteCode
              ? await checkServerAccess(authToken, {
                  maxRetries: 5, // Retry up to 5 times for invite flows
                  initialDelay: 3000, // Wait 3 seconds initially for invite flows
                  isInviteFlow: true,
                })
              : await checkServerAccess(authToken) // No retry options for regular flows

            if (!accessCheck.hasAccess) {
              router.push("/auth/denied")
              return
            }

            setStatus("Signing you in...")

            // Sign in with NextAuth using the token
            const result = await signIn("plex", {
              authToken,
              redirect: false,
            })

            if (result?.ok) {
              // Check if user needs to complete onboarding (for invite flows)
              if (inviteCode) {
                const { getOnboardingStatus } = await import("@/actions/onboarding")
                const { isComplete } = await getOnboardingStatus()
                if (!isComplete) {
                  router.push("/onboarding")
                  router.refresh()
                  return
                }
              }
              router.push("/")
              router.refresh()
            } else {
              setError(result?.error || "Failed to sign in")
              isProcessingRef.current = false
            }
          } else if (attempts < maxAttempts) {
            // Continue polling
            setTimeout(pollForToken, 5000) // Poll every 5 seconds
          } else {
            setError("Authorization timed out. Please try again.")
            isProcessingRef.current = false
          }
        } catch (err) {
          console.error("[AUTH] - Error polling for token:", err)
          setError(err instanceof Error ? err.message : "Failed to authenticate")
          isProcessingRef.current = false
        }
      }

      // Start polling
      pollForToken()
    }

    authenticate()
  }, [searchParams, router])

  if (error) {
    // Determine if this is an invite-specific error
    const isInviteError = error.includes("Invite") || error.includes("invite")
    const errorTitle = isInviteError ? "Invite Error" : "Authentication Error"

    return (
      <div className="z-10 max-w-md w-full">
        <div className="bg-slate-800/50 backdrop-blur-sm border border-red-500/50 rounded-lg p-8 shadow-xl">
          <h1 className="text-2xl font-bold text-center mb-4 text-red-400">
            {errorTitle}
          </h1>
          <p className="text-center text-slate-300 mb-6">{error}</p>
          <button
            onClick={() => router.push("/")}
            className="w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 transition-colors"
          >
            {isInviteError ? "Go Home" : "Try Again"}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="z-10 max-w-md w-full">
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-8 shadow-xl">
        <div className="flex flex-col items-center">
          <svg
            className="animate-spin h-12 w-12 text-cyan-400 mb-4"
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
          <p className="text-center text-slate-300 mb-2">{status}</p>
          <p className="text-center text-sm text-slate-400 mt-4">
            Please complete authorization on the Plex page if you haven't already.
          </p>
        </div>
      </div>
    </div>
  )
}
