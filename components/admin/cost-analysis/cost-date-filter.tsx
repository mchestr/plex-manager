"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import { Button } from "@/components/ui/button"
import { StyledInput } from "@/components/ui/input"

export function CostDateFilter() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const startDate = searchParams.get("startDate") || ""
  const endDate = searchParams.get("endDate") || ""

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

      router.push(`/admin/cost-analysis?${params.toString()}`)
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

    updateFilters(start.toISOString().split("T")[0], end.toISOString().split("T")[0])
  }

  const handleClear = () => {
    updateFilters("", "")
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Start Date</label>
            <StyledInput
              type="date"
              value={startDate}
              onChange={handleStartDateChange}
              size="sm"
              className="bg-slate-700/50"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">End Date</label>
            <StyledInput
              type="date"
              value={endDate}
              onChange={handleEndDateChange}
              size="sm"
              className="bg-slate-700/50"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="text-xs text-slate-400 mb-1 w-full sm:w-auto sm:mb-0">Quick Filters:</div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleQuickFilter(7)}
          >
            7 Days
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleQuickFilter(30)}
          >
            30 Days
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleQuickFilter(90)}
          >
            90 Days
          </Button>
          {(startDate || endDate) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="text-red-400 hover:text-red-300 hover:bg-red-600/30"
            >
              Clear
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

