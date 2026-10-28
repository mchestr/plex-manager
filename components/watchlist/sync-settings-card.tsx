"use client"

import { useState, useTransition } from "react"

import { triggerWatchlistSync, updateWatchlistSyncSettings } from "@/actions/watchlist"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Time } from "@/components/ui/time"
import { useToast } from "@/components/ui/toast"
import { useWatchlistSync, type WatchlistSyncSettings } from "@/hooks/use-watchlist-sync"
import { icons } from "@/lib/ui/icons"
import { WATCHLIST_SKIP_COPY } from "@/lib/watchlist/skip"
import { WATCHLIST_COUNT_PARTS, watchlistCountsText, type WatchlistCounts } from "@/lib/watchlist/summary"
import type { AuthService } from "@/types/onboarding"

type BadgeVariant = "success" | "warning" | "destructive" | "info" | "neutral"

const LAST_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  success: { label: "Success", variant: "success" },
  partial: { label: "Some failed", variant: "warning" },
  failed: { label: "Failed", variant: "destructive" },
  skipped: { label: "Skipped", variant: "neutral" },
}

const ITEM_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  REQUESTED: { label: "Requested", variant: "info" },
  ALREADY_AVAILABLE: { label: "Available", variant: "success" },
  ALREADY_REQUESTED: { label: "Already requested", variant: "neutral" },
  FAILED: { label: "Failed", variant: "destructive" },
  SYNCED: { label: "Synced", variant: "neutral" },
  SKIPPED_NO_EXTERNAL_ID: { label: "No TMDB match", variant: "neutral" },
  NOT_PERMITTED: { label: "Not allowed", variant: "warning" },
}

const hasCounts = (counts: WatchlistCounts) => Object.values(counts).some((count) => count > 0)

/** Requested, available, already requested, skipped and refused, each with its test id. */
function SyncCounts({ counts }: { counts: WatchlistCounts }) {
  return (
    <span className="tabular-nums" data-testid="watchlist-sync-counts">
      {WATCHLIST_COUNT_PARTS.map((part, index) => (
        <span key={part.key} data-testid={part.testId}>
          {index > 0 && ", "}
          {part.text(counts[part.key])}
        </span>
      ))}
    </span>
  )
}

/**
 * Whether the card can work (UI-38): a Plex member with a stored token, the
 * admin's global switch on and Overseerr configured. Anything else hides it,
 * so home never offers a feature that cannot run.
 */
function canShowWatchlistSync(settings: WatchlistSyncSettings | null, service: AuthService): boolean {
  return Boolean(
    settings && service === "plex" && settings.hasPlexToken && settings.globalSyncEnabled && settings.hasOverseerr
  )
}

interface WatchlistSyncCardProps {
  /** Loaded by the page on the server (UI-41); null when the read failed. */
  initialSettings: WatchlistSyncSettings | null
  service: AuthService
}

export function WatchlistSyncCard({ initialSettings, service }: WatchlistSyncCardProps) {
  const { showSuccess, showError, showInfo } = useToast()
  const [isPending, startTransition] = useTransition()
  const [isSyncing, setIsSyncing] = useState(false)
  const { settings, refresh: reload } = useWatchlistSync(initialSettings)

  if (!settings || !canShowWatchlistSync(settings, service)) return null

  const handleToggle = (next: boolean) => {
    startTransition(async () => {
      const result = await updateWatchlistSyncSettings({ syncEnabled: next })
      if (result.success) {
        showSuccess(next ? "Watchlist sync is on" : "Watchlist sync is off")
        await reload()
      } else {
        showError(result.error)
      }
    })
  }

  const handleManualSync = async () => {
    setIsSyncing(true)
    try {
      const result = await triggerWatchlistSync()
      if (!result.success) {
        showError(result.error)
        return
      }
      if (result.data.queued) {
        showSuccess(result.data.message)
      } else {
        const { skipped, notModified, counts, itemsFailed } = result.data
        if (skipped) {
          showInfo(WATCHLIST_SKIP_COPY[skipped])
        } else if (notModified) {
          showInfo("Your watchlist has not changed since the last sync")
        } else if (counts) {
          showInfo(hasCounts(counts) ? watchlistCountsText(counts) : "No new titles on your watchlist")
        }
        if (itemsFailed && itemsFailed > 0) showError(`Could not sync ${itemsFailed} ${itemsFailed === 1 ? "title" : "titles"}`)
      }
      await reload()
    } finally {
      setIsSyncing(false)
    }
  }

  const sync = settings.settings
  const isEnabled = sync?.syncEnabled ?? false
  const lastStatus = sync?.lastSyncStatus ? LAST_STATUS[sync.lastSyncStatus] : undefined

  return (
    <Card aria-labelledby="watchlist-sync-title" role="region" data-testid="watchlist-sync-card">
      <CardHeader>
        <div className="flex gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-foreground">
            <Icon icon={icons.watchlist} size={20} />
          </span>
          <div className="flex flex-col gap-1">
            <CardTitle as="h2" id="watchlist-sync-title">
              Watchlist sync
            </CardTitle>
            <CardDescription>Each title you add to your Plex watchlist becomes a request.</CardDescription>
          </div>
        </div>
        <CardAction>
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggle}
            loading={isPending}
            label="Watchlist sync"
            data-testid="watchlist-sync-toggle"
          />
        </CardAction>
      </CardHeader>

      {isEnabled && (
        <CardContent className="flex flex-col gap-3 pt-4 pb-5">
          <div className="flex flex-col gap-3 rounded-md border bg-secondary/40 p-3 sm:flex-row sm:items-center">
            <div className="flex flex-1 flex-col gap-1 text-ui text-muted-foreground">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-foreground">
                  {sync?.lastSyncAt ? (
                    <>
                      Synced <Time value={sync.lastSyncAt} />
                    </>
                  ) : (
                    "Not synced yet"
                  )}
                </span>
                {lastStatus && <Badge variant={lastStatus.variant}>{lastStatus.label}</Badge>}
              </span>
              {settings.counts && hasCounts(settings.counts) && (
                <SyncCounts counts={settings.counts} />
              )}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleManualSync}
              disabled={isSyncing}
              data-testid="watchlist-sync-now-button"
            >
              {isSyncing ? <Spinner size={14} /> : <Icon icon={icons.sync} size={14} />}
              {isSyncing ? "Syncing" : "Sync now"}
            </Button>
          </div>

          {sync?.lastSyncStatus === "skipped" && sync.lastSyncError ? (
            <p className="text-caption text-muted-foreground" data-testid="watchlist-sync-skip-reason">
              {sync.lastSyncError}
            </p>
          ) : (
            sync?.lastSyncError && <p className="line-clamp-2 text-caption text-destructive wrap-anywhere">{sync.lastSyncError}</p>
          )}

          {settings.recentHistory.length > 0 && (
            <ul className="flex flex-col" aria-label="Recent titles">
              {settings.recentHistory.map((item) => {
                const status = ITEM_STATUS[item.status]
                return (
                  <li key={item.id} className="flex items-center gap-3 border-b py-2.5 last:border-b-0 last:pb-0">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-ui font-medium text-foreground">{item.title}</span>
                      <span className="text-caption text-muted-foreground">
                        {item.mediaType === "MOVIE" ? "Movie" : "Show"}
                        {item.year ? `, ${item.year}` : ""}
                      </span>
                    </span>
                    {status && (
                      <Badge variant={status.variant} className="ml-auto">
                        {status.label}
                      </Badge>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      )}
    </Card>
  )
}
