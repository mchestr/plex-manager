"use client"

import { useRouter } from "next/navigation"
import type { ReactElement } from "react"

import { rollbackRewind } from "@/actions/admin/rewind-season"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { useFormat } from "@/lib/format-context"

interface RollbackDialogProps {
  userId: string
  year: number
  /** The member's name, for the title. */
  name: string
  /** When the version a roll back restores was generated (ISO), or null when it does not say. */
  from: string | null
  trigger?: ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/** The confirm for Roll back (P7.9, UI-29), on the preview page and the season table. */
export function RollbackDialog({ userId, year, name, from, trigger, open, onOpenChange }: RollbackDialogProps) {
  const f = useFormat()
  const toast = useToast()
  const router = useRouter()
  const version = from ? `the version from ${f.date(from, "long")}` : "its previous version"

  return (
    <ConfirmDialog
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={`Roll back ${name}'s Rewind ${year} to ${version}?`}
      description="The current version is kept, so rolling back again restores it."
      confirmLabel="Roll back"
      pendingLabel="Rolling back"
      tone="destructive"
      action={async () => {
        const result = await rollbackRewind({ userId, year })
        if (!result.success) return { error: result.error }
        toast.showSuccess(`Rolled back ${name}'s Rewind ${year}`)
        router.refresh()
        return {}
      }}
      data-testid="admin-rewind-rollback-dialog"
      confirmTestId="admin-rewind-rollback-confirm"
    />
  )
}
