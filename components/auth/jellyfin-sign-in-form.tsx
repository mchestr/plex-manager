"use client"

import { processJellyfinInvite } from "@/actions/invite"
import { motion } from "framer-motion"
import { useState } from "react"

interface JellyfinSignInFormProps {
  inviteCode: string
  serverName: string
  onError: (error: string) => void
  onSuccess?: () => void
  "data-testid"?: string
}

export function JellyfinSignInForm({
  inviteCode,
  serverName,
  onError,
  onSuccess,
  "data-testid": testId,
}: JellyfinSignInFormProps) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [jellyfinUrl, setJellyfinUrl] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Validate inputs
    if (!username.trim()) {
      onError("Username is required")
      return
    }

    if (username.length < 3) {
      onError("Username must be at least 3 characters")
      return
    }

    if (!password) {
      onError("Password is required")
      return
    }

    if (password.length < 8) {
      onError("Password must be at least 8 characters")
      return
    }

    if (password !== confirmPassword) {
      onError("Passwords do not match")
      return
    }

    setIsSubmitting(true)
    try {
      const result = await processJellyfinInvite(inviteCode, {
        username: username.trim(),
        password,
      })

      if (result.success && result.data) {
        setShowSuccess(true)
        setJellyfinUrl(result.data.serverUrl || null)
        onSuccess?.()
      } else if (!result.success) {
        onError(result.error || "Failed to create account")
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "An unexpected error occurred")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (showSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="w-16 h-16 mx-auto mb-4 bg-green-500/20 rounded-full flex items-center justify-center"
        >
          <svg
            className="w-8 h-8 text-green-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </motion.div>
        <h2 className="text-xl font-bold text-white mb-2" data-testid="jellyfin-success-heading">Account Created!</h2>
        <p className="text-slate-300 mb-6">
          Your Jellyfin account has been created successfully.
        </p>
        {jellyfinUrl && (
          <a
            href={jellyfinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 .002C7.524.002 3.256 2.063 1.664 5.227c-.43.856-.665 1.79-.665 2.73v8.085c0 3.983 4.925 7.956 11 7.956s11-3.973 11-7.956V7.957c0-.94-.234-1.874-.665-2.73C20.744 2.063 16.476.002 12 .002zm0 2.002c3.605 0 6.904 1.523 8.336 3.898.333.552.498 1.175.498 1.798v8.342c0 2.794-3.986 5.956-8.834 5.956S3.166 18.836 3.166 16.042V7.7c0-.623.165-1.246.498-1.798C5.096 3.527 8.395 2.004 12 2.004z" />
            </svg>
            Open Jellyfin
          </a>
        )}
      </motion.div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 w-full" data-testid={testId}>
      <div>
        <label htmlFor="username" className="block text-sm font-medium text-slate-300 mb-1">
          Username
        </label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          placeholder="Choose a username"
          disabled={isSubmitting}
          autoComplete="username"
          autoFocus
          data-testid="jellyfin-username-input"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          placeholder="Create a password"
          disabled={isSubmitting}
          autoComplete="new-password"
          data-testid="jellyfin-password-input"
        />
      </div>

      <div>
        <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-300 mb-1">
          Confirm Password
        </label>
        <input
          id="confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          placeholder="Confirm your password"
          disabled={isSubmitting}
          autoComplete="new-password"
          data-testid="jellyfin-confirm-password-input"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
        data-testid="jellyfin-submit-button"
      >
        {isSubmitting ? (
          <>
            <svg
              className="animate-spin h-5 w-5"
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
            Creating Account...
          </>
        ) : (
          <>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 .002C7.524.002 3.256 2.063 1.664 5.227c-.43.856-.665 1.79-.665 2.73v8.085c0 3.983 4.925 7.956 11 7.956s11-3.973 11-7.956V7.957c0-.94-.234-1.874-.665-2.73C20.744 2.063 16.476.002 12 .002zm0 2.002c3.605 0 6.904 1.523 8.336 3.898.333.552.498 1.175.498 1.798v8.342c0 2.794-3.986 5.956-8.834 5.956S3.166 18.836 3.166 16.042V7.7c0-.623.165-1.246.498-1.798C5.096 3.527 8.395 2.004 12 2.004z" />
            </svg>
            Create Account
          </>
        )}
      </button>

      <p className="text-xs text-slate-400 text-center mt-4">
        You'll use this username and password to sign in to {serverName}
      </p>
    </form>
  )
}
