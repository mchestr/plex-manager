"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import { JOB_TYPES } from "@/lib/queue/types"

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "waiting", label: "Waiting" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "delayed", label: "Delayed" },
]

const JOB_TYPE_OPTIONS = [
  { value: "", label: "All Job Types" },
  { value: JOB_TYPES.WATCHLIST_SYNC_USER, label: "Watchlist Sync (User)" },
  { value: JOB_TYPES.WATCHLIST_SYNC_ALL, label: "Watchlist Sync (All)" },
]

export function QueueFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const currentStatus = searchParams.get("status") ?? ""
  const currentJobType = searchParams.get("jobType") ?? ""

  const updateParams = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      // Reset to page 1 when filters change
      params.delete("page")
      router.push(`?${params.toString()}`)
    },
    [router, searchParams]
  )

  return (
    <div className="mb-6 flex flex-wrap gap-4">
      {/* Status Filter */}
      <div className="flex-1 min-w-[200px]">
        <label className="block text-xs font-medium text-slate-400 mb-1">
          Status
        </label>
        <select
          value={currentStatus}
          onChange={(e) => updateParams("status", e.target.value)}
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          data-testid="queue-filter-status"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Job Type Filter */}
      <div className="flex-1 min-w-[200px]">
        <label className="block text-xs font-medium text-slate-400 mb-1">
          Job Type
        </label>
        <select
          value={currentJobType}
          onChange={(e) => updateParams("jobType", e.target.value)}
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          data-testid="queue-filter-job-type"
        >
          {JOB_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Clear Filters */}
      {(currentStatus || currentJobType) && (
        <div className="flex items-end">
          <button
            onClick={() => router.push("?")}
            className="px-3 py-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            Clear Filters
          </button>
        </div>
      )}
    </div>
  )
}
