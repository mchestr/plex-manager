"use client"

import { ConfirmDialog } from "@/components/ui/confirm-dialog"

interface DiscardChangesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** What is being edited: "Discard changes to Plex server?" */
  title: string
  onDiscard: () => void
  /** The dialog is `<testId>`, its confirm button `<testId>-confirm`. */
  "data-testid": string
}

/**
 * Asked before leaving a form with unsaved changes (Cloudscape, "Unsaved
 * changes"; NN/g, "Confirmation dialogs"): only when there is work to lose,
 * never to enter edit mode or to save. Keep editing returns to the form.
 */
export function DiscardChangesDialog({ open, onOpenChange, title, onDiscard, "data-testid": testId }: DiscardChangesDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Discard changes to ${title}?`}
      description="You will lose your changes."
      confirmLabel="Discard changes"
      cancelLabel="Keep editing"
      tone="destructive"
      action={async () => {
        onDiscard()
        return {}
      }}
      data-testid={testId}
      confirmTestId={`${testId}-confirm`}
    />
  )
}
