"use client"

import { useId, useTransition } from "react"

import { triggerWatchlistSyncJob } from "@/actions/admin/queue"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { useToast } from "@/components/ui/toast"
import { icons } from "@/lib/ui/icons"

interface SyncNowProps {
  /** The saved global flag; while it is off the job skips every member. */
  enabled: boolean
  /** `REDIS_URL` is set: the action queues the job only then. */
  redisConfigured: boolean
}

const OFF = "Sync now runs once watchlist sync is on."
const NO_REDIS = "Sync now needs Redis. Without it, the sync still runs on its interval."

/**
 * Sync now: queues the sync of every member who turned sync on, through the
 * action behind the Queues page's "Sync watchlists", with no confirm, as
 * there. While sync is off (the job would skip everyone), or without Redis
 * (the action refuses), it is disabled and the line beside it says why: a
 * disabled button takes no hover or focus, so a tooltip could not. A Redis
 * that does not answer shows in the action's error toast; on a paused queue
 * the job waits until the queue resumes.
 */
export function SyncNow({ enabled, redisConfigured }: SyncNowProps) {
  const [syncing, startSync] = useTransition()
  const { showSuccess, showError } = useToast()
  const reasonId = useId()
  const reason = !enabled ? OFF : !redisConfigured ? NO_REDIS : null

  const sync = () =>
    startSync(async () => {
      const result = await triggerWatchlistSyncJob({})
      if (result.success) showSuccess("Watchlist sync queued")
      else showError(result.error)
    })

  return (
    <div className="flex flex-wrap items-center gap-3 border-t pt-6">
      <Button
        type="button"
        variant="outline"
        size="sm"
        icon={<Icon icon={icons.sync} />}
        loading={syncing}
        loadingLabel="Queueing"
        disabled={reason !== null}
        aria-describedby={reason ? reasonId : undefined}
        onClick={sync}
        data-testid="admin-watchlist-sync-now"
      >
        Sync now
      </Button>
      {reason && (
        <p id={reasonId} className="text-label text-muted-foreground" data-testid="admin-watchlist-sync-now-reason">
          {reason}
        </p>
      )}
    </div>
  )
}
