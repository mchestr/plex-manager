"use client"

import { useTransition } from "react"

import { setMemberInactivityExcluded } from "@/actions/admin/inactivity"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"

interface InactivityExclusionProps {
  userId: string
  name: string
  excluded: boolean
}

/** Keeps this member out of the inactivity sweep, so a long break never costs them their Plex access. Saves at once. */
export function InactivityExclusion({ userId, name, excluded }: InactivityExclusionProps) {
  const [isPending, startTransition] = useTransition()
  const toast = useToast()

  const change = (next: boolean) =>
    startTransition(async () => {
      const result = await setMemberInactivityExcluded({ userId, excluded: next })
      if (!result.success) toast.showError(result.error)
      else toast.showSuccess(next ? `${name} is never removed for inactivity` : `${name} can be removed for inactivity`)
    })

  return (
    <div className="flex items-start gap-3" data-testid="admin-user-inactivity-exclusion">
      <Switch
        id="admin-user-inactivity-excluded"
        checked={excluded}
        onCheckedChange={change}
        disabled={isPending}
        aria-describedby="admin-user-inactivity-excluded-hint"
        data-testid="admin-user-inactivity-excluded"
      />
      <div className="flex flex-col">
        <Label htmlFor="admin-user-inactivity-excluded">Never remove for inactivity</Label>
        <span id="admin-user-inactivity-excluded-hint" className="text-label text-muted-foreground">
          The daily run keeps their Plex access however long they go without playing.
        </span>
      </div>
    </div>
  )
}
