"use client"

import { useTransition } from "react"

import { setSwapsNeedApproval } from "@/actions/admin/problem-reports"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"

interface SwapsNeedApprovalProps {
  userId: string
  name: string
  needsApproval: boolean
}

/** Holds a swap of the copy for this member's problem reports until an admin approves it (docs/problem-reports.md). Saves at once. */
export function SwapsNeedApproval({ userId, name, needsApproval }: SwapsNeedApprovalProps) {
  const [isPending, startTransition] = useTransition()
  const toast = useToast()

  const change = (next: boolean) =>
    startTransition(async () => {
      const result = await setSwapsNeedApproval({ userId, needsApproval: next })
      if (!result.success) toast.showError(result.error)
      else toast.showSuccess(next ? `${name}'s swaps need your approval` : `${name}'s swaps no longer need your approval`)
    })

  return (
    <div className="flex items-start gap-3" data-testid="admin-user-swaps-approval">
      <Switch
        id="admin-user-swaps-need-approval"
        checked={needsApproval}
        onCheckedChange={change}
        disabled={isPending}
        aria-describedby="admin-user-swaps-need-approval-hint"
        data-testid="admin-user-swaps-need-approval"
      />
      <div className="flex flex-col">
        <Label htmlFor="admin-user-swaps-need-approval">Swaps need approval</Label>
        <span id="admin-user-swaps-need-approval-hint" className="text-label text-muted-foreground">
          A swap of the copy for one of their problem reports waits for you to approve it.
        </span>
      </div>
    </div>
  )
}
