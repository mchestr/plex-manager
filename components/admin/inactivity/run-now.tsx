"use client"

import { useTransition } from "react"

import { runMemberActivityNow } from "@/actions/admin/inactivity"
import { memberCount, runOutcome } from "@/components/admin/inactivity/run-outcome"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Time } from "@/components/ui/time"
import { useToast } from "@/components/ui/toast"
import type { InactivityRunRow } from "@/lib/data/inactivity"

interface RunNowProps {
  /** Automatic removal is on, so a run can remove members. */
  enabled: boolean
  /** Members the preview says a run would remove now. */
  removals: number
  lastRun: InactivityRunRow | null
}

const DONE = { queued: "Run queued. Reload the page in a minute to see the result.", finished: "Run finished" }

function LastRun({ run }: { run: InactivityRunRow | null }) {
  if (!run) {
    return (
      <p className="text-ui text-muted-foreground" data-testid="admin-inactivity-last-run">
        No run yet.
      </p>
    )
  }
  return (
    <p className="text-ui text-muted-foreground" data-testid="admin-inactivity-last-run">
      {run.trigger === "admin" ? "Run by an admin" : "Scheduled run"},{" "}
      <Time value={run.startedAt} nowLabel="just now" data-testid="admin-inactivity-last-run-timestamp" />. {runOutcome(run)}.
    </p>
  )
}

/**
 * The last run and "Run now", which reads last seen from Tautulli and, when
 * automatic removal is on, runs the sweep. While the preview lists members to
 * remove, it first asks to confirm their count; the run then removes no one
 * if more qualify after its fresh read. The action revalidates the page.
 */
export function RunNow({ enabled, removals, lastRun }: RunNowProps) {
  const toast = useToast()
  const [running, startRun] = useTransition()
  const done = (queued: boolean) => toast.showSuccess(queued ? DONE.queued : DONE.finished)

  const runNow = () =>
    startRun(async () => {
      const result = await runMemberActivityNow({})
      if (!result.success) toast.showError(result.error)
      else done(result.data.queued)
    })

  const runConfirmed = async () => {
    const result = await runMemberActivityNow({ confirmedRemovals: removals })
    if (!result.success) return { error: result.error }
    done(result.data.queued)
    return {}
  }

  return (
    <div className="flex flex-col gap-3 border-t pt-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-h3">Last run</h3>
        {enabled && removals > 0 ? (
          <ConfirmDialog
            trigger={
              <Button type="button" variant="secondary" data-testid="admin-inactivity-run-now">
                Run now
              </Button>
            }
            title={`Remove Plex access from ${memberCount(removals)} now?`}
            description="They lose access to the Plex server, as with Remove Plex access. The run reads Tautulli again first, and removes no one if more members are inactive then."
            confirmLabel="Remove access"
            pendingLabel="Running"
            tone="destructive"
            action={runConfirmed}
            data-testid="admin-inactivity-run-dialog"
            confirmTestId="admin-inactivity-run-confirm"
          />
        ) : (
          <Button type="button" variant="secondary" onClick={runNow} loading={running} loadingLabel="Running" data-testid="admin-inactivity-run-now">
            Run now
          </Button>
        )}
      </div>
      <LastRun run={lastRun} />
    </div>
  )
}
