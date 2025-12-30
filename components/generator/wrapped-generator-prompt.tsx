"use client"

import { Button } from "@/components/ui/button"

interface WrappedGeneratorPromptProps {
  year: number
  onGenerate: () => void
  isGenerating: boolean
  error?: string | null
}

export function WrappedGeneratorPrompt({
  year,
  onGenerate,
  isGenerating,
  error,
}: WrappedGeneratorPromptProps) {
  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6">
      <h2 className="text-xl font-bold text-white mb-2">Your {year} Plex Wrapped</h2>
      <p className="text-slate-400 mb-4">
        Generate your personalized Plex Wrapped to see your viewing statistics and highlights from
        {year}.
      </p>
      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-500/50 rounded-md">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}
      <Button
        onClick={onGenerate}
        disabled={isGenerating}
        size="lg"
      >
        <svg
          className="w-5 h-5"
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
        Generate My Wrapped
      </Button>
    </div>
  )
}

