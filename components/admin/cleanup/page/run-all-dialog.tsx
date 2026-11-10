"use client"

import { useId, type ReactElement, type RefObject } from "react"

import { runCleanupNow } from "@/actions/admin/cleanup-settings"
import { readTimeText } from "@/components/admin/cleanup/preview/read-time"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { SETTINGS_TOASTS, SETTINGS_WORDS } from "@/lib/cleanup/actions/settings/words"
import { useFormat } from "@/lib/format-context"

interface RunAllDialogProps {
  /** When the newest library data was read (`snapshot.takenAt`); null before the first read. */
  dataFrom: string | null
  /** The render's clock, for "today". */
  now: number
  /** The element that opens the dialog; omit it when `open` is controlled. */
  trigger?: ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
  successFocus?: RefObject<HTMLElement | null>
}

/**
 * "Run all rules now?" (UX 8.6): a run of every rule on the stored library
 * data. New matches join Leaving soon and rescues apply, and the run never
 * deletes (TS 10.3). A refusal (a run in progress, the queue down) stays
 * inside the dialog. Success toasts "Run started" (UX 8.9).
 */
export function RunAllDialog({ dataFrom, now, ...dialog }: RunAllDialogProps) {
  const f = useFormat()
  const toast = useToast()
  const from = dataFrom ? `Each rule checks the library data from ${readTimeText(f, dataFrom, now)}.` : "Each rule checks the newest library data."
  return (
    <ConfirmDialog
      {...dialog}
      title="Run all rules now?"
      description={`Reads no new library data. ${from} New matches join Leaving soon, and rescues apply. A run never deletes: due items wait for the nightly run or your approval.`}
      confirmLabel="Run all rules"
      pendingLabel="Starting"
      action={async () => {
        const result = await runCleanupNow()
        if (!result.success) return { error: result.error }
        toast.showSuccess(SETTINGS_TOASTS.runStarted)
        return {}
      }}
      data-testid="admin-cleanup-run-all-dialog"
      confirmTestId="admin-cleanup-run-all-confirm"
    />
  )
}

interface RunAllButtonProps {
  /** The job queue is set up. Without it the button is disabled, with the reason as its description (TS 9.5 item 4). */
  redis: boolean
  dataFrom: string | null
  now: number
  variant?: "outline" | "secondary"
  size?: "sm" | "default"
  "data-testid"?: string
}

/** "Run all rules now", which opens {@link RunAllDialog}. Without Redis it opens nothing and says why. */
export function RunAllButton({ redis, dataFrom, now, variant = "outline", size = "sm", "data-testid": testId = "admin-cleanup-settings-run-all" }: RunAllButtonProps) {
  const reasonId = useId()
  if (!redis) {
    return (
      <>
        <Button type="button" variant={variant} size={size} disabled focusableWhenDisabled aria-describedby={reasonId} data-testid={testId}>
          Run all rules now
        </Button>
        <span id={reasonId} className="sr-only">
          {SETTINGS_WORDS.redis}
        </span>
      </>
    )
  }
  return (
    <RunAllDialog
      dataFrom={dataFrom}
      now={now}
      trigger={
        <Button type="button" variant={variant} size={size} data-testid={testId}>
          Run all rules now
        </Button>
      }
    />
  )
}
