"use client"

import { getWatchlistSyncSettings, triggerWatchlistSync, updateWatchlistSyncSettings } from "@/actions/watchlist"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { WATCHLIST_SKIP_COPY } from "@/lib/watchlist/skip"
import { motion } from "motion/react"
import { useCallback, useEffect, useState, useTransition } from "react"

interface RecentHistoryItem {
  id: string
  title: string
  year: number | null
  mediaType: string
  status: string
  syncedAt: Date
}

interface SyncSettings {
  hasPlexToken: boolean
  hasOverseerr: boolean
  globalSyncEnabled: boolean
  settings: {
    syncEnabled: boolean
    lastSyncAt: Date | null
    lastSyncStatus: string | null
    lastSyncError: string | null
    itemsSynced: number
    itemsRequested: number
    totalItemsSynced: number
    totalItemsRequested: number
  } | null
  recentHistory: RecentHistoryItem[]
}

export function WatchlistSyncCard() {
  const { showSuccess, showError, showInfo } = useToast()
  const [isPending, startTransition] = useTransition()
  const [isSyncing, setIsSyncing] = useState(false)
  const [settings, setSettings] = useState<SyncSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const applySettings = useCallback((result: Awaited<ReturnType<typeof getWatchlistSyncSettings>>) => {
    if (result.success) {
      setSettings(result.data)
    }
    setIsLoading(false)
  }, [])

  const loadSettings = useCallback(async () => {
    applySettings(await getWatchlistSyncSettings())
  }, [applySettings])

  useEffect(() => {
    getWatchlistSyncSettings().then(applySettings)
  }, [applySettings])

  const handleToggleSync = () => {
    if (!settings) return

    const newEnabled = !settings.settings?.syncEnabled

    startTransition(async () => {
      const result = await updateWatchlistSyncSettings({ syncEnabled: newEnabled })
      if (result.success) {
        showSuccess(newEnabled ? "Watchlist sync enabled" : "Watchlist sync disabled")
        await loadSettings()
      } else {
        showError(result.error)
      }
    })
  }

  const handleManualSync = async () => {
    setIsSyncing(true)
    try {
      const result = await triggerWatchlistSync()
      if (result.success) {
        // Handle queued response (when Redis is configured)
        if (result.data.queued) {
          showSuccess(result.data.message)
          await loadSettings()
          return
        }

        // Handle direct sync response (when Redis is not configured)
        const { skipped, itemsSynced, itemsRequested, itemsFailed } = result.data
        if (skipped) {
          showInfo(WATCHLIST_SKIP_COPY[skipped])
          await loadSettings()
          return
        }
        if (itemsRequested && itemsRequested > 0) {
          showSuccess(`Synced ${itemsSynced} items, requested ${itemsRequested} new items`)
        } else if (itemsSynced && itemsSynced > 0) {
          showInfo(`Synced ${itemsSynced} items (all already available or requested)`)
        } else {
          showInfo("Watchlist is up to date")
        }
        if (itemsFailed && itemsFailed > 0) {
          showError(`${itemsFailed} items failed to sync`)
        }
        await loadSettings()
      } else {
        showError(result.error)
      }
    } finally {
      setIsSyncing(false)
    }
  }

  // Not configured - don't show card
  if (!isLoading && settings && !settings.hasOverseerr) {
    return null
  }

  // Loading state
  if (isLoading) {
    return (
      <motion.div
        className="relative overflow-hidden rounded-xl border border-border bg-card p-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.15 }}
        data-testid="watchlist-sync-card-loading"
      >
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-32 rounded bg-secondary" />
          <div className="h-4 w-48 rounded bg-secondary" />
        </div>
      </motion.div>
    )
  }

  if (!settings) {
    return null
  }

  const canEnable = settings.hasPlexToken && settings.hasOverseerr && settings.globalSyncEnabled
  const isEnabled = settings.settings?.syncEnabled ?? false
  const lastSync = settings.settings?.lastSyncAt
  const lastStatus = settings.settings?.lastSyncStatus

  // Format last sync time
  const formatLastSync = (date: Date | null | undefined) => {
    if (!date) return "Never"
    const d = new Date(date)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case "success":
        return "text-green-400"
      case "partial":
        return "text-amber-400"
      case "failed":
        return "text-red-400"
      default:
        return "text-slate-400"
    }
  }

  return (
    <motion.div
      className="relative overflow-hidden rounded-xl border border-border bg-card p-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut", delay: 0.15 }}
      data-testid="watchlist-sync-card"
    >
      <div className="relative space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Watchlist Icon */}
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
              <svg
                className="h-5 w-5 text-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Watchlist Sync</h3>
              <p className="text-xs text-muted-foreground">
                Auto-request items from your Plex watchlist
              </p>
            </div>
          </div>

          {/* Toggle */}
          <button
            onClick={handleToggleSync}
            disabled={!canEnable || isPending}
            className={`
              relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200
              ${isEnabled ? "bg-primary" : "bg-secondary"}
              ${(!canEnable || isPending) ? "opacity-50 cursor-not-allowed" : "hover:opacity-90"}
            `}
            role="switch"
            aria-checked={isEnabled}
            aria-label={isEnabled ? "Disable watchlist sync" : "Enable watchlist sync"}
            data-testid="watchlist-sync-toggle"
          >
            <span
              className={`
                inline-block h-4 w-4 transform rounded-full bg-foreground shadow-sm transition-transform duration-200
                ${isEnabled ? "translate-x-6" : "translate-x-1"}
              `}
            />
          </button>
        </div>

        {/* Prerequisites warning */}
        {!canEnable && (
          <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            {!settings.hasPlexToken && (
              <p>Log in with Plex to enable watchlist sync</p>
            )}
            {settings.hasPlexToken && !settings.globalSyncEnabled && (
              <p>Watchlist sync is disabled by your administrator</p>
            )}
            {settings.hasPlexToken && settings.globalSyncEnabled && !settings.hasOverseerr && (
              <p>Overseerr is not configured</p>
            )}
          </div>
        )}

        {/* Status when enabled */}
        {isEnabled && (
          <div className="space-y-3">
            {/* Stats row */}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4 text-muted-foreground">
                <span>
                  Last sync: <span className="text-foreground">{formatLastSync(lastSync)}</span>
                </span>
                {lastStatus && (
                  <span className={getStatusColor(lastStatus)}>
                    {lastStatus === "success" && "Success"}
                    {lastStatus === "partial" && "Partial"}
                    {lastStatus === "failed" && "Failed"}
                    {lastStatus === "skipped" && "Skipped"}
                  </span>
                )}
              </div>
            </div>

            {/* Cumulative stats */}
            {settings.settings && (settings.settings.totalItemsSynced > 0 || settings.settings.totalItemsRequested > 0) && (
              <div className="flex items-center gap-4 text-xs">
                <span className="text-muted-foreground">
                  <span className="text-foreground font-medium">{settings.settings.totalItemsSynced}</span> items synced
                </span>
                <span className="text-muted-foreground">
                  <span className="text-success font-medium">{settings.settings.totalItemsRequested}</span> requested
                </span>
              </div>
            )}

            {/* Why the last sync was skipped, or its error */}
            {lastStatus === "skipped" && settings.settings?.lastSyncError ? (
              <p className="text-xs text-muted-foreground" data-testid="watchlist-sync-skip-reason">
                {settings.settings.lastSyncError}
              </p>
            ) : settings.settings?.lastSyncError && (
              <p className="text-xs text-destructive line-clamp-2">
                {settings.settings.lastSyncError}
              </p>
            )}

            {/* Recent sync history */}
            {settings.recentHistory && settings.recentHistory.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border/50">
                <p className="text-xs text-muted-foreground font-medium">Recent items</p>
                <div className="space-y-1">
                  {settings.recentHistory.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className={item.mediaType === "MOVIE" ? "text-info" : "text-foreground"}>
                          {item.mediaType === "MOVIE" ? "🎬" : "📺"}
                        </span>
                        <span className="text-foreground truncate">
                          {item.title}
                          {item.year && <span className="text-muted-foreground ml-1">({item.year})</span>}
                        </span>
                      </div>
                      <span
                        className={`shrink-0 ml-2 ${
                          item.status === "REQUESTED"
                            ? "text-success"
                            : item.status === "ALREADY_AVAILABLE"
                            ? "text-info"
                            : item.status === "ALREADY_REQUESTED"
                            ? "text-warning"
                            : item.status === "FAILED"
                            ? "text-destructive"
                            : "text-muted-foreground"
                        }`}
                      >
                        {item.status === "REQUESTED" && "Requested"}
                        {item.status === "ALREADY_AVAILABLE" && "Available"}
                        {item.status === "ALREADY_REQUESTED" && "Pending"}
                        {item.status === "FAILED" && "Failed"}
                        {item.status === "SYNCED" && "Synced"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Manual sync button */}
            <Button
              variant="secondary"
              onClick={handleManualSync}
              disabled={isSyncing}
              className="px-3"
              data-testid="watchlist-sync-now-button"
            >
              {isSyncing ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>Syncing...</span>
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  <span>Sync Now</span>
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  )
}
