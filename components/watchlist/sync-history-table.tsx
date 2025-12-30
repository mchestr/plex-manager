"use client"

import { getWatchlistSyncHistory } from "@/actions/watchlist"
import { Button } from "@/components/ui/button"
import { WatchlistSyncStatus } from "@/lib/generated/prisma/client"
import { useCallback, useEffect, useState } from "react"

interface SyncHistoryItem {
  id: string
  title: string
  year: number | null
  mediaType: string
  status: WatchlistSyncStatus
  syncedAt: Date
  requestedAt: Date | null
  overseerrRequestId: number | null
}

interface SyncHistoryData {
  items: SyncHistoryItem[]
  total: number
  hasMore: boolean
}

interface SyncHistoryTableProps {
  limit?: number
}

export function SyncHistoryTable({ limit = 10 }: SyncHistoryTableProps) {
  const [data, setData] = useState<SyncHistoryData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [offset, setOffset] = useState(0)

  const loadHistory = useCallback(async () => {
    setIsLoading(true)
    const result = await getWatchlistSyncHistory({ limit, offset })
    if (result.success && result.data) {
      setData(result.data)
    }
    setIsLoading(false)
  }, [limit, offset])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const getStatusBadge = (status: WatchlistSyncStatus) => {
    const styles: Record<WatchlistSyncStatus, { bg: string; text: string; label: string }> = {
      SYNCED: { bg: "bg-slate-700/50", text: "text-slate-300", label: "Synced" },
      REQUESTED: { bg: "bg-green-900/50", text: "text-green-300", label: "Requested" },
      ALREADY_AVAILABLE: { bg: "bg-cyan-900/50", text: "text-cyan-300", label: "Available" },
      ALREADY_REQUESTED: { bg: "bg-amber-900/50", text: "text-amber-300", label: "Pending" },
      FAILED: { bg: "bg-red-900/50", text: "text-red-300", label: "Failed" },
      REMOVED_FROM_WATCHLIST: { bg: "bg-slate-800/50", text: "text-slate-500", label: "Removed" },
    }
    const style = styles[status]
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
        {style.label}
      </span>
    )
  }

  const getMediaTypeIcon = (mediaType: string) => {
    if (mediaType === "MOVIE") {
      return (
        <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
        </svg>
      )
    }
    return (
      <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    )
  }

  const formatDate = (date: Date) => {
    const d = new Date(date)
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-6" data-testid="sync-history-loading">
        <div className="animate-pulse space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="h-4 w-4 rounded bg-slate-700/50" />
              <div className="h-4 w-32 rounded bg-slate-700/50" />
              <div className="h-4 w-16 rounded bg-slate-700/50" />
              <div className="ml-auto h-4 w-20 rounded bg-slate-700/50" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-6 text-center" data-testid="sync-history-empty">
        <p className="text-sm text-slate-400">No sync history yet</p>
        <p className="mt-1 text-xs text-slate-500">
          Items from your Plex watchlist will appear here once synced
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4" data-testid="sync-history-table">
      <div className="overflow-hidden rounded-lg border border-slate-700/50 bg-slate-800/30">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700/50 bg-slate-800/50">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                Title
              </th>
              <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400 sm:table-cell">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                Status
              </th>
              <th className="hidden px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400 sm:table-cell">
                Synced
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {data.items.map((item) => (
              <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{item.title}</span>
                    {item.year && <span className="text-xs text-slate-500">({item.year})</span>}
                  </div>
                </td>
                <td className="hidden px-4 py-3 sm:table-cell">
                  <div className="flex items-center gap-2">
                    {getMediaTypeIcon(item.mediaType)}
                    <span className="text-xs text-slate-400">
                      {item.mediaType === "MOVIE" ? "Movie" : "TV Show"}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {getStatusBadge(item.status)}
                </td>
                <td className="hidden px-4 py-3 text-right text-xs text-slate-400 sm:table-cell">
                  {formatDate(item.syncedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {(data.hasMore || offset > 0) && (
        <div className="flex items-center justify-between">
          <Button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            variant="secondary"
            size="sm"
          >
            Previous
          </Button>
          <span className="text-xs text-slate-500">
            Showing {offset + 1}-{Math.min(offset + data.items.length, data.total)} of {data.total}
          </span>
          <Button
            onClick={() => setOffset(offset + limit)}
            disabled={!data.hasMore}
            variant="secondary"
            size="sm"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
