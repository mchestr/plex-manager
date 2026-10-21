"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"

import { generateAllRewinds, prepareRewindSeason, retryFailedRewinds } from "@/actions/admin/rewind-season"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { useFormat } from "@/lib/format-context"
import type { SeasonCostEstimate } from "@/lib/wrapped/admin/estimate"

import { seasonStatusKey } from "./season-progress"

interface SeasonActionsProps {
  year: number
  estimates: { all: SeasonCostEstimate; failed: SeasonCostEstimate }
  /** Why Run final cut is disabled ("Available from 1 January"); P8.5 enables it. */
  finalCutNote: string
}

type BulkAction = typeof prepareRewindSeason

/** The confirm's description: the member count, the estimate and, past the budget, the template count. */
function useDescribe() {
  const f = useFormat()
  return (lead: string, estimate: SeasonCostEstimate) => {
    const members = estimate.members === 1 ? "1 member" : `${f.number(estimate.members)} members`
    const cost =
      estimate.llmMembers === 0
        ? "Every Rewind uses template copy, so it costs nothing."
        : `Estimated AI cost: ${f.money(estimate.costUsd, "prose")} for ${f.number(estimate.llmMembers)} AI-written Rewinds.`
    const cap =
      estimate.pastCap > 0
        ? ` ${f.number(estimate.pastCap)} would get template copy because the season budget runs out.`
        : ""
    return `${lead} ${members}. ${cost}${cap}`
  }
}

/** Prepare season, Generate all, Retry failed and Run final cut, each behind a confirm (P7.8). */
export function SeasonActions({ year, estimates, finalCutNote }: SeasonActionsProps) {
  const router = useRouter()
  const toast = useToast()
  const queryClient = useQueryClient()
  const describe = useDescribe()

  const run = (action: BulkAction, done: string) => async () => {
    const result = await action({ year })
    if (!result.success) return { error: result.error }
    toast.showSuccess(result.data.alreadyQueued ? "That run is already going" : done)
    await queryClient.invalidateQueries({ queryKey: seasonStatusKey(year) })
    router.refresh()
    return {}
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="admin-rewind-actions">
      <span className="text-label text-muted-foreground" id="admin-rewind-final-cut-note">
        {finalCutNote}
      </span>
      <Button variant="secondary" disabled aria-describedby="admin-rewind-final-cut-note" data-testid="admin-rewind-final-cut-button">
        Run final cut
      </Button>
      <ConfirmDialog
        trigger={
          <Button variant="secondary" disabled={estimates.failed.members === 0} data-testid="admin-rewind-retry-failed-button">
            Retry failed
          </Button>
        }
        title={`Retry the failed Rewinds for ${year}?`}
        description={describe("Generates again for", estimates.failed)}
        confirmLabel="Retry failed"
        pendingLabel="Starting"
        action={run(retryFailedRewinds, "Retrying the failed Rewinds")}
        data-testid="admin-rewind-retry-failed-dialog"
        confirmTestId="admin-rewind-retry-failed-confirm"
      />
      <ConfirmDialog
        trigger={
          <Button variant="secondary" data-testid="admin-rewind-generate-all-button">
            Generate all
          </Button>
        }
        title={`Generate every Rewind for ${year}?`}
        description={describe("Generates for", estimates.all)}
        confirmLabel="Generate all"
        pendingLabel="Starting"
        action={run(generateAllRewinds, "Generating Rewinds")}
        data-testid="admin-rewind-generate-all-dialog"
        confirmTestId="admin-rewind-generate-all-confirm"
      />
      <ConfirmDialog
        trigger={<Button data-testid="admin-rewind-prepare-button">Prepare season</Button>}
        title={`Prepare the ${year} season?`}
        description={describe("Reads the server's plays and warms titles, then generates for", estimates.all)}
        confirmLabel="Prepare season"
        pendingLabel="Starting"
        action={run(prepareRewindSeason, "Preparing the season. This can take a few minutes.")}
        data-testid="admin-rewind-prepare-dialog"
        confirmTestId="admin-rewind-prepare-confirm"
      />
    </div>
  )
}
