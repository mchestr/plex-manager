"use client"

import { useLayoutEffect, useRef, useState, useTransition } from "react"

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
  /** The members the preview says a run would remove now, by id. */
  removalIds: string[]
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
 * remove, it first asks to confirm them and passes their ids on; the run then
 * removes no one if its fresh read finds a member to remove who is not in the
 * list. The action revalidates the page, which can change the list, so one
 * button stays in place either way and focus comes back to it.
 */
export function RunNow({ enabled, removalIds, lastRun }: RunNowProps) {
  const toast = useToast()
  const [running, startRun] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const done = (queued: boolean) => toast.showSuccess(queued ? DONE.queued : DONE.finished)

  // The router keeps a page it leaves (Activity): an open confirm closes as the page hides, as ConfirmDialog's own
  // open state does, rather than opening again over the page on the way back
  useLayoutEffect(() => () => setConfirming(false), [])

  const runNow = () => {
    if (enabled && removalIds.length > 0) {
      setConfirming(true)
      return
    }
    startRun(async () => {
      const result = await runMemberActivityNow({})
      if (!result.success) toast.showError(result.error)
      else done(result.data.queued)
    })
  }

  const runConfirmed = async () => {
    const result = await runMemberActivityNow({ confirmedUserIds: removalIds })
    if (!result.success) return { error: result.error }
    done(result.data.queued)
    return {}
  }

  return (
    <div className="flex flex-col gap-3 border-t pt-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-h3">Last run</h3>
        <Button
          ref={button}
          type="button"
          variant="secondary"
          onClick={runNow}
          loading={running}
          loadingLabel="Running"
          data-testid="admin-inactivity-run-now"
        >
          Run now
        </Button>
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={`Remove Plex access from ${memberCount(removalIds.length)} now?`}
          description="They lose access to the Plex server, as with Remove Plex access. The run reads Tautulli again first. If it would then remove a member who is not in the list on this page, it removes no one."
          confirmLabel="Remove access"
          pendingLabel="Running"
          tone="destructive"
          action={runConfirmed}
          successFocus={button}
          data-testid="admin-inactivity-run-dialog"
          confirmTestId="admin-inactivity-run-confirm"
        />
      </div>
      <LastRun run={lastRun} />
    </div>
  )
}
