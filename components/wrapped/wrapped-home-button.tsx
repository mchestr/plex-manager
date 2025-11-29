"use client"

import { getWrappedSettings } from "@/actions/admin"
import { generatePlexWrapped, getUserPlexWrapped } from "@/actions/users"
import { useToast } from "@/components/ui/toast"
import { WrappedGeneratingAnimation } from "@/components/generator/wrapped-generating-animation"
import { WrappedShareButton } from "@/components/wrapped/wrapped-share-button"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

interface WrappedHomeButtonProps {
  userId: string
  serverName: string
}

export function WrappedHomeButton({ userId, serverName }: WrappedHomeButtonProps) {
  const toast = useToast()
  const router = useRouter()
  const [isGenerating, setIsGenerating] = useState(false)
  const [wrapped, setWrapped] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [wrappedSettings, setWrappedSettings] = useState<{ enabled: boolean; year: number } | null>(null)
  const pollFailureCountRef = useRef(0)

  const heroTitle = serverName

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
        pollFailureCountRef.current = 0 // Reset on success

        if (wrappedData?.status === "completed") {
          setIsGenerating(false)
          clearInterval(pollInterval)
          // Navigate to wrapped page
          router.push("/wrapped")
        } else if (wrappedData?.status === "failed") {
          setIsGenerating(false)
          clearInterval(pollInterval)
          toast.showError(wrappedData.error || "Failed to generate wrapped")
        }
      } catch (err) {
        console.error("Error polling wrapped status:", err)
        pollFailureCountRef.current += 1
        // Show toast after 3 consecutive failures
        if (pollFailureCountRef.current === 3) {
          toast.showError("Having trouble checking status. Will keep trying...")
        }
      }
    }, 2000) // Poll every 2 seconds

    return () => clearInterval(pollInterval)
  }, [userId, isGenerating, wrapped?.status, wrappedYear, router, loadWrapped, toast])

  const handleGenerate = async () => {
    if (!userId) return

    setIsGenerating(true)
    try {
      const result = await generatePlexWrapped(userId, wrappedYear)
      if (result.success) {
        // Reload wrapped data
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

  if (isGenerating || wrapped?.status === "generating") {
    return <WrappedGeneratingAnimation year={wrappedYear} compact />
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <svg
          className="animate-spin h-8 w-8 text-cyan-400"
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
      </div>
    )
  }

  // If wrapped is completed, show button to view wrapped
  if (wrapped && wrapped.status === "completed") {
    return (
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-center mb-4 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent px-4">
          {heroTitle}
        </h1>
        <p className="text-sm text-slate-400 text-center max-w-xl">
          Your personalized viewing summary is ready!
        </p>
        <Link
          href="/wrapped"
          className="px-12 py-6 flex items-center justify-center gap-3 text-white text-xl font-semibold rounded-xl bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 hover:from-cyan-500 hover:via-purple-500 hover:to-pink-500 transition-all duration-200 shadow-lg"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          Let's Get Started!
        </Link>
        {wrapped.shareToken && (
          <WrappedShareButton shareToken={wrapped.shareToken} year={wrappedYear} />
        )}
      </div>
    )
  }

  // If wrapped failed, show button to try again
  if (wrapped && wrapped.status === "failed") {
    return (
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-center mb-4 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent px-4">
          {heroTitle}
        </h1>
        <p className="text-sm text-slate-400 text-center max-w-xl">
          There was an error generating your wrapped. Let's try again!
        </p>
        {wrapped.error && (
          <div className="w-full max-w-md p-4 bg-red-900/30 border border-red-500/50 rounded-lg">
            <p className="text-sm text-red-300 text-center">{wrapped.error}</p>
          </div>
        )}
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="px-12 py-6 flex items-center justify-center gap-3 text-white text-xl font-semibold rounded-xl bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 hover:from-cyan-500 hover:via-purple-500 hover:to-pink-500 transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Try Again
        </button>
      </div>
    )
  }

  // Show only server name if wrapped is disabled or not in time range
  if (wrappedSettings && !wrappedSettings.enabled) {
    return (
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-center mb-4 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent px-4">
          {heroTitle}
        </h1>
      </div>
    )
  }

  // No wrapped exists, show button to generate
  return (
    <div className="flex flex-col items-center gap-6">
      <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-center mb-4 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent px-4">
        {heroTitle}
      </h1>
      <p className="text-sm text-slate-400 text-center max-w-xl">
        Your personalized year-end summary of movies and shows you watched
      </p>
      <button
        onClick={handleGenerate}
        disabled={isGenerating || !wrappedSettings?.enabled}
        className="px-12 py-6 flex items-center justify-center gap-3 text-white text-xl font-semibold rounded-xl bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 hover:from-cyan-500 hover:via-purple-500 hover:to-pink-500 transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
        Generate My {wrappedYear} Wrapped
      </button>
    </div>
  )
}

