"use client"

import { validateInvite } from "@/actions/invite"
import { getServerName } from "@/actions/server-info"
import { PlexSignInButton } from "@/components/auth/plex-sign-in-button"
import { JellyfinSignInForm } from "@/components/auth/jellyfin-sign-in-form"
import { motion } from "framer-motion"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"

type ServerType = "PLEX" | "JELLYFIN"

export default function InvitePage() {
  const params = useParams()
  const router = useRouter()
  const code = params.code as string

  const [loading, setLoading] = useState(true)
  const [_valid, setValid] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [serverName, setServerName] = useState<string>("Plex")
  const [serverType, setServerType] = useState<ServerType>("PLEX")

  useEffect(() => {
    async function checkInvite() {
      try {
        // Fetch server name and validate invite in parallel
        const [serverNameResult, inviteResult] = await Promise.all([
          getServerName(),
          validateInvite(code),
        ])

        setServerName(serverNameResult)

        if (inviteResult.success && inviteResult.data) {
          setValid(true)
          setServerType(inviteResult.data.serverType as ServerType)
        } else {
          setError(inviteResult.error || "Invalid invite code")
        }
      } catch (error) {
        setError("Failed to validate invite")
      } finally {
        setLoading(false)
      }
    }
    checkInvite()
  }, [code])

  if (loading) {
    return (
      <div className="max-w-md w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="bg-slate-800/60 backdrop-blur-sm border border-slate-700 rounded-lg p-6 sm:p-8 shadow-xl"
        >
          <div className="flex flex-col items-center">
            <svg
              className="animate-spin h-10 w-10 sm:h-12 sm:w-12 text-cyan-400 mb-4"
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
            <p className="text-center text-slate-300 text-sm sm:text-base">Validating invite...</p>
          </div>
        </motion.div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-md w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="bg-slate-800/60 backdrop-blur-sm border border-red-500/50 rounded-lg p-6 sm:p-8 shadow-xl"
        >
          <div className="flex flex-col items-center text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            >
              <svg
                className="w-10 h-10 sm:w-12 sm:h-12 text-red-400 mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </motion.div>
            <h1 data-testid="invalid-invite-heading" className="text-xl sm:text-2xl font-bold text-white mb-2">Invalid Invite</h1>
            <p className="text-slate-300 mb-6 text-sm sm:text-base px-2">{error}</p>
            <button
              onClick={() => router.push("/")}
              className="w-full py-2.5 sm:py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 transition-colors"
            >
              Go Home
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  // Determine icon and colors based on server type
  const isPlex = serverType === "PLEX"
  const iconGradient = isPlex
    ? "from-amber-500 to-orange-600"
    : "from-purple-500 to-indigo-600"
  const iconShadow = isPlex
    ? "shadow-amber-500/20"
    : "shadow-purple-500/20"

  return (
    <div className="max-w-md w-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="bg-slate-800/60 backdrop-blur-sm border border-slate-700 rounded-lg p-6 sm:p-8 shadow-xl"
      >
        <div className="flex flex-col items-center text-center">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className={`w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br ${iconGradient} rounded-2xl flex items-center justify-center mb-4 sm:mb-6 shadow-lg ${iconShadow}`}
          >
            {isPlex ? (
              <svg className="w-8 h-8 sm:w-10 sm:h-10 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.643 0L4.68 12l6.963 12h2.714L7.394 12l6.963-12z" />
                <path d="M12.357 0l6.963 12-6.963 12h2.714L22 12 15.071 0z" />
              </svg>
            ) : (
              <svg className="w-8 h-8 sm:w-10 sm:h-10 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 .002C7.524.002 3.256 2.063 1.664 5.227c-.43.856-.665 1.79-.665 2.73v8.085c0 3.983 4.925 7.956 11 7.956s11-3.973 11-7.956V7.957c0-.94-.234-1.874-.665-2.73C20.744 2.063 16.476.002 12 .002zm0 2.002c3.605 0 6.904 1.523 8.336 3.898.333.552.498 1.175.498 1.798v8.342c0 2.794-3.986 5.956-8.834 5.956S3.166 18.836 3.166 16.042V7.7c0-.623.165-1.246.498-1.798C5.096 3.527 8.395 2.004 12 2.004z" />
              </svg>
            )}
          </motion.div>

          <motion.h1
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            data-testid="valid-invite-heading"
            className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2 sm:mb-3 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent px-2"
          >
            You're Invited!
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="text-slate-300 mb-6 sm:mb-8 text-sm sm:text-base leading-relaxed px-2"
          >
            You've been invited to join{" "}
            <span className="font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              {serverName}
            </span>
            .{" "}
            {isPlex
              ? "Sign in with your Plex account to accept."
              : "Create an account to get started."
            }
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="w-full"
          >
            {isPlex ? (
              <PlexSignInButton
                data-testid="plex-invite-sign-in"
                inviteCode={code}
                serverName={serverName}
                showWarning={true}
                warningDelay={3000}
                onError={(errorMessage) => {
                  setError(errorMessage)
                }}
              />
            ) : (
              <JellyfinSignInForm
                data-testid="jellyfin-invite-form"
                inviteCode={code}
                serverName={serverName}
                onError={(errorMessage) => {
                  setError(errorMessage)
                }}
              />
            )}
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}
