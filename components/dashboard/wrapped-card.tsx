"use client"

import { getWrappedSettings } from "@/actions/admin"
import { generatePlexWrapped, getUserPlexWrapped } from "@/actions/users"
import { useToast } from "@/components/ui/toast"
import { motion } from "framer-motion"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

interface WrappedCardProps {
  userId: string
  memberSince: string // ISO date string of when user joined
}

// Floating sparkle component
function Sparkle({ className, delay = 0 }: { className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        opacity: [0, 1, 0],
        scale: [0, 1, 0],
      }}
      transition={{
        duration: 2,
        delay,
        repeat: Infinity,
        repeatDelay: 1,
      }}
    >
      <svg className="h-3 w-3 sm:h-4 sm:w-4 text-yellow-300" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
      </svg>
    </motion.div>
  )
}

// Minimum membership duration in months before wrapped is available
const MIN_MEMBERSHIP_MONTHS = 6

/**
 * Check if a user has been a member long enough to generate wrapped
 */
function isEligibleForWrapped(memberSince: string): boolean {
  const joinDate = new Date(memberSince)
  const now = new Date()
  const monthsDiff = (now.getFullYear() - joinDate.getFullYear()) * 12 + (now.getMonth() - joinDate.getMonth())
  return monthsDiff >= MIN_MEMBERSHIP_MONTHS
}

/**
 * Get the date when a user will become eligible for wrapped
 */
function getEligibilityDate(memberSince: string): Date {
  const joinDate = new Date(memberSince)
  return new Date(joinDate.getFullYear(), joinDate.getMonth() + MIN_MEMBERSHIP_MONTHS, joinDate.getDate())
}

export function WrappedCard({ userId, memberSince }: WrappedCardProps) {
  const toast = useToast()
  const router = useRouter()
  const [isGenerating, setIsGenerating] = useState(false)
  const [wrapped, setWrapped] = useState<{ status: string; error?: string | null; shareToken?: string | null } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [wrappedSettings, setWrappedSettings] = useState<{ enabled: boolean; year: number } | null>(null)
  const pollFailureCountRef = useRef(0)

  // Check membership eligibility
  const eligible = isEligibleForWrapped(memberSince)
  const eligibilityDate = !eligible ? getEligibilityDate(memberSince) : null

  // Load wrapped settings
  useEffect(() => {
    getWrappedSettings().then((settings) => {
      setWrappedSettings({
        enabled: settings.wrappedEnabled,
        year: settings.wrappedYear,
      })
    })
  }, [])

  const wrappedYear = wrappedSettings?.year ?? new Date().getFullYear()

  const loadWrapped = useCallback(async () => {
    if (!userId || !wrappedSettings) return

    setIsLoading(true)
    try {
      const wrappedData = await getUserPlexWrapped(userId, wrappedYear)
      setWrapped(wrappedData)
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Failed to load wrapped")
    } finally {
      setIsLoading(false)
    }
  }, [userId, wrappedYear, wrappedSettings, toast])

  useEffect(() => {
    if (userId && wrappedSettings) {
      loadWrapped()
    } else if (!wrappedSettings) {
      setIsLoading(false)
    }
  }, [userId, wrappedSettings, loadWrapped])

  // Poll for wrapped completion when generating
  useEffect(() => {
    if (!userId || (!isGenerating && wrapped?.status !== "generating")) {
      return
    }

    const pollInterval = setInterval(async () => {
      try {
        const wrappedData = await getUserPlexWrapped(userId, wrappedYear)
        setWrapped(wrappedData)
        pollFailureCountRef.current = 0

        if (wrappedData?.status === "completed") {
          setIsGenerating(false)
          clearInterval(pollInterval)
          router.push("/wrapped")
        } else if (wrappedData?.status === "failed") {
          setIsGenerating(false)
          clearInterval(pollInterval)
          toast.showError(wrappedData.error || "Failed to generate wrapped")
        }
      } catch (err) {
        console.error("Error polling wrapped status:", err)
        pollFailureCountRef.current += 1
        if (pollFailureCountRef.current === 3) {
          toast.showError("Having trouble checking status. Will keep trying...")
        }
      }
    }, 2000)

    return () => clearInterval(pollInterval)
  }, [userId, isGenerating, wrapped?.status, wrappedYear, router, toast])

  const handleGenerate = async () => {
    if (!userId) return

    setIsGenerating(true)
    try {
      const result = await generatePlexWrapped(userId, wrappedYear)
      if (result.success) {
        await loadWrapped()
      } else {
        toast.showError(result.error || "Failed to generate wrapped")
        setIsGenerating(false)
      }
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Failed to generate wrapped")
      setIsGenerating(false)
    }
  }

  // Hide when disabled
  if (wrappedSettings && !wrappedSettings.enabled) {
    return null
  }

  // Not eligible yet - show message about membership requirement
  if (!eligible && eligibilityDate) {
    return (
      <motion.div
        className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-slate-700/50 bg-gradient-to-br from-slate-900 via-slate-800/50 to-slate-900 p-6 sm:p-8 shadow-xl shadow-black/20"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.15 }}
        data-testid="wrapped-card-not-eligible"
      >
        <div className="relative flex flex-col items-center text-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-700/50">
            <svg className="h-7 w-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Wrapped Coming Soon</h3>
            <p className="mt-2 text-sm text-slate-400 max-w-xs">
              Your personalized Wrapped will be available after 6 months of membership.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Eligible on {eligibilityDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </div>
      </motion.div>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <motion.div
        className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-purple-500/30 bg-gradient-to-br from-purple-950/50 via-pink-950/30 to-slate-900 p-6 sm:p-8 shadow-2xl shadow-purple-500/10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.15 }}
        data-testid="wrapped-card-loading"
      >
        <div className="flex flex-col items-center justify-center gap-4 py-4">
          <svg className="h-10 w-10 text-purple-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-sm text-slate-400">Loading your Wrapped...</p>
        </div>
      </motion.div>
    )
  }

  // Generating state
  if (isGenerating || wrapped?.status === "generating") {
    return (
      <motion.div
        className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-purple-500/40 bg-gradient-to-br from-purple-950/50 via-pink-950/30 to-slate-900 p-6 sm:p-8 shadow-2xl shadow-purple-500/20"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.15 }}
        data-testid="wrapped-card-generating"
      >
        {/* Animated glow */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-purple-500/10 animate-pulse" />

        <div className="relative flex flex-col items-center justify-center gap-4 py-4">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 blur-xl opacity-50 animate-pulse" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-purple-600 shadow-lg">
              <svg className="h-8 w-8 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          </div>
          <div className="text-center">
            <h3 className="text-xl font-bold text-white">Creating Your {wrappedYear} Wrapped</h3>
            <p className="mt-1 text-sm text-pink-300/80">Analyzing your viewing history...</p>
          </div>
        </div>
      </motion.div>
    )
  }

  // Completed state - Hero style
  if (wrapped?.status === "completed") {
    return (
      <motion.div
        className="group relative overflow-hidden rounded-2xl sm:rounded-3xl p-[1px] shadow-2xl shadow-purple-500/20"
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut", delay: 0.15 }}
        data-testid="wrapped-card-completed"
      >
        {/* Animated gradient border */}
        <div className="absolute inset-0 rounded-2xl sm:rounded-3xl bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 opacity-75 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            backgroundSize: '200% 200%',
            animation: 'gradient-shift 3s ease infinite',
          }}
        />

        {/* Inner content */}
        <div className="relative rounded-2xl sm:rounded-3xl bg-gradient-to-br from-slate-900 via-purple-950/80 to-slate-900 p-6 sm:p-8">
          {/* Floating sparkles */}
          <Sparkle className="absolute top-4 right-8 sm:right-12" delay={0} />
          <Sparkle className="absolute top-8 right-4 sm:top-6 sm:right-6" delay={0.5} />
          <Sparkle className="absolute bottom-8 left-6 sm:bottom-6 sm:left-10" delay={1} />
          <Sparkle className="absolute top-1/2 left-4" delay={1.5} />

          {/* Glow effects */}
          <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-pink-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -left-20 -bottom-20 h-40 w-40 rounded-full bg-purple-500/20 blur-3xl" />

          <div className="relative flex flex-col items-center text-center gap-4 sm:gap-5">
            {/* Year badge */}
            <motion.div
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500/20 to-purple-500/20 border border-pink-500/30 px-4 py-1.5"
              animate={{ scale: [1, 1.02, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <span className="text-sm font-medium text-pink-300">Ready to view</span>
            </motion.div>

            {/* Main heading */}
            <div>
              <h2 className="text-4xl sm:text-5xl font-black bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                {wrappedYear}
              </h2>
              <h3 className="text-2xl sm:text-3xl font-bold text-white mt-1">Wrapped</h3>
            </div>

            {/* Tagline */}
            <p className="text-sm sm:text-base text-slate-300 max-w-xs">
              Your year in entertainment, beautifully summarized
            </p>

            {/* CTA Button */}
            <Link
              href="/wrapped"
              className="group/btn relative inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-pink-500 bg-[length:200%_100%] px-6 sm:px-8 py-3 sm:py-3.5 text-base sm:text-lg font-bold text-white shadow-lg shadow-pink-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-pink-500/40 hover:bg-right"
            >
              View Your Wrapped
              <svg className="h-5 w-5 transition-transform duration-200 group-hover/btn:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </div>
      </motion.div>
    )
  }

  // Failed state
  if (wrapped?.status === "failed") {
    return (
      <motion.div
        className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-red-500/30 bg-gradient-to-br from-red-950/30 via-slate-900 to-slate-900 p-6 sm:p-8 shadow-xl shadow-black/30"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.15 }}
        data-testid="wrapped-card-failed"
      >
        <div className="relative flex flex-col items-center text-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20">
            <svg className="h-7 w-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">{wrappedYear} Wrapped</h3>
            <p className="mt-1 text-sm text-red-400">Something went wrong. Let&apos;s try again!</p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="inline-flex items-center gap-2 rounded-xl bg-red-500/20 border border-red-500/30 px-5 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/30 disabled:opacity-50"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Retry Generation
          </button>
        </div>
      </motion.div>
    )
  }

  // Default: Generate state - Hero style callout
  return (
    <motion.div
      className="group relative overflow-hidden rounded-2xl sm:rounded-3xl p-[1px] shadow-2xl shadow-purple-500/10 hover:shadow-purple-500/20 transition-shadow duration-500"
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut", delay: 0.15 }}
      data-testid="wrapped-card"
    >
      {/* Animated gradient border */}
      <div className="absolute inset-0 rounded-2xl sm:rounded-3xl bg-gradient-to-r from-pink-500/50 via-purple-500/50 to-cyan-500/50 opacity-60 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          backgroundSize: '200% 200%',
          animation: 'gradient-shift 4s ease infinite',
        }}
      />

      {/* Inner content */}
      <div className="relative rounded-2xl sm:rounded-3xl bg-gradient-to-br from-slate-900 via-purple-950/60 to-slate-900 p-6 sm:p-8">
        {/* Floating sparkles */}
        <Sparkle className="absolute top-4 right-8 sm:right-16" delay={0.2} />
        <Sparkle className="absolute top-10 right-4 sm:top-8 sm:right-8" delay={0.8} />
        <Sparkle className="absolute bottom-6 left-8 sm:bottom-8 sm:left-12" delay={1.3} />

        {/* Glow effects */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-pink-500/10 blur-3xl transition-all duration-500 group-hover:bg-pink-500/20" />
        <div className="pointer-events-none absolute -left-20 -bottom-20 h-40 w-40 rounded-full bg-purple-500/10 blur-3xl transition-all duration-500 group-hover:bg-purple-500/20" />

        <div className="relative flex flex-col items-center text-center gap-4 sm:gap-5">
          {/* Year badge */}
          <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500/10 to-purple-500/10 border border-white/10 px-4 py-1.5">
            <svg className="h-4 w-4 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            <span className="text-sm font-medium text-slate-300">Your Year in Review</span>
          </div>

          {/* Main heading */}
          <div>
            <h2 className="text-4xl sm:text-5xl font-black bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
              {wrappedYear}
            </h2>
            <h3 className="text-2xl sm:text-3xl font-bold text-white mt-1">Wrapped</h3>
          </div>

          {/* Tagline */}
          <p className="text-sm sm:text-base text-slate-400 max-w-xs">
            Discover your viewing highlights, favorite genres, and more
          </p>

          {/* CTA Button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="group/btn relative inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-pink-500 bg-[length:200%_100%] px-6 sm:px-8 py-3 sm:py-3.5 text-base sm:text-lg font-bold text-white shadow-lg shadow-pink-500/25 transition-all duration-300 hover:shadow-xl hover:shadow-pink-500/40 hover:bg-right disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Generate My Wrapped
            <svg className="h-5 w-5 transition-transform duration-200 group-hover/btn:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </button>
        </div>
      </div>
    </motion.div>
  )
}
