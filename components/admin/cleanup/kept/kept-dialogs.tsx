"use client"

import type { RefObject } from "react"

import { removeCleanupExclusion, removeCleanupKeep } from "@/actions/admin/cleanup-protections"
import { EndDateDialog } from "@/components/admin/cleanup/kept/end-date-dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { titleName } from "@/lib/cleanup/actions/keeps/words"
import type { ProtectionRow } from "@/lib/cleanup/types/list-parts"

/** The dialog that a row action opened. */
export type KeptDialog = "endKeep" | "removeExclusion" | "endDate"

interface KeptDialogsProps {
  /** The row of the dialog. It stays set while the dialog closes, so the words do not change. */
  row: ProtectionRow | null
  open: KeptDialog | null
  onOpenChange: (open: boolean) => void
  /** Where focus goes after a Keep or an exclusion ended: its row leaves the list. */
  successFocus?: RefObject<HTMLElement | null>
}

/** The words of an admin End keep (UX 8.6). The admin's own Keep reads "your". */
function endKeepWords(row: ProtectionRow | null, name: string) {
  const later = "The title can come back to Leaving soon after the next nightly check, with a full grace period."
  if (row?.by?.isYou) return { title: `End your Keep on ${name}?`, description: later }
  const member = row?.by?.name ?? "this member"
  return {
    title: `End ${member}'s Keep on ${name}?`,
    description: `${member.charAt(0).toUpperCase()}${member.slice(1)} sees that you ended it, on the Leaving soon page and on Account. ${later}`,
  }
}

/**
 * The row dialogs of the Kept and excluded tab (UX 8.6): End keep, Remove
 * exclusion and Change end date. Each waits for the server; an error stays
 * in the open dialog (UX 7.12), and a success toasts (UX 8.9). The page
 * reloads its data after each, so the row leaves the list.
 */
export function KeptDialogs({ row, open, onOpenChange, successFocus }: KeptDialogsProps) {
  const toast = useToast()
  const name = row ? titleName(row) : ""

  const endKeep = async () => {
    if (!row) return {}
    const result = await removeCleanupKeep({ keepId: row.id })
    if (!result.success) return { error: result.error }
    toast.showSuccess("Keep ended")
    return {}
  }

  const removeExclusion = async () => {
    if (!row) return {}
    const result = await removeCleanupExclusion({ exclusionId: row.id })
    if (!result.success) return { error: result.error }
    toast.showSuccess("Exclusion removed")
    return {}
  }

  const keepWords = endKeepWords(row, name)
  return (
    <>
      <ConfirmDialog
        open={open === "endKeep"}
        onOpenChange={onOpenChange}
        title={keepWords.title}
        description={keepWords.description}
        confirmLabel="End keep"
        pendingLabel="Ending"
        tone="destructive"
        action={endKeep}
        successFocus={successFocus}
        data-testid="admin-cleanup-end-keep-dialog"
        confirmTestId="admin-cleanup-end-keep-confirm"
      />
      <ConfirmDialog
        open={open === "removeExclusion"}
        onOpenChange={onOpenChange}
        title={`Remove the exclusion on ${name}?`}
        description="Rules can match it again at the next run. If it joins Leaving soon, it gets a full grace period."
        confirmLabel="Remove exclusion"
        pendingLabel="Removing"
        tone="destructive"
        action={removeExclusion}
        successFocus={successFocus}
        data-testid="admin-cleanup-remove-exclusion-dialog"
        confirmTestId="admin-cleanup-remove-exclusion-confirm"
      />
      <EndDateDialog
        target={row && { id: row.id, name, until: row.until }}
        open={open === "endDate"}
        onOpenChange={onOpenChange}
      />
    </>
  )
}
