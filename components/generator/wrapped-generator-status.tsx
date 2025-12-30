"use client"

import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/sonner"
import Link from "next/link"
import { useEffect } from "react"

interface WrappedGeneratorStatusProps {
  status: "completed" | "generating" | "failed" | null
  year: number
  onRegenerate: () => void
  isRegenerating: boolean
  error?: string | null
}

export function WrappedGeneratorStatus({
  status,
  year,
  onRegenerate,
  isRegenerating,
  error,
}: WrappedGeneratorStatusProps) {
  const toast = useToast()

  // Show error as toast when it appears
  useEffect(() => {
    if (error) {
      toast.showError(error, 6000)
    }
  }, [error, toast])

  if (status === "completed") {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Your {year} Plex Wrapped</h2>
          <span className="px-3 py-1 bg-green-500/20 text-green-400 text-xs font-medium rounded-full">
            Ready
          </span>
        </div>
        <p className="text-slate-400 mb-4">
          Your Plex Wrapped for {year} has been generated!
        </p>
        <Button asChild>
          <Link href="/wrapped">
            View Your Wrapped
          </Link>
        </Button>
      </div>
    )
  }

  if (status === "failed") {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm border border-red-500/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Your {year} Plex Wrapped</h2>
          <span className="px-3 py-1 bg-red-500/20 text-red-400 text-xs font-medium rounded-full">
            Failed
          </span>
        </div>
        <Button
          onClick={onRegenerate}
          disabled={isRegenerating}
        >
          {isRegenerating ? (
            <>
              <svg
                className="animate-spin h-4 w-4"
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
              Generating...
            </>
          ) : (
            "Try Again"
          )}
        </Button>
      </div>
    )
  }

  return null
}

