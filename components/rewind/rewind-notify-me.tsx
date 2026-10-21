"use client"

import { useState } from "react"

import type { notifyWhenRewindReady } from "@/actions/rewind-notify"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"

/**
 * "Notify me" on a Rewind that is still generating (P7.14): turns on the
 * ready notification for the year. The page passes the Server Action, so
 * this module never imports it.
 */
export function RewindNotifyMe({ year, action }: { year: number; action: typeof notifyWhenRewindReady }) {
  const { showSuccess, showError } = useToast()
  const [state, setState] = useState<"idle" | "busy" | "done">("idle")

  const onClick = async () => {
    setState("busy")
    const result = await action({ year })
    if (!result.success) {
      setState("idle")
      showError(result.error)
      return
    }
    setState("done")
    showSuccess("We'll let you know")
  }

  return (
    <Button
      variant="ink-outline"
      size="pill"
      className="self-start"
      loading={state === "busy"}
      disabled={state === "done"}
      onClick={onClick}
      data-testid="rewind-notify-me"
    >
      Notify me
    </Button>
  )
}
