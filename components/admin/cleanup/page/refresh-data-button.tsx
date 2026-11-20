"use client"

import { useEffect, useId, useState, useTransition } from "react"

import { refreshCleanupData } from "@/actions/admin/cleanup-settings"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { useToast } from "@/components/ui/toast"
import { SETTINGS_TOASTS, SETTINGS_WORDS } from "@/lib/cleanup/actions/settings/words"
import { icons } from "@/lib/ui/icons"

/** How long the button waits for the read it queued to start and end before it shows its label again. @internal */
export const READ_WAIT_MS = 3 * 60_000

interface RefreshDataButtonProps {
  /** The job queue is set up. Without it the button is disabled, with the reason as its description (TS 9.5 item 4). */
  redis: boolean
  /** A library read holds its claim: the button shows `loading` with "Reading" (UX 4.1.4). */
  reading?: boolean
  variant?: "ghost" | "outline"
  size?: "sm" | "default"
  className?: string
  /** `admin-cleanup-refresh-data` in the source line, `admin-cleanup-settings-refresh-data` in Settings, `admin-cleanup-alert-{kind}-action` in an alert. */
  "data-testid"?: string
}

/**
 * "Refresh data now" (UX 8.6): a library read now, with no dialog. While the
 * action runs, and while a read holds its claim, the button shows `loading`
 * with "Reading". After a start it stays so until that read ends, or for 3
 * minutes. A refusal (a read in progress, the queue down) shows its words
 * in an error toast. Without Redis the button is disabled but focusable,
 * and its description says why.
 */
export function RefreshDataButton({
  redis,
  reading = false,
  variant = "ghost",
  size = "sm",
  className,
  "data-testid": testId = "admin-cleanup-refresh-data",
}: RefreshDataButtonProps) {
  const toast = useToast()
  const reasonId = useId()
  const [pending, startRefresh] = useTransition()
  const [started, setStarted] = useState(false)
  const [wasReading, setWasReading] = useState(reading)

  // The read that this button queued has ended once the server stops reporting a read
  if (reading !== wasReading) {
    setWasReading(reading)
    if (!reading) setStarted(false)
  }

  useEffect(() => {
    if (!started) return
    const timer = setTimeout(() => setStarted(false), READ_WAIT_MS)
    return () => clearTimeout(timer)
  }, [started])

  const refresh = () =>
    startRefresh(async () => {
      const result = await refreshCleanupData()
      if (!result.success) {
        toast.showError(result.error)
        return
      }
      setStarted(true)
      toast.showSuccess(SETTINGS_TOASTS.readStarted)
    })

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        icon={<Icon icon={icons.sync} />}
        loading={redis && (pending || reading || started)}
        loadingLabel="Reading"
        disabled={!redis}
        {...(redis ? {} : { focusableWhenDisabled: true, "aria-describedby": reasonId })}
        onClick={refresh}
        data-testid={testId}
      >
        Refresh data now
      </Button>
      {!redis && (
        <span id={reasonId} className="sr-only">
          {SETTINGS_WORDS.redis}
        </span>
      )}
    </>
  )
}
