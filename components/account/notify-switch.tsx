"use client"

import { useState, useTransition } from "react"

import { setRewindNotify } from "@/actions/account"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"

/** "Tell me when my Rewind is ready": saves on toggle and reverts if the save fails. */
export function NotifySwitch({ notify }: { notify: boolean }) {
  const [checked, setChecked] = useState(notify)
  const [isPending, startTransition] = useTransition()
  const { showError } = useToast()

  const onCheckedChange = (next: boolean) => {
    setChecked(next)
    startTransition(async () => {
      const result = await setRewindNotify({ notify: next })
      if (!result.success) {
        setChecked(!next)
        showError(result.error)
      }
    })
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="account-notify">Tell me when my Rewind is ready</Label>
        <p id="account-notify-hint" className="text-label text-muted-foreground">
          Sends a Discord message if you linked Discord, and shows a notice on other pages. The Rewind card on Home
          always shows when your Rewind is ready.
        </p>
      </div>
      <Switch
        id="account-notify"
        checked={checked}
        onCheckedChange={onCheckedChange}
        loading={isPending}
        aria-describedby="account-notify-hint"
        data-testid="account-notify-switch"
        className="mt-0.5"
      />
    </div>
  )
}
