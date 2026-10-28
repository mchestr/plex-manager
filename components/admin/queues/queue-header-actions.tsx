"use client"

import { Play, RefreshCw } from "lucide-react"
import { useState, useTransition } from "react"

import { pauseJobQueue, resumeJobQueue, triggerWatchlistSyncJob } from "@/actions/admin/queue"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Icon } from "@/components/ui/icon"
import { useHoldLiveRefresh } from "@/components/ui/live-status"
import { useToast } from "@/components/ui/toast"
import { icons } from "@/lib/ui/icons"

interface QueueHeaderActionsProps {
  paused: boolean
  /** Redis is not answering: nothing can be paused or queued. */
  disabled: boolean
}

const PAUSE_CONSEQUENCE = "Waiting jobs don't run until you resume the queue. This includes Stripe access changes and Rewind runs."

/**
 * The page's actions: a watchlist sync, and Pause or Resume behind a confirm
 * that names the consequence. The actions revalidate the page, so it shows
 * the new state without a reload (BP-31).
 */
export function QueueHeaderActions({ paused, disabled }: QueueHeaderActionsProps) {
  const [confirming, setConfirming] = useState(false)
  const [syncing, startSync] = useTransition()
  const { showSuccess, showError } = useToast()
  useHoldLiveRefresh(confirming)

  const toggle = async () => {
    const result = paused ? await resumeJobQueue() : await pauseJobQueue()
    if (!result.success) return { error: result.error }
    showSuccess(paused ? "Queue resumed" : "Queue paused")
    return {}
  }

  const sync = () =>
    startSync(async () => {
      const result = await triggerWatchlistSyncJob({})
      if (result.success) showSuccess("Watchlist sync queued")
      else showError(result.error)
    })

  return (
    <>
      <Button
        variant="secondary"
        icon={<Icon icon={RefreshCw} />}
        loading={syncing}
        loadingLabel="Queueing"
        disabled={disabled || paused}
        onClick={sync}
        data-testid="queue-trigger-sync-btn"
      >
        Sync watchlists
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        trigger={
          <Button
            variant="secondary"
            icon={<Icon icon={paused ? Play : icons.paused} />}
            disabled={disabled}
            data-testid="queue-pause-resume-btn"
          >
            {paused ? "Resume queue" : "Pause queue"}
          </Button>
        }
        title={paused ? "Resume the job queue?" : "Pause the job queue?"}
        description={paused ? "Waiting jobs start again." : PAUSE_CONSEQUENCE}
        confirmLabel={paused ? "Resume queue" : "Pause queue"}
        pendingLabel={paused ? "Resuming" : "Pausing"}
        action={toggle}
        data-testid="queue-pause-dialog"
        confirmTestId="queue-pause-confirm"
      />
    </>
  )
}
