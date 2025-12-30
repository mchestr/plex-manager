"use client"

import {
  getGlobalWatchlistSyncSettings,
  getWatchlistSyncStats,
  updateGlobalWatchlistSyncSettings,
} from "@/actions/admin/watchlist"
import { useToast } from "@/components/ui/toast"
import { useCallback, useEffect, useState } from "react"

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

export function WatchlistSyncSettings() {
  const toast = useToast()
  const [settings, setSettings] = useState<GlobalSettings | null>(null)
  const [stats, setStats] = useState<SyncStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [intervalInput, setIntervalInput] = useState("")

  const loadData = useCallback(async () => {
    const [settingsResult, statsResult] = await Promise.all([
      getGlobalWatchlistSyncSettings(),
      getWatchlistSyncStats(),
    ])

    if (settingsResult.success && settingsResult.data) {
      setSettings(settingsResult.data)
      setIntervalInput(settingsResult.data.watchlistSyncIntervalMinutes.toString())
    }

    if (statsResult.success && statsResult.data) {
      setStats(statsResult.data)
    }

    setIsLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

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
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6" data-testid="watchlist-sync-settings-loading">
        <div className="animate-pulse">
          <div className="h-5 bg-slate-700 rounded w-1/3 mb-4" />
          <div className="h-4 bg-slate-700/50 rounded w-2/3 mb-6" />
          <div className="h-10 bg-slate-700 rounded w-24" />
        </div>
      </div>
    )
  }

  if (!settings) {
    return null
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6" data-testid="watchlist-sync-settings">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white mb-2">Watchlist Sync</h2>
          <p className="text-sm text-slate-400">
            Automatically sync users&apos; Plex watchlists to Overseerr requests.
            Users must enable sync individually in their settings.
          </p>
        </div>
      </div>

      {/* Enable/Disable Toggle */}
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={handleToggleEnabled}
            disabled={isSaving}
            className={`
              relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200
              ${settings.watchlistSyncEnabled ? "bg-green-500" : "bg-slate-700"}
              ${isSaving ? "opacity-50 cursor-not-allowed" : "hover:opacity-90"}
            `}
            role="switch"
            aria-checked={settings.watchlistSyncEnabled}
            data-testid="watchlist-sync-global-toggle"
          >
            <span
              className={`
                inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200
                ${settings.watchlistSyncEnabled ? "translate-x-6" : "translate-x-1"}
              `}
            />
          </button>
          <span className="text-sm font-medium text-white">
            {settings.watchlistSyncEnabled ? "Enabled" : "Disabled"}
          </span>
          {isSaving && (
            <svg className="animate-spin h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
        </div>

        {/* Interval Setting */}
        {settings.watchlistSyncEnabled && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white">
              Sync Interval (minutes)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="15"
                max="1440"
                value={intervalInput}
                onChange={(e) => setIntervalInput(e.target.value)}
                className="w-24 rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                data-testid="watchlist-sync-interval-input"
              />
              <button
                onClick={handleIntervalChange}
                disabled={isSaving || intervalInput === settings.watchlistSyncIntervalMinutes.toString()}
                className={`
                  rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white transition-colors
                  ${isSaving || intervalInput === settings.watchlistSyncIntervalMinutes.toString()
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-cyan-500"}
                `}
                data-testid="watchlist-sync-interval-save"
              >
                Save
              </button>
            </div>
            <p className="text-xs text-slate-500">
              How often to check for new items in users&apos; watchlists (15-1440 minutes)
            </p>
          </div>
        )}

        {/* Statistics */}
        {stats && settings.watchlistSyncEnabled && (
          <div className="border-t border-slate-700 pt-6 mt-6">
            <h3 className="text-sm font-medium text-white mb-4">Statistics</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg bg-slate-700/50 p-4">
                <div className="text-2xl font-bold text-white">{stats.usersWithSyncEnabled}</div>
                <div className="text-xs text-slate-400">Users with sync enabled</div>
              </div>
              <div className="rounded-lg bg-slate-700/50 p-4">
                <div className="text-2xl font-bold text-white">{stats.totalItemsSynced}</div>
                <div className="text-xs text-slate-400">Total items synced</div>
              </div>
              <div className="rounded-lg bg-slate-700/50 p-4">
                <div className="text-2xl font-bold text-green-400">{stats.totalItemsRequested}</div>
                <div className="text-xs text-slate-400">Requests created</div>
              </div>
            </div>

            {/* Recent Activity */}
            {stats.recentHistory.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-medium text-white mb-3">Recent Activity</h4>
                <div className="space-y-2">
                  {stats.recentHistory.slice(0, 5).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg bg-slate-700/30 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-white">{item.title}</span>
                        <span className="text-xs text-slate-500">
                          by {item.user.name || item.user.email || "Unknown"}
                        </span>
                      </div>
                      <span
                        className={`
                          text-xs font-medium
                          ${item.status === "REQUESTED" ? "text-green-400" : ""}
                          ${item.status === "ALREADY_AVAILABLE" ? "text-cyan-400" : ""}
                          ${item.status === "ALREADY_REQUESTED" ? "text-amber-400" : ""}
                          ${item.status === "FAILED" ? "text-red-400" : ""}
                          ${item.status === "SYNCED" ? "text-slate-400" : ""}
                        `}
                      >
                        {item.status.replace(/_/g, " ")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Warning when disabled */}
        {!settings.watchlistSyncEnabled && (
          <div className="p-3 bg-amber-900/20 border border-amber-500/30 rounded-lg">
            <p className="text-sm text-amber-300">
              Watchlist sync is disabled. Users will not be able to enable sync in their settings.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
