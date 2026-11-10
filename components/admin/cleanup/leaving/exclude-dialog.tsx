"use client"

import { type RefObject, useId, useState } from "react"

import { excludeCleanupItems } from "@/actions/admin/cleanup-items"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Segment, SegmentedControl } from "@/components/ui/segmented-control"
import { useToast } from "@/components/ui/toast"
import { plural } from "@/lib/cleanup/action-words"
import { useCloseFocus } from "@/lib/cleanup/actions/items/dialog-focus"
import { excludedToast } from "@/lib/cleanup/actions/items/words"
import type { ExcludeCleanupItemsResult } from "@/lib/cleanup/types/actions"
import { useFormat } from "@/lib/format-context"
import { dayKey } from "@/lib/utils/zoned-time"
import type { BatchTarget } from "@/lib/validations/cleanup-actions"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

/**
 * What an Exclude acts on (E37): titles by key, or the selection of a
 * deletion batch. One key with its `title` gets the title in the words, and
 * with its `level` the toast "Movie excluded.".
 */
export type ExcludeTarget = { itemKeys: readonly string[]; title?: string; level?: Level } | { batch: BatchTarget }

export interface ExcludeDialogProps {
  target: ExcludeTarget
  open: boolean
  onOpenChange: (open: boolean) => void
  /** After an Exclude that the server took, also one that excluded nothing (`excluded: 0`). */
  onDone?: (result: ExcludeCleanupItemsResult) => void
  /** A batch target only: the batch changed (`CLEANUP_REVIEW_STALE`), or another write met this one (`CONFLICT`). The dialog closes first. */
  onStale?: () => void
  /** Where focus goes after a success (UX 7.9). Default: back to the opener. */
  successFocus?: RefObject<HTMLElement | null>
}

type Until = "none" | "date"

/** Words for one named title, else for a count of titles (UX 8.6). */
function wordsOf(target: ExcludeTarget) {
  const named = "itemKeys" in target && target.itemKeys.length === 1 && target.title ? target.title : null
  const count = "batch" in target ? target.batch.selectedCount : target.itemKeys.length
  const object = named ?? plural(count, "title")
  const one = count === 1
  return {
    count,
    title: `Exclude ${object} from cleanup?`,
    description: one
      ? "Every rule skips it until the end date. If it is in Leaving soon, it leaves at once."
      : "Every rule skips them until the end date. If they are in Leaving soon, they leave at once.",
    confirm: `Exclude ${object}`,
  }
}

/** The end date input, from today on. It mounts when "A date" is chosen, so "today" is the day of that choice. */
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
      data-testid="admin-cleanup-exclude-date"
    />
  )
}

/**
 * Exclude one title or many (UX 8.6, TS 10.3): Until, with no end date or a
 * date, and an optional note that only admins see. The exclusion ends at the
 * end of the chosen day. Errors stay in the open dialog, except a stale
 * batch, which closes it and calls `onStale`. The toast counts the titles
 * excluded and those skipped because they are being deleted.
 */
export function ExcludeDialog({ target, open, onOpenChange, onDone, onStale, successFocus }: ExcludeDialogProps) {
  const f = useFormat()
  const toast = useToast()
  const focus = useCloseFocus(open, successFocus)
  const untilId = useId()
  const [until, setUntil] = useState<Until>("none")
  const [date, setDate] = useState("")
  const [note, setNote] = useState("")
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setUntil("none")
      setDate("")
      setNote("")
    }
  }
  const words = wordsOf(target)

  const exclude = async () => {
    if (until === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Choose an end date." }
    if (until === "date" && date < dayKey(Date.now(), f.settings.timeZone)) return { error: "Choose today or a later date." }
    const values = { until: until === "date" ? date : null, ...(note.trim() ? { note: note.trim() } : {}) }
    const result = await excludeCleanupItems("batch" in target ? { batch: target.batch, ...values } : { itemKeys: [...target.itemKeys], ...values })
    if (!result.success) {
      const stale = result.code === "CLEANUP_REVIEW_STALE" || result.code === "CONFLICT"
      if (!("batch" in target) || !onStale || !stale) return { error: result.error }
      if (result.code === "CONFLICT") toast.showError(result.error)
      focus.toOpener()
      onStale()
      return {}
    }
    const done = excludedToast(result.data, words.count, "itemKeys" in target ? target.level : undefined)
    if (done.error) toast.showError(done.text)
    else toast.showSuccess(done.text)
    focus.toTarget()
    onDone?.(result.data)
    return {}
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={words.title}
      description={words.description}
      confirmLabel={words.confirm}
      pendingLabel="Excluding"
      action={exclude}
      successFocus={focus.successFocus}
      data-testid="admin-cleanup-exclude-dialog"
      confirmTestId="admin-cleanup-exclude-confirm"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span id={untilId} className="text-ui font-medium text-foreground">
            Until
          </span>
          <SegmentedControl
            aria-labelledby={untilId}
            value={until}
            onValueChange={(value) => setUntil(value === "date" ? "date" : "none")}
            data-testid="admin-cleanup-exclude-until"
          >
            <Segment value="none">No end date</Segment>
            <Segment value="date">A date</Segment>
          </SegmentedControl>
          {until === "date" && <EndDate value={date} onChange={setDate} zone={f.settings.timeZone} />}
        </div>
        <FormField name="admin-cleanup-exclude-note" label="Note" optional description="Only admins see the note.">
          <Input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} data-testid="admin-cleanup-exclude-note" />
        </FormField>
      </div>
    </ConfirmDialog>
  )
}
