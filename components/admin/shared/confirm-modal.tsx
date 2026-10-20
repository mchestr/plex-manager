"use client"

import { ConfirmDialog } from "@/components/ui/confirm-dialog"

interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  /** The dialog shows its pending state until a returned promise settles. */
  onConfirm: () => void | Promise<void>
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  /** Only a red class still means anything: it picks the destructive tone. */
  confirmButtonClass?: string
  /** `data-testid` for the dialog element. */
  testId?: string
  /** `data-testid` for the confirm button. */
  confirmTestId?: string
}

/**
 * @deprecated Use ConfirmDialog from components/ui/confirm-dialog with
 * useActionDialog (ui-design-system 9.4). This adapter renders ConfirmDialog
 * in controlled mode until its importers move (P10.18 moves the user action
 * buttons and P10.11 deletes it).
 */
export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  confirmButtonClass,
  testId,
  confirmTestId,
}: ConfirmModalProps) {
  return (
    <ConfirmDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={title}
      description={message}
      confirmLabel={confirmText}
      cancelLabel={cancelText}
      tone={confirmButtonClass?.includes("red") ? "destructive" : "default"}
      action={async () => {
        await onConfirm()
        return {}
      }}
      data-testid={testId}
      confirmTestId={confirmTestId}
    />
  )
}
