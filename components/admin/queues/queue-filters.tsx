"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import { Button } from "@/components/ui/button"
import { StyledDropdown } from "@/components/ui/styled-dropdown"
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
        <StyledDropdown
          value={currentStatus}
          onChange={(value) => updateParams("status", value)}
          options={STATUS_OPTIONS}
          data-testid="queue-filter-status"
        />
      </div>

      {/* Job Type Filter */}
      <div className="flex-1 min-w-[200px]">
        <label className="block text-xs font-medium text-slate-400 mb-1">
          Job Type
        </label>
        <StyledDropdown
          value={currentJobType}
          onChange={(value) => updateParams("jobType", value)}
          options={JOB_TYPE_OPTIONS}
          data-testid="queue-filter-job-type"
        />
      </div>

      {/* Clear Filters */}
      {(currentStatus || currentJobType) && (
        <div className="flex items-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("?")}
            data-testid="queue-filter-clear"
          >
            Clear Filters
          </Button>
        </div>
      )}
    </div>
  )
}
