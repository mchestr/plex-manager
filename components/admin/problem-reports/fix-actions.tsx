"use client"

import { useTransition } from "react"

import { runProblemFix } from "@/actions/admin/problem-reports"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { useToast } from "@/components/ui/toast"
import { FIX_WORDS, type FixAction } from "@/lib/problem-reports/fixes"
import { icons } from "@/lib/ui/icons"

const testId = (action: FixAction) => `admin-problem-report-fix-${action.toLowerCase().replaceAll("_", "-")}`

/**
 * The fixes an admin can run on an open report: the one the problem points
 * to as a button named for it, and the rest under Other fixes. None removes
 * anything, so none asks to confirm.
 */
export function FixActions({ reportId, suggested, others }: { reportId: string; suggested: FixAction | null; others: FixAction[] }) {
  const { showError, showSuccess } = useToast()
  const [pending, startTransition] = useTransition()

  const run = (action: FixAction) =>
    startTransition(async () => {
      const result = await runProblemFix({ reportId, action })
      if (result.success) showSuccess(FIX_WORDS[action].running)
      else showError(result.error)
    })

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
              <DropdownMenuItem key={action} onClick={() => run(action)} data-testid={testId(action)}>
                {FIX_WORDS[action].button}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  )
}
