"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import { StyledInput } from "@/components/ui/input"

export function DiscordDateFilter() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Default to last 30 days if not set
  const defaultStartDate = new Date()
  defaultStartDate.setDate(defaultStartDate.getDate() - 30)

  const startDate =
    searchParams.get("startDate") || defaultStartDate.toISOString().split("T")[0]
  const endDate =
    searchParams.get("endDate") || new Date().toISOString().split("T")[0]

  const updateFilters = useCallback(
    (newStartDate: string, newEndDate: string) => {
      const params = new URLSearchParams(searchParams.toString())

      if (newStartDate) {
        params.set("startDate", newStartDate)
      } else {
        params.delete("startDate")
      }

      if (newEndDate) {
        params.set("endDate", newEndDate)
      } else {
        params.delete("endDate")
      }

      router.push(`/admin/discord?${params.toString()}`)
    },
    [router, searchParams]
  )

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateFilters(e.target.value, endDate)
  }

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateFilters(startDate, e.target.value)
  }

  const handleQuickFilter = (days: number) => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - days)

    updateFilters(
      start.toISOString().split("T")[0],
      end.toISOString().split("T")[0]
    )
  }

  return (
    <div
      className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4 mb-6"
      data-testid="discord-date-filter"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Start Date
            </label>
            <StyledInput
              type="date"
              value={startDate}
              onChange={handleStartDateChange}
              size="sm"
              className="bg-slate-700/50"
              data-testid="discord-start-date"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              End Date
            </label>
            <StyledInput
              type="date"
              value={endDate}
              onChange={handleEndDateChange}
              size="sm"
              className="bg-slate-700/50"
              data-testid="discord-end-date"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="text-xs text-slate-400 mb-1 w-full sm:w-auto sm:mb-0">
            Quick Filters:
          </div>
          <button
            onClick={() => handleQuickFilter(7)}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded transition-colors"
            data-testid="discord-filter-7-days"
          >
            7 Days
          </button>
          <button
            onClick={() => handleQuickFilter(30)}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded transition-colors"
            data-testid="discord-filter-30-days"
          >
            30 Days
          </button>
          <button
            onClick={() => handleQuickFilter(90)}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded transition-colors"
            data-testid="discord-filter-90-days"
          >
            90 Days
          </button>
        </div>
      </div>
    </div>
  )
}
