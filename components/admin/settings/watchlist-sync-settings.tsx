"use client"

import {
  getGlobalWatchlistSyncSettings,
  getWatchlistSyncStats,
  updateGlobalWatchlistSyncSettings,
} from "@/actions/admin/watchlist"
import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { StatGrid, StatTile } from "@/components/ui/stat-tile"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

/** The badge tone for each sync history status; anything else is neutral. */
const SYNC_STATUS_VARIANT: Record<string, "success" | "info" | "warning" | "destructive"> = {
  REQUESTED: "success",
  ALREADY_AVAILABLE: "info",
  ALREADY_REQUESTED: "warning",
  FAILED: "destructive",
}

interface GlobalSettings {
  watchlistSyncEnabled: boolean
  watchlistSyncIntervalMinutes: number
}

interface SyncStats {
  usersWithSyncEnabled: number
  totalItemsSynced: number
  totalItemsRequested: number
  recentHistory: Array<{
    id: string
    title: string
    mediaType: string
    status: string
    syncedAt: Date
    user: { name: string | null; email: string | null }
  }>
}

/**
 * The Watchlist sync controls, inside the settings section of that name:
 * the global switch and the interval save on their own.
 */
export function WatchlistSyncSettings() {
  const toast = useToast()
  const router = useRouter()
  const [settings, setSettings] = useState<GlobalSettings | null>(null)
  const [stats, setStats] = useState<SyncStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [intervalInput, setIntervalInput] = useState("")

  useEffect(() => {
    Promise.all([
      getGlobalWatchlistSyncSettings(),
      getWatchlistSyncStats(),
    ]).then(([settingsResult, statsResult]) => {
      if (settingsResult.success && settingsResult.data) {
        setSettings(settingsResult.data)
        setIntervalInput(settingsResult.data.watchlistSyncIntervalMinutes.toString())
      }

      if (statsResult.success && statsResult.data) {
        setStats(statsResult.data)
      }

      setIsLoading(false)
    })
  }, [])

  const handleToggleEnabled = async () => {
    if (!settings) return

    setIsSaving(true)
    try {
      const result = await updateGlobalWatchlistSyncSettings({
        watchlistSyncEnabled: !settings.watchlistSyncEnabled,
        watchlistSyncIntervalMinutes: settings.watchlistSyncIntervalMinutes,
      })

      if (result.success) {
        setSettings({
          ...settings,
          watchlistSyncEnabled: !settings.watchlistSyncEnabled,
        })
        toast.showSuccess(
          settings.watchlistSyncEnabled
            ? "Watchlist sync disabled"
            : "Watchlist sync enabled"
        )
        // The section's status follows the switch
        router.refresh()
      } else {
        toast.showError(result.error || "Failed to update settings")
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleIntervalChange = async () => {
    if (!settings) return

    const interval = parseInt(intervalInput, 10)
    if (isNaN(interval) || interval < 15 || interval > 1440) {
      toast.showError("Interval must be between 15 and 1440 minutes")
      return
    }

    setIsSaving(true)
    try {
      const result = await updateGlobalWatchlistSyncSettings({
        watchlistSyncEnabled: settings.watchlistSyncEnabled,
        watchlistSyncIntervalMinutes: interval,
      })

      if (result.success) {
        setSettings({
          ...settings,
          watchlistSyncIntervalMinutes: interval,
        })
        toast.showSuccess("Sync interval updated")
      } else {
        toast.showError(result.error || "Failed to update settings")
      }
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div data-testid="watchlist-sync-settings-loading">
        <Skeleton className="h-4 w-2/3 mb-6" />
        <Skeleton className="h-10 w-24" />
      </div>
    )
  }

  if (!settings) {
    return null
  }

  return (
    <div className="space-y-6" data-testid="watchlist-sync-settings">
        <div className="flex items-center gap-4">
          <Switch
            checked={settings.watchlistSyncEnabled}
            onCheckedChange={() => void handleToggleEnabled()}
            loading={isSaving}
            label="Watchlist sync"
            data-testid="watchlist-sync-global-toggle"
          />
          <span className="text-sm font-medium text-foreground">
            {settings.watchlistSyncEnabled ? "Enabled" : "Disabled"}
          </span>
        </div>

        {/* Interval Setting */}
        {settings.watchlistSyncEnabled && (
          <div className="space-y-2">
            <label htmlFor="watchlist-sync-interval" className="block text-sm font-medium text-foreground">
              Sync Interval (minutes)
            </label>
            <div className="flex items-center gap-3">
              <Input
                id="watchlist-sync-interval"
                type="number"
                min="15"
                max="1440"
                value={intervalInput}
                onChange={(e) => setIntervalInput(e.target.value)}
                className="w-24"
                data-testid="watchlist-sync-interval-input"
              />
              <Button
                variant="primary"
                onClick={handleIntervalChange}
                disabled={isSaving || intervalInput === settings.watchlistSyncIntervalMinutes.toString()}
                data-testid="watchlist-sync-interval-save"
              >
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              How often to check for new items in users&apos; watchlists (15-1440 minutes)
            </p>
          </div>
        )}

        {/* Statistics */}
        {stats && settings.watchlistSyncEnabled && (
          <div className="border-t border-border pt-6 mt-6">
            <h3 className="text-sm font-medium text-foreground mb-4">Statistics</h3>
            <StatGrid className="grid-cols-3 lg:grid-cols-3">
              <StatTile label="Users with sync enabled" value={stats.usersWithSyncEnabled} />
              <StatTile label="Total items synced" value={stats.totalItemsSynced} />
              <StatTile label="Requests created" value={stats.totalItemsRequested} />
            </StatGrid>

            {/* Recent Activity */}
            {stats.recentHistory.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-medium text-foreground mb-3">Recent Activity</h4>
                <div className="space-y-2">
                  {stats.recentHistory.slice(0, 5).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-foreground">{item.title}</span>
                        <span className="text-xs text-muted-foreground">
                          by {item.user.name || item.user.email || "Unknown"}
                        </span>
                      </div>
                      <Badge variant={SYNC_STATUS_VARIANT[item.status] ?? "neutral"}>
                        {item.status.replace(/_/g, " ").toLowerCase()}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Warning when disabled */}
        {!settings.watchlistSyncEnabled && (
          <Alert tone="warning">
            Watchlist sync is disabled. Users will not be able to enable sync in their settings.
          </Alert>
        )}
    </div>
  )
}
