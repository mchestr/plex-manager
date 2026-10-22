"use client"

import { useState, useTransition } from "react"

import { setLightThemeEnabled } from "@/actions/admin/light-theme"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"

/**
 * "Light theme for members" (P10.10): `Config.lightThemeEnabled`. Saves on
 * toggle and reverts if the save fails; the action revalidates the layout, so
 * the menus pick it up.
 */
export function LightThemeSwitch({ enabled }: { enabled: boolean }) {
  const [checked, setChecked] = useState(enabled)
  const [isPending, startTransition] = useTransition()
  const { showError } = useToast()

  const onCheckedChange = (next: boolean) => {
    setChecked(next)
    startTransition(async () => {
      const result = await setLightThemeEnabled({ enabled: next })
      if (!result.success) {
        setChecked(!next)
        showError(result.error)
        return
      }
    })
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="settings-light-theme">Light theme for members</Label>
        <p id="settings-light-theme-hint" className="text-label text-muted-foreground">
          Adds an Appearance choice to the account menu and the Account page. Off puts everyone back on dark.
        </p>
      </div>
      <Switch
        id="settings-light-theme"
        checked={checked}
        onCheckedChange={onCheckedChange}
        loading={isPending}
        aria-describedby="settings-light-theme-hint"
        data-testid="settings-light-theme-switch"
        className="mt-0.5"
      />
    </div>
  )
}
