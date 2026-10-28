"use client"

import { useTransition } from "react"

import { setMemberTiersExcluded } from "@/actions/admin/request-tiers"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"

interface RequestTiersExclusionProps {
  userId: string
  name: string
  excluded: boolean
}

/** Keeps this member's Overseerr quota out of the daily request-limit sync, so a quota set by hand stays. */
export function RequestTiersExclusion({ userId, name, excluded }: RequestTiersExclusionProps) {
  const [isPending, startTransition] = useTransition()
  const toast = useToast()

  const change = (next: boolean) =>
    startTransition(async () => {
      const result = await setMemberTiersExcluded({ userId, excluded: next })
      if (!result.success) toast.showError(result.error)
      else toast.showSuccess(next ? `${name} keeps their own request limits` : `${name} follows the request limit tiers`)
    })

  return (
    <div className="flex items-start gap-3" data-testid="admin-user-tiers-exclusion">
      <Switch
        id="admin-user-tiers-excluded"
        checked={excluded}
        onCheckedChange={change}
        disabled={isPending}
        data-testid="admin-user-tiers-excluded-toggle"
      />
      <div className="flex flex-col">
        <Label htmlFor="admin-user-tiers-excluded">Set request limits by hand</Label>
        <span className="text-label text-muted-foreground">The daily request limit sync doesn't change this member's Overseerr quota.</span>
      </div>
    </div>
  )
}
