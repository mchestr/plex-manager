"use client"

import { type RefObject, useId, useState } from "react"

import { postponeCleanupItems } from "@/actions/admin/cleanup-items"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { plural } from "@/lib/cleanup/action-words"
import { useCloseFocus } from "@/lib/cleanup/actions/items/dialog-focus"
import { newLeaveDates, postponedToast } from "@/lib/cleanup/actions/items/words"
import type { PostponeCleanupItemsResult } from "@/lib/cleanup/types/actions"
import { useFormat } from "@/lib/format-context"
import type { BoundFormat } from "@/lib/utils/format"
import { dayKey } from "@/lib/utils/zoned-time"
import type { BatchTarget } from "@/lib/validations/cleanup-actions"

/**
 * What a Postpone acts on (E37): titles by key, with the leave date each has
 * now, or the selection of a deletion batch, which the server builds again.
 * `seasons`: a season is among them, so its show moves too.
 */
export type PostponeTarget =
  | { itemKeys: readonly string[]; leaveOns: readonly (string | null)[]; seasons?: boolean }
  | { batch: BatchTarget; seasons?: boolean }

export interface PostponeDialogProps {
  target: PostponeTarget
  open: boolean
  onOpenChange: (open: boolean) => void
  /** After a Postpone that the server took, also one that moved nothing (`postponed: 0`). */
  onDone?: (result: PostponeCleanupItemsResult) => void
  /** A batch target only: the batch changed (`CLEANUP_REVIEW_STALE`), or another write met this one (`CONFLICT`). The dialog closes first. */
  onStale?: () => void
  /** Where focus goes after a success (UX 7.9). Default: back to the opener. */
  successFocus?: RefObject<HTMLElement | null>
}

const PRESETS = ["7", "14", "30"] as const
type Preset = (typeof PRESETS)[number]
const MAX_DAYS = 3650
const DAYS_ERROR = `Enter a whole number of days from 1 to ${MAX_DAYS}.`

const countOf = (target: PostponeTarget) => ("batch" in target ? target.batch.selectedCount : target.itemKeys.length)
const validDays = (days: number | null): days is number => days !== null && Number.isInteger(days) && days >= 1 && days <= MAX_DAYS

/** "New leave date: {date}", or "Each leave date moves {N} days later. New leave dates: {first} to {last}" (UX 8.6). */
function DateLine({ target, days, f }: { target: PostponeTarget; days: number; f: BoundFormat }) {
  // The dialog's content mounts at each open, so "today" is the day of the open
  const [now] = useState(() => Date.now())
  const today = dayKey(now, f.settings.timeZone)
  const { first, last } = newLeaveDates("batch" in target ? [] : target.leaveOns, today, days)
  const show = target.seasons ? " The whole show moves with it." : ""
  if (first === last) {
    return (
      <p className="text-ui text-foreground" data-testid="admin-cleanup-postpone-date">
        New leave date: <strong className="font-semibold">{f.dayKey(first)}</strong>.{show}
      </p>
    )
  }
  const firstWords = first.slice(0, 4) === last.slice(0, 4) ? f.dayKey(first, "day-month-short") : f.dayKey(first)
  return (
    <p className="text-ui text-foreground" data-testid="admin-cleanup-postpone-date">
      Each leave date moves {days} {days === 1 ? "day" : "days"} later. New leave dates: <strong className="font-semibold">{firstWords}</strong> to{" "}
      <strong className="font-semibold">{f.dayKey(last)}</strong>.{show}
    </p>
  )
}

/**
 * Postpone titles (UX 8.6, TS 10.3): chips for 7, 14 and 30 days and Other,
 * and the new leave date line. A batch target is due, so it has one new
 * date: today plus the days. Errors stay in the open dialog, except a stale
 * batch, which closes it and calls `onStale`. The toast counts the titles
 * that moved and those skipped because they are being deleted.
 */
export function PostponeDialog({ target, open, onOpenChange, onDone, onStale, successFocus }: PostponeDialogProps) {
  const f = useFormat()
  const toast = useToast()
  const focus = useCloseFocus(open, successFocus)
  const labelId = useId()
  const [preset, setPreset] = useState<Preset | null>("7")
  const [other, setOther] = useState<number | null>(null)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setPreset("7")
      setOther(null)
    }
  }
  const days = preset !== null ? Number(preset) : other
  const count = countOf(target)
  const titles = plural(count, "title")

  const postpone = async () => {
    if (!validDays(days)) return { error: DAYS_ERROR }
    const result = await postponeCleanupItems("batch" in target ? { batch: target.batch, days } : { itemKeys: [...target.itemKeys], days })
    if (!result.success) {
      const stale = result.code === "CLEANUP_REVIEW_STALE" || result.code === "CONFLICT"
      if (!("batch" in target) || !onStale || !stale) return { error: result.error }
      if (result.code === "CONFLICT") toast.showError(result.error)
      focus.toOpener()
      onStale()
      return {}
    }
    const words = postponedToast(result.data, count)
    if (words.error) toast.showError(words.text)
    else toast.showSuccess(words.text)
    focus.toTarget()
    onDone?.(result.data)
    return {}
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Postpone ${titles}?`}
      description="Their leave date moves later. It never moves earlier. Members see the new date."
      confirmLabel={`Postpone ${titles}`}
      pendingLabel="Postponing"
      action={postpone}
      successFocus={focus.successFocus}
      data-testid="admin-cleanup-postpone-dialog"
      confirmTestId="admin-cleanup-postpone-confirm"
    >
      <div className="flex flex-col gap-3">
        <span id={labelId} className="sr-only">
          Postpone by
        </span>
        <ChoiceChips<Preset>
          aria-labelledby={labelId}
          value={preset}
          onValueChange={setPreset}
          options={PRESETS.map((value) => ({ value, label: `${value} days`, "data-testid": `admin-cleanup-postpone-preset-${value}` }))}
          other={{
            label: "Other",
            checked: preset === null,
            onSelect: () => setPreset(null),
            unit: "days",
            value: other,
            onValueChange: setOther,
            min: 1,
            max: MAX_DAYS,
            step: 1,
            invalid: preset === null && other !== null && !validDays(other),
            "data-testid": "admin-cleanup-postpone-days",
          }}
          data-testid="admin-cleanup-postpone-preset"
        />
        {validDays(days) && <DateLine target={target} days={days} f={f} />}
      </div>
    </ConfirmDialog>
  )
}
