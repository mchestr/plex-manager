"use client"

import { checkServerAccess } from "@/actions/auth"
import { Button } from "@/components/ui/button"
import { getPlexAuthToken } from "@/lib/plex-auth"
import { isRateLimitedSignInError, RATE_LIMITED_MESSAGE } from "@/lib/security/rate-limit-messages"
import { redirectTo } from "@/lib/utils/navigation"
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
          const poll = await getPlexAuthToken(pinId)
          if (!poll.success) {
            setError(poll.error)
            isProcessingRef.current = false
            return
          }
          const { authToken } = poll

          if (authToken) {
            // If we have an invite code, process it
            if (inviteCode) {
              setStatus("Processing invite...")
              const { processInvite } = await import("@/actions/invite")
              const result = await processInvite({ code: inviteCode, plexAuthToken: authToken })

              if (!result.success) {
                setError(result.error)
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
            // (the retry schedule is fixed on the server)
            const accessCheck = await checkServerAccess({ token: authToken, isInviteFlow: Boolean(inviteCode) })

            // A user without Plex server access is normally denied here, before
            // sign-in ever happens. When the Stripe subscription gate is enabled,
            // a clean "no access" result is instead relaxed: the non-member is
            // allowed to sign in and routed to /subscribe (the (app) layout guard
            // enforces the gate). This mirrors lib/auth.ts, which relaxes
            // ACCESS_DENIED under the same flag and ONLY for the clean-no-access
            // case — a failed access check (success === false) is always fatal, so
            // we never admit a user whose access we could not actually determine.
            //
            // Invite flows are the exception: reaching this point means
            // processInvite already invited + auto-accepted this user and marked
            // them exempt from the gate, so a clean "no access" here is just
            // plex.tv propagation lag — they continue as a normal member instead
            // of being gated to /subscribe.
            let gatedNonMember = false
            if (!accessCheck.success || !accessCheck.data.hasAccess) {
              let gatingEnabled = false
              if (accessCheck.success) {
                const { isSubscriptionGatingEnabled } = await import("@/actions/auth")
                const gating = await isSubscriptionGatingEnabled()
                gatingEnabled = gating.success && gating.data
              }

              if (!gatingEnabled) {
                router.push("/auth/denied")
                return
              }

              gatedNonMember = !inviteCode
            }

            setStatus("Signing you in...")

            // Sign in with NextAuth using the token
            const result = await signIn("plex", {
              authToken,
              redirect: false,
            })

            if (result?.ok) {
              // Wait a moment for the session cookie to be set server-side
              await new Promise(resolve => setTimeout(resolve, 500))

              // A gated non-member has no app access yet — send them straight to
              // /subscribe rather than onboarding/home, neither of which they can
              // use until they subscribe (and /onboarding lives outside the (app)
              // guard, so it would not redirect them there itself).
              if (gatedNonMember) {
                redirectTo("/subscribe")
                return
              }

              // Check if user needs to complete onboarding (for all users, not just invite flows)
              const { getOnboardingStatus } = await import("@/actions/onboarding")
              const onboarding = await getOnboardingStatus()

              if (onboarding.success && !onboarding.data.isComplete) {
                // Full page reload (via redirectTo) to ensure the session is properly set
                redirectTo("/onboarding")
                return
              }

              // Full page reload (via redirectTo) to ensure the session is properly set
              redirectTo("/")
            } else {
              setError(
                isRateLimitedSignInError(result?.error)
                  ? RATE_LIMITED_MESSAGE
                  : result?.error || "Failed to sign in"
              )
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
          <h1 data-testid="plex-callback-error-heading" className="text-2xl font-bold text-center mb-4 text-red-400">
            {errorTitle}
          </h1>
          <p className="text-center text-slate-300 mb-6">{error}</p>
          <Button
            onClick={() => router.push("/")}
            size="lg"
            className="w-full border border-transparent shadow-sm"
          >
            {isInviteError ? "Go Home" : "Try Again"}
          </Button>
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
