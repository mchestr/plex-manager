"use client"

import { Button } from "@/components/ui/button"
import { finishPlexSignIn, pollPlexSignIn } from "@/lib/plex-auth"
import {
  PLEX_SIGN_IN_COPY,
  plexSignInCodeFor,
  type ShownPlexSignInCode,
} from "@/lib/plex-sign-in-codes"
import { redirectTo } from "@/lib/utils/navigation"
import { signIn } from "next-auth/react"
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
  const [status, setStatus] = useState("Waiting for authorization...")
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const complete = async () => {
      setStatus("Signing you in...")
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
      // Full page load, so the new session cookie is used everywhere
      redirectTo(finished.success ? finished.data.next : "/")
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
    const copy = PLEX_SIGN_IN_COPY[code]
    return (
      <div className="z-10 max-w-md w-full" data-testid={`plex-callback-error-${code}`}>
        <div className="bg-slate-800/50 backdrop-blur-sm border border-red-500/50 rounded-lg p-8 shadow-xl">
          <h1 data-testid="plex-callback-error-heading" className="text-2xl font-bold text-center mb-4 text-red-400">
            {copy.title}
          </h1>
          <p className="text-center text-slate-300 mb-6">{copy.message}</p>
          <Button
            onClick={() => router.push("/")}
            size="lg"
            className="w-full border border-transparent shadow-sm"
          >
            {code === "invite_invalid" ? "Go Home" : "Try Again"}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="z-10 max-w-md w-full" data-testid="plex-callback-waiting">
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
