"use client"

import { updateWrappedSettings } from "@/actions/admin"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { StyledCheckbox } from "@/components/ui/checkbox"
import { useToast } from "@/components/ui/sonner"
import { useRouter } from "next/navigation"
import { useState, useTransition, useEffect } from "react"

interface WrappedSettingsFormProps {
  enabled: boolean
  year: number | null
  startDate: Date | null
  endDate: Date | null
}

// Helper to extract month from date (01-12)
function extractMonth(date: Date | null): string {
  if (!date) return ""
  return String(new Date(date).getMonth() + 1).padStart(2, "0")
}

// Helper to extract day from date (01-31)
function extractDay(date: Date | null): string {
  if (!date) return ""
  return String(new Date(date).getDate()).padStart(2, "0")
}

// Helper to construct date from month/day using current year
function constructDate(month: string, day: string): Date | null {
  if (!month || !day) return null
  const currentYear = new Date().getFullYear()
  return new Date(currentYear, parseInt(month, 10) - 1, parseInt(day, 10))
}

// Helper to format date for display
function formatDateForDisplay(date: Date | null): string {
  if (!date) return "Not set"
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// Check if current date is within range
function isCurrentlyWithinRange(startDate: Date | null, endDate: Date | null): boolean | null {
  if (!startDate || !endDate) return null

  const now = new Date()
  const start = new Date(startDate)
  const end = new Date(endDate)

  // Normalize to same year for comparison
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startNormalized = new Date(now.getFullYear(), start.getMonth(), start.getDate())
  const endNormalized = new Date(now.getFullYear(), end.getMonth(), end.getDate())

  // Handle year rollover (e.g., Nov 20 - Jan 31)
  if (endNormalized < startNormalized) {
    // Check if we're in next year (one year after start date's year)
    const startYear = start.getFullYear()
    const isInNextYear = now.getFullYear() === startYear + 1
    if (isInNextYear) {
      // We're in next year, check if before end date
      const nextYearEnd = new Date(now.getFullYear(), end.getMonth(), end.getDate())
      return today <= nextYearEnd
    } else {
      // We're in the same year as start date, check if after start
      return today >= startNormalized
    }
  } else {
    // Normal range within same year
    return today >= startNormalized && today <= endNormalized
  }
}

export function WrappedSettingsForm({ enabled, year, startDate, endDate }: WrappedSettingsFormProps) {
  const router = useRouter()
  const toast = useToast()
  const [isEditing, setIsEditing] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Calculate effective year from start date or use provided year
  const effectiveYear = startDate ? new Date(startDate).getFullYear() : (year ?? new Date().getFullYear())

  const [formData, setFormData] = useState({
    enabled: enabled,
    startMonth: extractMonth(startDate),
    startDay: extractDay(startDate),
    endMonth: extractMonth(endDate),
    endDay: extractDay(endDate),
  })

  // Update form data when props change
  useEffect(() => {
    setFormData({
      enabled,
      startMonth: extractMonth(startDate),
      startDay: extractDay(startDate),
      endMonth: extractMonth(endDate),
      endDay: extractDay(endDate),
    })
  }, [enabled, startDate, endDate])

  // Show status toast when settings are updated (after successful save)
  // This is handled in handleSubmit after successful update

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()

    // Validate date range: if one is set, both must be set
    const hasStart = formData.startMonth && formData.startDay
    const hasEnd = formData.endMonth && formData.endDay
    if ((hasStart && !hasEnd) || (!hasStart && hasEnd)) {
      const errorMsg = "Both start and end dates must be set, or both must be empty"
      toast.showError(errorMsg)
      return
    }

    // Construct dates using current year (year will be auto-determined from start date by backend)
    const newStartDate = hasStart ? constructDate(formData.startMonth, formData.startDay) : null
    const newEndDate = hasEnd ? constructDate(formData.endMonth, formData.endDay) : null

    startTransition(async () => {
      const result = await updateWrappedSettings({
        enabled: formData.enabled,
        startDate: newStartDate,
        endDate: newEndDate,
      })

      if (result.success) {
        setIsEditing(false)
        toast.showSuccess("Wrapped settings updated")

        // Show status toast after successful update if date range is configured
        if (newStartDate && newEndDate) {
          const isWithinRange = isCurrentlyWithinRange(newStartDate, newEndDate)
          const effectiveEnabled = formData.enabled && (isWithinRange ?? true)

          setTimeout(() => {
            if (effectiveEnabled) {
              toast.showInfo("Generation is currently allowed (within date range)", 4000)
            } else {
              toast.showInfo("Generation is currently disabled (outside date range)", 4000)
            }
          }, 500) // Small delay after success toast
        }

        router.refresh()
      } else {
        const errorMsg = result.error || "Failed to update wrapped settings"
        toast.showError(errorMsg)
      }
    })
  }

  if (!isEditing) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-medium text-slate-400 mb-1">Wrapped Year</div>
            <div className="text-sm text-white font-mono">
              {effectiveYear}
              {startDate && (
                <span className="text-xs text-slate-500 ml-2">
                  (auto-determined from start date)
                </span>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-400 mb-1">Generation Window</div>
            <div className="text-sm text-white">
              {startDate && endDate ? (
                <>
                  {formatDateForDisplay(startDate)} - {formatDateForDisplay(endDate)}
                </>
              ) : (
                <span className="text-slate-500">Not configured (always available when enabled)</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <button
            onClick={() => setIsEditing(true)}
            className="px-3 py-1 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-600 hover:border-cyan-500/50 text-slate-300 hover:text-white text-xs font-medium rounded transition-all"
          >
            Edit
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-4 p-4 bg-slate-900/30 border border-slate-700 rounded-lg">
        <StyledCheckbox
          id="wrapped-enabled"
          checked={formData.enabled}
          onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
          disabled={isPending}
          label="Enable Wrapped Feature"
          description="When disabled, users cannot generate new wrapped content"
        />
      </div>

      <div className="border-t border-slate-700 pt-4">
        <h4 className="text-sm font-semibold text-white mb-3">Generation Time Window (Optional)</h4>
        <p className="text-xs text-slate-400 mb-4">
          Set a date range when wrapped generation is allowed. If set, generation will only be available during this period.
          Leave empty to allow generation anytime (when enabled). Supports year rollover (e.g., Nov 20 - Jan 31).
          The year is automatically determined from the start date (e.g., Nov 20, 2024 - Jan 31, 2025 uses year 2024).
        </p>
        <DateRangePicker
          startMonth={formData.startMonth}
          startDay={formData.startDay}
          endMonth={formData.endMonth}
          endDay={formData.endDay}
          onStartMonthChange={(month) => setFormData({ ...formData, startMonth: month })}
          onStartDayChange={(day) => setFormData({ ...formData, startDay: day })}
          onEndMonthChange={(month) => setFormData({ ...formData, endMonth: month })}
          onEndDayChange={(day) => setFormData({ ...formData, endDay: day })}
          disabled={isPending}
        />
        <p className="mt-1 text-xs text-slate-400">
          Generation window (e.g., November 20 to January 31). Year is automatically determined from the start date each year.
        </p>
        <button
          type="button"
          onClick={() => setFormData({ ...formData, startMonth: "", startDay: "", endMonth: "", endDay: "" })}
          disabled={isPending || (!formData.startMonth && !formData.endMonth)}
          className="mt-2 text-xs text-slate-400 hover:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Clear date range
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setIsEditing(false)
            setFormData({
              enabled,
              startMonth: extractMonth(startDate),
              startDay: extractDay(startDate),
              endMonth: extractMonth(endDate),
              endDay: extractDay(endDate),
            })
          }}
          disabled={isPending}
          className="px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-600 hover:border-slate-500 text-slate-300 hover:text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

