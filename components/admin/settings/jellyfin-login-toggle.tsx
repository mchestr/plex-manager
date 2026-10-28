"use client"

import { useTransition } from "react"

import { toggleJellyfinLogin } from "@/actions/admin/admin-servers"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"

interface JellyfinLoginToggleProps {
  /** `JellyfinServer.enabledForLogin`. */
  enabledForLogin: boolean
}

/**
 * "Allow Jellyfin sign-in", live in the Jellyfin row of Other integrations
 * and outside its Sheet: it saves at once, so it is a switch, not a field
 * behind Edit (NN/g, "Toggle-switch guidelines"), and its hint says so. Off
 * refuses Jellyfin sign-in and hides it from the sign-in page.
 */
export function JellyfinLoginToggle({ enabledForLogin }: JellyfinLoginToggleProps) {
  const [isPending, startTransition] = useTransition()
  const toast = useToast()

  const toggle = (on: boolean) => {
    startTransition(async () => {
      const result = await toggleJellyfinLogin(on)
      if (result.success) {
        // The action revalidates the page, so the switch re-renders with the saved value
        toast.showSuccess(`Jellyfin sign-in turned ${on ? "on" : "off"}`)
      } else {
        toast.showError(result.error || "Could not change Jellyfin sign-in")
      }
    })
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <Label htmlFor="jellyfin-login">Allow Jellyfin sign-in</Label>
        <p id="jellyfin-login-hint" className="text-label text-muted-foreground">
          Members can sign in with their Jellyfin account. This saves at once.
        </p>
      </div>
      <Switch
        id="jellyfin-login"
        checked={enabledForLogin}
        onCheckedChange={toggle}
        loading={isPending}
        aria-describedby="jellyfin-login-hint"
        data-testid="jellyfin-login-toggle"
      />
    </div>
  )
}
