"use client"

import { useState, useTransition } from "react"

import { getWatchlistSyncSettings, triggerWatchlistSync, updateWatchlistSyncSettings } from "@/actions/watchlist"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Time } from "@/components/ui/time"
import { useToast } from "@/components/ui/toast"
import { icons } from "@/lib/ui/icons"
import { WATCHLIST_SKIP_COPY } from "@/lib/watchlist/skip"
import type { AuthService } from "@/types/onboarding"

type SettingsResult = Awaited<ReturnType<typeof getWatchlistSyncSettings>>
export type WatchlistSyncSettings = Extract<SettingsResult, { success: true }>["data"]

type BadgeVariant = "success" | "warning" | "destructive" | "info" | "neutral"

const LAST_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  success: { label: "Success", variant: "success" },
  partial: { label: "Partial", variant: "warning" },
  failed: { label: "Failed", variant: "destructive" },
  skipped: { label: "Skipped", variant: "neutral" },
}

const ITEM_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  REQUESTED: { label: "Requested", variant: "info" },
  ALREADY_AVAILABLE: { label: "Available", variant: "success" },
  ALREADY_REQUESTED: { label: "Pending", variant: "neutral" },
  FAILED: { label: "Failed", variant: "destructive" },
  SYNCED: { label: "Synced", variant: "neutral" },
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
  const [settings, setSettings] = useState(initialSettings)

  if (!settings || !canShowWatchlistSync(settings, service)) return null

  const reload = async () => {
    const result = await getWatchlistSyncSettings()
    if (result.success) setSettings(result.data)
  }

  const handleToggle = (next: boolean) => {
    startTransition(async () => {
      const result = await updateWatchlistSyncSettings({ syncEnabled: next })
      if (result.success) {
        showSuccess(next ? "Watchlist sync enabled" : "Watchlist sync disabled")
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
        const { skipped, itemsSynced, itemsRequested, itemsFailed } = result.data
        if (skipped) {
          showInfo(WATCHLIST_SKIP_COPY[skipped])
        } else if (itemsRequested && itemsRequested > 0) {
          showSuccess(`Synced ${itemsSynced} items, requested ${itemsRequested} new items`)
        } else if (itemsSynced && itemsSynced > 0) {
          showInfo(`Synced ${itemsSynced} items (all already available or requested)`)
        } else {
          showInfo("Watchlist is up to date")
        }
        if (itemsFailed && itemsFailed > 0) showError(`${itemsFailed} items failed to sync`)
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
              Watchlist Sync
            </CardTitle>
            <CardDescription>Anything you add to your Plex watchlist is requested for you.</CardDescription>
          </div>
        </div>
        <CardAction>
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggle}
            loading={isPending}
            label="Watchlist Sync"
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
              {sync && (sync.totalItemsSynced > 0 || sync.totalItemsRequested > 0) && (
                <span className="tabular-nums">
                  {sync.totalItemsSynced} items synced, {sync.totalItemsRequested} requested
                </span>
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
            sync?.lastSyncError && <p className="line-clamp-2 text-caption text-destructive">{sync.lastSyncError}</p>
          )}

          {settings.recentHistory.length > 0 && (
            <ul className="flex flex-col" aria-label="Recent items">
              {settings.recentHistory.map((item) => {
                const status = ITEM_STATUS[item.status]
                return (
                  <li key={item.id} className="flex items-center gap-3 border-b py-2.5 last:border-b-0 last:pb-0">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-ui font-medium text-foreground">{item.title}</span>
                      <span className="text-caption text-muted-foreground">
                        {item.mediaType === "MOVIE" ? "Film" : "Series"}
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
