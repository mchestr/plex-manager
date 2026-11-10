"use client"

import { useState, useTransition, type ReactNode } from "react"

import { removeProblemFile, runProblemFix, swapProblemCopy } from "@/actions/admin/problem-reports"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { useToast } from "@/components/ui/toast"
import { useActionDialog } from "@/hooks/use-action-dialog"
import { FIX_WORDS, type FixAction } from "@/lib/problem-reports/fixes"
import { icons } from "@/lib/ui/icons"

const testId = (action: FixAction) => `admin-problem-report-fix-${action.toLowerCase().replaceAll("_", "-")}`

/** Starts a fix that needs no confirm: a swap has its own action, the rest share one. */
function start(reportId: string, action: Exclude<FixAction, "REMOVE_AND_SEARCH">) {
  return action === "SWAP" ? swapProblemCopy({ reportId }) : runProblemFix({ reportId, action })
}

const removeFile = (reportId: string) => removeProblemFile({ reportId })

/** The confirm for Remove the file and search, with what it will do to this title. */
function RemoveFileDialog({ reportId, facts, open, onOpenChange }: { reportId: string; facts: ReactNode; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { run } = useActionDialog(removeFile, { success: FIX_WORDS.REMOVE_AND_SEARCH.running })
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      tone="destructive"
      title="Remove the file and search?"
      description="The title is unavailable to everyone until a new copy downloads, which can take a day or more. Use this when the only other copies are lower quality."
      confirmLabel="Remove and search"
      pendingLabel="Removing"
      action={() => run(reportId)}
      data-testid="admin-problem-report-remove-dialog"
      confirmTestId="admin-problem-report-remove-confirm"
    >
      {facts}
    </ConfirmDialog>
  )
}

/**
 * The fixes an admin can run on an open report: the one the problem points
 * to as a button named for it, and the rest under Other fixes. Remove the
 * file and search is the one that takes the title away from everyone, so it
 * asks to confirm, with `removal` saying what it will do.
 */
export function FixActions({ reportId, suggested, others, removal }: { reportId: string; suggested: FixAction | null; others: FixAction[]; removal?: ReactNode }) {
  const { showError, showSuccess } = useToast()
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  const run = (action: FixAction) => {
    if (action === "REMOVE_AND_SEARCH") {
      setConfirming(true)
      return
    }
    startTransition(async () => {
      const result = await start(reportId, action)
      if (result.success) showSuccess(FIX_WORDS[action].running)
      else showError(result.error)
    })
  }

  return (
    <>
      {suggested && (
        <Button variant="outline" onClick={() => run(suggested)} loading={pending} loadingLabel="Starting" data-testid={testId(suggested)}>
          {FIX_WORDS[suggested].button}
        </Button>
      )}
      {others.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" disabled={pending} data-testid="admin-problem-report-other-fixes" />}>
            Other fixes
            <Icon icon={icons.chevronDown} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {others.map((action) => (
              <DropdownMenuItem key={action} variant={action === "REMOVE_AND_SEARCH" ? "destructive" : "default"} onClick={() => run(action)} data-testid={testId(action)}>
                {FIX_WORDS[action].button}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {[suggested, ...others].includes("REMOVE_AND_SEARCH") && <RemoveFileDialog reportId={reportId} facts={removal} open={confirming} onOpenChange={setConfirming} />}
    </>
  )
}
