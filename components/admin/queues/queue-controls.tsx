"use client"

import { useState, useTransition } from "react"
import {
  pauseJobQueue,
  resumeJobQueue,
  triggerWatchlistSyncJob,
} from "@/actions/admin/queue"
import { useToast } from "@/components/ui/toast"

interface QueueControlsProps {
  isPaused: boolean
  disabled?: boolean
}

export function QueueControls({ isPaused, disabled = false }: QueueControlsProps) {
  const [isPending, startTransition] = useTransition()
  const [syncPending, setSyncPending] = useState(false)
  const { showSuccess, showError } = useToast()

  const handlePauseResume = () => {
    startTransition(async () => {
      const result = isPaused ? await resumeJobQueue() : await pauseJobQueue()

      if (result.success) {
        showSuccess(isPaused ? "Queue resumed" : "Queue paused")
        // Reload to get fresh data
        window.location.reload()
      } else {
        showError(result.error || "Action failed")
      }
    })
  }

  const handleTriggerSync = async () => {
    setSyncPending(true)
    try {
      const result = await triggerWatchlistSyncJob({})

      if (result.success) {
        showSuccess(`Sync job queued (ID: ${result.data.jobId})`)
        // Reload to see the new job
        window.location.reload()
      } else {
        showError(result.error || "Failed to trigger sync")
      }
    } finally {
      setSyncPending(false)
    }
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-white mb-3">Queue Controls</h3>
      <div className="flex flex-wrap gap-3">
        {/* Pause/Resume Button */}
        <button
          onClick={handlePauseResume}
          disabled={disabled || isPending}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            isPaused
              ? "bg-green-600 hover:bg-green-700 text-white"
              : "bg-yellow-600 hover:bg-yellow-700 text-white"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          data-testid="queue-pause-resume-btn"
        >
          {isPending ? (
            <svg
              className="w-4 h-4 animate-spin"
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
          ) : isPaused ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          )}
          {isPaused ? "Resume Queue" : "Pause Queue"}
        </button>

        {/* Trigger Sync Button */}
        <button
          onClick={handleTriggerSync}
          disabled={disabled || syncPending || isPaused}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-cyan-600 hover:bg-cyan-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          data-testid="queue-trigger-sync-btn"
        >
          {syncPending ? (
            <svg
              className="w-4 h-4 animate-spin"
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
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          )}
          Trigger Watchlist Sync
        </button>
      </div>
    </div>
  )
}
