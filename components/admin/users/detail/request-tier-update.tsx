"use client"

import { useTransition } from "react"

import { applyMemberRequestTier } from "@/actions/admin/request-tiers"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"

/** Writes the member's tier quota to Overseerr now; the page then reads Overseerr again to show the result. */
export function RequestTierUpdate({ userId, name }: { userId: string; name: string }) {
  const [isPending, startTransition] = useTransition()
  const toast = useToast()

  const update = () =>
    startTransition(async () => {
      const result = await applyMemberRequestTier({ userId })
      if (!result.success) toast.showError(result.error)
      else toast.showSuccess(result.data.updated ? `Updated ${name}'s request limits in Overseerr` : `Overseerr already had ${name}'s limits`)
    })

  return (
    <Button variant="outline" size="sm" loading={isPending} loadingLabel="Updating" onClick={update} data-testid="admin-user-tier-update">
      Update Overseerr
    </Button>
  )
}
