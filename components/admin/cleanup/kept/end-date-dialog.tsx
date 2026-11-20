"use client"

import { useId, useState } from "react"

import { setCleanupExclusionEnd } from "@/actions/admin/cleanup-protections"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Segment, SegmentedControl } from "@/components/ui/segmented-control"
import { useToast } from "@/components/ui/toast"
import { lastDay } from "@/lib/cleanup/actions/keeps/words"
import { useFormat } from "@/lib/format-context"
import { dayKey } from "@/lib/utils/zoned-time"

type Until = "none" | "date"

interface EndDateTarget {
  id: string
  /** The title as the table names it. */
  name: string
  /** The current end, an ISO instant, or null for no end date. */
  until: string | null
}

interface EndDateDialogProps {
  /** The exclusion. It stays set while the dialog closes, so the words do not change. */
  target: EndDateTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** The end date input, from today on. It mounts when "A date" shows, so "today" is the day it showed. */
function EndDate({ value, onChange, zone }: { value: string; onChange: (value: string) => void; zone: string }) {
  const [now] = useState(() => Date.now())
  return (
    <Input
      type="date"
      aria-label="End date"
      min={dayKey(now, zone)}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-fit"
      data-testid="admin-cleanup-end-date-date"
    />
  )
}

/**
 * Change the end date of an exclusion (UX 8.6, TS 10.3): Until, with no end
 * date or a date from today on. It opens on the current end. The exclusion
 * ends at the end of the chosen day; today ends it when the day ends. An
 * error stays in the open dialog (UX 7.12).
 */
export function EndDateDialog({ target, open, onOpenChange }: EndDateDialogProps) {
  const f = useFormat()
  const toast = useToast()
  const untilId = useId()
  const zone = f.settings.timeZone
  const [until, setUntil] = useState<Until>("none")
  const [date, setDate] = useState("")
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open && target) {
      setUntil(target.until ? "date" : "none")
      setDate(target.until ? dayKey(lastDay(target.until).getTime(), zone) : "")
    }
  }

  const save = async () => {
    if (!target) return {}
    if (until === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Choose an end date." }
    if (until === "date" && date < dayKey(Date.now(), zone)) return { error: "Choose today or a later date." }
    const result = await setCleanupExclusionEnd({ exclusionId: target.id, until: until === "date" ? date : null })
    if (!result.success) return { error: result.error }
    toast.showSuccess("End date changed")
    return {}
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Change the end date for ${target?.name ?? "this title"}?`}
      description="Every rule skips it until the end date."
      confirmLabel="Save end date"
      pendingLabel="Saving"
      action={save}
      data-testid="admin-cleanup-end-date-dialog"
      confirmTestId="admin-cleanup-end-date-save"
    >
      <div className="flex flex-col gap-2">
        <span id={untilId} className="text-ui font-medium text-foreground">
          Until
        </span>
        <SegmentedControl
          aria-labelledby={untilId}
          value={until}
          onValueChange={(value) => setUntil(value === "date" ? "date" : "none")}
          data-testid="admin-cleanup-end-date-until"
        >
          <Segment value="none">No end date</Segment>
          <Segment value="date">A date</Segment>
        </SegmentedControl>
        {until === "date" && <EndDate value={date} onChange={setDate} zone={zone} />}
      </div>
    </ConfirmDialog>
  )
}
