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
}

export function WrappedCard({ userId }: WrappedCardProps) {
  const toast = useToast()
  const router = useRouter()
  const [isGenerating, setIsGenerating] = useState(false)
  const [wrapped, setWrapped] = useState<{ status: string; error?: string | null; shareToken?: string | null } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [wrappedSettings, setWrappedSettings] = useState<{ enabled: boolean; year: number } | null>(null)
  const pollFailureCountRef = useRef(0)

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

  // Loading state
  if (isLoading) {
    return (
      <motion.div
        className="relative overflow-hidden rounded-2xl border border-pink-500/20 bg-gradient-to-br from-pink-950/30 via-purple-950/20 to-slate-900 p-6 shadow-xl shadow-black/30"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.15 }}
        data-testid="wrapped-card-loading"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500/20 to-purple-500/20">
            <svg className="h-7 w-7 text-pink-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-white">{wrappedYear} Wrapped</h3>
            <p className="mt-0.5 text-sm text-slate-400">Loading...</p>
          </div>
        </div>
      </motion.div>
    )
  }

  // Generating state
  if (isGenerating || wrapped?.status === "generating") {
    return (
      <motion.div
        className="relative overflow-hidden rounded-2xl border border-pink-500/30 bg-gradient-to-br from-pink-950/30 via-purple-950/20 to-slate-900 p-6 shadow-xl shadow-pink-500/10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.15 }}
        data-testid="wrapped-card-generating"
      >
        <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-pink-500/20 blur-3xl animate-pulse" />
        <div className="relative flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 shadow-lg shadow-pink-500/20">
            <svg className="h-7 w-7 text-white animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-white">{wrappedYear} Wrapped</h3>
            <p className="mt-0.5 text-sm text-pink-300">Generating your personalized summary...</p>
          </div>
        </div>
      </motion.div>
    )
  }

  // Completed state
  if (wrapped?.status === "completed") {
    return (
      <motion.div
        className="group relative overflow-hidden rounded-2xl border border-pink-500/20 bg-gradient-to-br from-pink-950/30 via-purple-950/20 to-slate-900 p-6 shadow-xl shadow-black/30 transition-all duration-300 hover:border-pink-500/40 hover:shadow-pink-500/10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.15 }}
        data-testid="wrapped-card-completed"
      >
        <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-pink-500/10 blur-3xl transition-all duration-500 group-hover:bg-pink-500/20" />
        <div className="relative flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 shadow-lg shadow-pink-500/20">
            <svg className="h-7 w-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-semibold text-white">{wrappedYear} Wrapped</h3>
            <p className="mt-0.5 text-sm text-green-400">Ready to view!</p>
          </div>
          <Link
            href="/wrapped"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-pink-500 to-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-pink-500/20 transition hover:from-pink-400 hover:to-purple-500"
          >
            View
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </motion.div>
    )
  }

  // Failed state
  if (wrapped?.status === "failed") {
    return (
      <motion.div
        className="relative overflow-hidden rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-950/30 via-slate-900 to-slate-900 p-6 shadow-xl shadow-black/30"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.15 }}
        data-testid="wrapped-card-failed"
      >
        <div className="relative flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-red-500/20">
            <svg className="h-7 w-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-semibold text-white">{wrappedYear} Wrapped</h3>
            <p className="mt-0.5 text-sm text-red-400">Generation failed</p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="inline-flex items-center gap-2 rounded-lg bg-red-500/20 px-4 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/30 disabled:opacity-50"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Retry
          </button>
        </div>
      </motion.div>
    )
  }

  // Default: Generate state
  return (
    <motion.div
      className="group relative overflow-hidden rounded-2xl border border-pink-500/20 bg-gradient-to-br from-pink-950/30 via-purple-950/20 to-slate-900 p-6 shadow-xl shadow-black/30 transition-all duration-300 hover:border-pink-500/40 hover:shadow-pink-500/10"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut", delay: 0.15 }}
      data-testid="wrapped-card"
    >
      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-pink-500/10 blur-3xl transition-all duration-500 group-hover:bg-pink-500/20" />
      <div className="relative flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 group-hover:from-pink-500/30 group-hover:to-purple-500/30 transition-colors">
          <svg className="h-7 w-7 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-semibold text-white">{wrappedYear} Wrapped</h3>
          <p className="mt-0.5 text-sm text-slate-400">Your personalized viewing summary</p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-pink-500 to-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-pink-500/20 transition hover:from-pink-400 hover:to-purple-500 disabled:opacity-50"
        >
          Generate
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </button>
      </div>
    </motion.div>
  )
}
