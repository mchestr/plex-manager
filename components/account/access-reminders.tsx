"use client"

import { useState, useTransition } from "react"

import { setAccessReminders } from "@/actions/account"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"

/** "Access reminders": the warning emails before removal for inactivity. Saves on toggle and reverts if the save fails. */
export function AccessRemindersSwitch({ enabled }: { enabled: boolean }) {
  const [checked, setChecked] = useState(enabled)
  const [isPending, startTransition] = useTransition()
  const { showError } = useToast()

  const onCheckedChange = (next: boolean) => {
    setChecked(next)
    startTransition(async () => {
      const result = await setAccessReminders({ enabled: next })
      if (!result.success) {
        setChecked(!next)
        showError(result.error)
      }
    })
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="account-access-reminders">Access reminders</Label>
        <p id="account-access-reminders-hint" className="text-label text-muted-foreground">
          Emails before your access ends for inactivity.
        </p>
      </div>
      <Switch
        id="account-access-reminders"
        checked={checked}
        onCheckedChange={onCheckedChange}
        loading={isPending}
        aria-describedby="account-access-reminders-hint"
        data-testid="account-access-reminders-switch"
        className="mt-0.5"
      />
    </div>
  )
}
