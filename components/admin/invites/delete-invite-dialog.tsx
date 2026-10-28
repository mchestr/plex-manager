"use client"

import { deleteInvite } from "@/actions/admin/invites"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"

interface DeleteInviteDialogProps {
  /** The invite to delete; null keeps the dialog closed. */
  invite: { id: string; code: string } | null
  onOpenChange: (open: boolean) => void
  /** Runs after a delete, before the dialog closes: the detail page leaves for the list. */
  onDeleted?: () => void
}

/** "Delete invite AUDIT2026?" (P10.1): destructive, pending while it runs, errors inside the dialog. */
export function DeleteInviteDialog({ invite, onOpenChange, onDeleted }: DeleteInviteDialogProps) {
  const { showSuccess } = useToast()

  const remove = async () => {
    if (!invite) return {}
    const result = await deleteInvite({ id: invite.id })
    if (!result.success) return { error: result.error }
    showSuccess(`Deleted invite ${invite.code}`)
    onDeleted?.()
    return {}
  }

  return (
    <ConfirmDialog
      open={invite !== null}
      onOpenChange={onOpenChange}
      title={invite ? `Delete invite ${invite.code}?` : "Delete invite?"}
      description="Its link stops working at once. Members who already joined keep their access. You can't undo this."
      confirmLabel="Delete invite"
      pendingLabel="Deleting"
      tone="destructive"
      action={remove}
      data-testid="admin-invites-delete-dialog"
      confirmTestId="admin-invite-delete"
    />
  )
}
