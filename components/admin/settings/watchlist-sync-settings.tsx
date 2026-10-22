"use client"

import { Suspense, use, useState } from "react"

import { updateGlobalWatchlistSyncSettings } from "@/actions/admin/watchlist"
import { Badge } from "@/components/ui/badge"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { StatGrid, StatTile } from "@/components/ui/stat-tile"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"
import { useSettingsForm } from "@/hooks/admin/use-settings-form"
import type { WatchlistSyncStats as SyncStats } from "@/lib/admin/watchlist-stats"

/** The badge tone for each sync history status; anything else is neutral. */
const SYNC_STATUS_VARIANT: Record<string, "success" | "info" | "warning" | "destructive"> = {
  REQUESTED: "success",
  ALREADY_AVAILABLE: "info",
  ALREADY_REQUESTED: "warning",
  FAILED: "destructive",
}

export interface WatchlistGlobalSettings {
  enabled: boolean
  intervalMinutes: number
}

const INTERVAL_ERROR = "Enter a whole number of minutes from 15 to 1440"

function intervalError(value: string): string | undefined {
  const minutes = Number(value)
  return Number.isInteger(minutes) && minutes >= 15 && minutes <= 1440 ? undefined : INTERVAL_ERROR
}

/** The global switch and interval as one always-open form (UI-31), saved by the section footer. */
export function useWatchlistForm(saved: WatchlistGlobalSettings) {
  const toast = useToast()
  const [error, setError] = useState<string>()
  const settings = useSettingsForm({ enabled: saved.enabled, interval: String(saved.intervalMinutes) }, async (values) => {
    const invalid = intervalError(values.interval)
    if (invalid) {
      setError(invalid)
      return
    }
    const result = await updateGlobalWatchlistSyncSettings({
      watchlistSyncEnabled: values.enabled,
      watchlistSyncIntervalMinutes: Number(values.interval),
    })
    if (!result.success) {
      const field = result.fieldErrors?.watchlistSyncIntervalMinutes?.[0]
      if (field) setError(field)
      else toast.showError(result.error)
      return
    }
    setError(undefined)
    // The action revalidates the page, so the section's status follows the switch
    toast.showSuccess("Watchlist sync saved")
  })
  return { ...settings, error }
}

/** Members, items and recent requests; the page streams them in, so they never hold the settings up. */
function WatchlistSyncStats({ stats: pending }: { stats: Promise<SyncStats | null> }) {
  const stats = use(pending)
  if (!stats) return null
  return (
    <div className="flex flex-col gap-4 border-t pt-6" data-testid="watchlist-sync-stats">
      <StatGrid className="grid-cols-3 lg:grid-cols-3">
        <StatTile label="Members with sync on" value={stats.usersWithSyncEnabled} />
        <StatTile label="Items synced" value={stats.totalItemsSynced} />
        <StatTile label="Requests created" value={stats.totalItemsRequested} />
      </StatGrid>
      {stats.recentHistory.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Recent activity">
          {stats.recentHistory.slice(0, 5).map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-secondary px-3 py-2 text-ui">
              <span className="min-w-0 truncate text-foreground">
                {item.title} <span className="text-label text-muted-foreground">by {item.user.name || item.user.email || "Unknown"}</span>
              </span>
              <Badge variant={SYNC_STATUS_VARIANT[item.status] ?? "neutral"}>{item.status.replace(/_/g, " ").toLowerCase()}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The Watchlist sync controls: the global switch, the interval while it is on, and the statistics. */
export function WatchlistSyncFields({ state, stats }: { state: ReturnType<typeof useWatchlistForm>; stats: Promise<SyncStats | null> }) {
  const { values, set, form, error } = state
  return (
    <div className="flex flex-col gap-6" data-testid="watchlist-sync-settings">
      <div className="flex items-start gap-3">
        <Switch
          id="watchlist-sync-enabled"
          checked={values.enabled}
          onCheckedChange={(enabled) => set({ enabled })}
          disabled={form.isPending}
          aria-describedby="watchlist-sync-enabled-hint"
          data-testid="watchlist-sync-global-toggle"
        />
        <div className="flex flex-col">
          <Label htmlFor="watchlist-sync-enabled">Watchlist sync</Label>
          <span id="watchlist-sync-enabled-hint" className="text-label text-muted-foreground">
            While it is off, members can't turn sync on for themselves. It needs Overseerr.
          </span>
        </div>
      </div>
      {values.enabled && (
        <FormField name="watchlist-sync-interval" label="Sync interval" description="Minutes between checks, from 15 to 1440." error={error ?? intervalError(values.interval)}>
          <Input
            type="number"
            min="15"
            max="1440"
            value={values.interval}
            onValueChange={(interval) => set({ interval })}
            disabled={form.isPending}
            className="w-32"
            data-testid="watchlist-sync-interval-input"
          />
        </FormField>
      )}
      {values.enabled && (
        <Suspense fallback={null}>
          <WatchlistSyncStats stats={stats} />
        </Suspense>
      )}
    </div>
  )
}
