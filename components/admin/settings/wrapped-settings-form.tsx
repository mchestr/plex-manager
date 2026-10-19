"use client"

import { updateWrappedSettings } from "@/actions/admin"
import { ServerTimeZoneForm } from "@/components/admin/settings/server-time-zone-form"
import { Button } from "@/components/ui/button"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { StyledCheckbox } from "@/components/ui/styled-checkbox"
import { useToast } from "@/components/ui/toast"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

interface WrappedSettingsFormProps {
  enabled: boolean
  /** The season year (`getSeasonYear()`). */
  year: number
  /** `Config.rewindSeasonOpens` and `rewindSeasonCloses`, as `MM-DD`. */
  opens: string
  closes: string
  /** Whether the season window is open now, computed on the server. */
  seasonOpen: boolean
  /** The server zone the dates are evaluated in (`serverZone()`). */
  zone: string
  /** `Config.timezone`, or null while the zone comes from `TZ` or UTC. */
  configuredZone: string | null
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

/** "December 1" for `12-01`, from the string alone, so server and client render the same text. */
function formatMonthDay(value: string): string {
  const [month, day] = value.split("-").map(Number)
  return `${MONTHS[month - 1] ?? value} ${day}`
}

function toFormData(enabled: boolean, opens: string, closes: string) {
  const [startMonth, startDay] = opens.split("-")
  const [endMonth, endDay] = closes.split("-")
  return { enabled, startMonth, startDay, endMonth, endDay }
}

export function WrappedSettingsForm({
  enabled,
  year,
  opens,
  closes,
  seasonOpen,
  zone,
  configuredZone,
}: WrappedSettingsFormProps) {
  const router = useRouter()
  const toast = useToast()
  const [isEditing, setIsEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [formData, setFormData] = useState(() => toFormData(enabled, opens, closes))

  // Reset form data during render when the props change
  const [prevProps, setPrevProps] = useState({ enabled, opens, closes })
  if (prevProps.enabled !== enabled || prevProps.opens !== opens || prevProps.closes !== closes) {
    setPrevProps({ enabled, opens, closes })
    setFormData(toFormData(enabled, opens, closes))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const newOpens = `${formData.startMonth}-${formData.startDay}`
    const newCloses = `${formData.endMonth}-${formData.endDay}`
    if (newOpens === newCloses) {
      toast.showError("The season cannot open and close on the same day")
      return
    }

    startTransition(async () => {
      const result = await updateWrappedSettings({ enabled: formData.enabled, opens: newOpens, closes: newCloses })
      if (result.success) {
        setIsEditing(false)
        toast.showSuccess("Wrapped settings updated")
        router.refresh()
      } else {
        toast.showError(result.error || "Failed to update wrapped settings")
      }
    })
  }

  // An opaque panel: over the page gradient, axe cannot check the text contrast
  return <div className="rounded-lg bg-slate-900 p-3">{isEditing ? renderForm() : renderSummary()}</div>

  function renderSummary() {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-xs font-medium text-slate-400 mb-1">Wrapped Year</div>
            <div className="text-sm text-white font-mono" data-testid="wrapped-settings-year">{year}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-400 mb-1">Season</div>
            <div className="text-sm text-white" data-testid="wrapped-settings-window">
              {formatMonthDay(opens)} to {formatMonthDay(closes)}
            </div>
            <div className="text-xs text-slate-400">Dates in {zone}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-400 mb-1">Member generation</div>
            <div className="text-sm text-white" data-testid="wrapped-settings-open">
              {!enabled ? "Off" : seasonOpen ? "Open now" : "Closed until the season opens"}
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsEditing(true)}
            data-testid="wrapped-settings-edit-button"
          >
            Edit
          </Button>
        </div>
        <div className="pt-4 border-t border-slate-700 text-slate-300">
          <ServerTimeZoneForm configured={configuredZone} effective={zone} />
        </div>
      </div>
    )
  }

  function renderForm() {
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-4 p-4 bg-slate-900/30 border border-slate-700 rounded-lg">
          <StyledCheckbox
            id="wrapped-enabled"
            checked={formData.enabled}
            onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
            disabled={isPending}
            label="Enable Wrapped Feature"
            description="When disabled, nobody can generate new wrapped content"
          />
        </div>

        <div className="border-t border-slate-700 pt-4">
          <h4 className="text-sm font-semibold text-white mb-3">Season</h4>
          <p data-testid="wrapped-settings-year-note" className="text-xs text-slate-400 mb-4">
            The season opens at 00:00 on the start date and closes at the end of the end date, in {zone}. A season
            that crosses the new year belongs to the year it opens in, so December 1 to January 31 stays on that
            year&apos;s Wrapped through January. Members can generate only while the season is open; admins can
            regenerate at any time.
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
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={isPending} data-testid="wrapped-settings-save-button">
            {isPending ? "Saving..." : "Save"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setIsEditing(false)
              setFormData(toFormData(enabled, opens, closes))
            }}
            disabled={isPending}
          >
            Cancel
          </Button>
        </div>
      </form>
    )
  }
}
