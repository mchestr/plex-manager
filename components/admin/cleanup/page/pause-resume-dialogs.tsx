"use client"

import type { ReactElement, RefObject } from "react"

import { pauseCleanup, resumeCleanup } from "@/actions/admin/cleanup-settings"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Icon } from "@/components/ui/icon"
import { useToast } from "@/components/ui/toast"
import { SETTINGS_TOASTS } from "@/lib/cleanup/actions/settings/words"
import { RESUME_HOLD_DAYS } from "@/lib/cleanup/constants"
import type { PauseCleanupResult, ResumeCleanupResult } from "@/lib/cleanup/types/actions"
import { useFormat } from "@/lib/format-context"
import { addDays } from "@/lib/ui/date-range"
import { icons } from "@/lib/ui/icons"
import { dayKey } from "@/lib/utils/zoned-time"

interface DialogControl {
  /** The element that opens the dialog; omit it when `open` is controlled. */
  trigger?: ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Where focus goes after a success, such as a button that replaces the trigger. */
  successFocus?: RefObject<HTMLElement | null>
}

const PAUSE_WORDS =
  "No run changes anything, and nothing is deleted. A deletion that has already started finishes, and no other starts. Approved batches go back " +
  "to waiting for your approval. The Leaving soon collections in Plex empty, and members no longer see the Leaving soon page. Items keep their " +
  "place and every Keep stays. After you resume, nothing is deleted for 7 days."

/**
 * "Pause all cleanup?" (UX 8.6): the emergency stop. It never waits for a
 * run (TS 8.12). Success toasts "Cleanup paused" (UX 8.9).
 */
export function PauseDialog({ onPaused, ...dialog }: DialogControl & { onPaused?: (result: PauseCleanupResult) => void }) {
  const toast = useToast()
  return (
    <ConfirmDialog
      {...dialog}
      title="Pause all cleanup?"
      description={PAUSE_WORDS}
      confirmLabel="Pause all cleanup"
      pendingLabel="Pausing"
      action={async () => {
        const result = await pauseCleanup()
        if (!result.success) return { error: result.error }
        toast.showSuccess(SETTINGS_TOASTS.paused)
        onPaused?.(result.data)
        return {}
      }}
      data-testid="admin-cleanup-pause-dialog"
      confirmTestId="admin-cleanup-pause-confirm"
    />
  )
}

/**
 * "Resume cleanup?" (UX 8.6). It names the end of the 7-day hold in the
 * server zone: today at `now`, plus 7 days. A refusal (a run in progress)
 * stays inside the dialog. Success toasts "Cleanup resumed" (UX 8.9).
 */
export function ResumeDialog({ now, onResumed, ...dialog }: DialogControl & { now: number; onResumed?: (result: ResumeCleanupResult) => void }) {
  const f = useFormat()
  const toast = useToast()
  const holdUntil = f.dayKey(addDays(dayKey(now, f.settings.timeZone), RESUME_HOLD_DAYS))
  return (
    <ConfirmDialog
      {...dialog}
      title="Resume cleanup?"
      description={`Members see Leaving soon again. Nothing is deleted before ${holdUntil}: items due earlier get that date.`}
      confirmLabel="Resume cleanup"
      pendingLabel="Resuming"
      action={async () => {
        const result = await resumeCleanup()
        if (!result.success) return { error: result.error }
        toast.showSuccess(SETTINGS_TOASTS.resumed)
        onResumed?.(result.data)
        return {}
      }}
      data-testid="admin-cleanup-resume-dialog"
      confirmTestId="admin-cleanup-resume-confirm"
    />
  )
}

interface TriggerProps {
  variant?: "secondary" | "outline"
  size?: "sm" | "default"
  "data-testid"?: string
}

/** "Pause all cleanup" (UX 4.0): a secondary button with the pause icon that opens {@link PauseDialog}. @internal */
export function PauseButton({ variant = "secondary", size = "default", "data-testid": testId = "admin-cleanup-pause" }: TriggerProps) {
  return (
    <PauseDialog
      trigger={
        <Button type="button" variant={variant} size={size} icon={<Icon icon={icons.paused} />} data-testid={testId}>
          Pause all cleanup
        </Button>
      }
    />
  )
}

/** "Resume cleanup" (UX 4.0, 4.1.4): the play icon, and {@link ResumeDialog}. */
export function ResumeButton({ now, variant = "secondary", size = "default", "data-testid": testId = "admin-cleanup-resume" }: TriggerProps & { now: number }) {
  return (
    <ResumeDialog
      now={now}
      trigger={
        <Button type="button" variant={variant} size={size} icon={<Icon icon={icons.playing} />} data-testid={testId}>
          Resume cleanup
        </Button>
      }
    />
  )
}
