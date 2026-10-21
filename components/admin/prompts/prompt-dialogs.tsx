"use client"

import { deletePromptTemplate, setActivePromptTemplate } from "@/actions/prompts"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"

interface DialogProps {
  prompt: { id: string; name: string }
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface UseForRewindDialogProps extends DialogProps {
  /** The style guide in use now, by name. */
  current: string | null
  /** The season line while Rewind 2026 is open, or null. */
  seasonNote: string | null
}

/** The "Use for Rewind" confirm, naming the new and the current style guide. */
export function UseForRewindDialog({ prompt, current, seasonNote, open, onOpenChange }: UseForRewindDialogProps) {
  const toast = useToast()
  const replaces = current ? `Rewind stops using ${current} and uses ${prompt.name} instead.` : `Rewind starts using ${prompt.name}.`
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Use ${prompt.name} for Rewind?`}
      description={[replaces, seasonNote].filter(Boolean).join(" ")}
      confirmLabel="Use for Rewind"
      pendingLabel="Switching"
      action={async () => {
        const result = await setActivePromptTemplate(prompt.id)
        if (!result.success) return { error: result.error }
        toast.showSuccess(`Rewind now uses ${prompt.name}`)
        return {}
      }}
      data-testid="admin-prompt-activate-dialog"
      confirmTestId="admin-prompt-activate-confirm"
    />
  )
}

/** The delete confirm; `onDeleted` runs after the row is gone. */
export function DeletePromptDialog({ prompt, open, onOpenChange, onDeleted }: DialogProps & { onDeleted?: () => void }) {
  const toast = useToast()
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete ${prompt.name}?`}
      description="This can't be undone. Rewinds already generated keep their copy."
      confirmLabel="Delete"
      pendingLabel="Deleting"
      tone="destructive"
      action={async () => {
        const result = await deletePromptTemplate(prompt.id)
        if (!result.success) return { error: result.error }
        toast.showSuccess(`Deleted ${prompt.name}`)
        onDeleted?.()
        return {}
      }}
      data-testid="admin-prompt-delete-dialog"
      confirmTestId="admin-prompt-delete-confirm"
    />
  )
}
