"use client"

import { useQuery } from "@tanstack/react-query"
import type { RequestsStatsResponse, RequestItem } from "@/app/api/observability/requests/route"
import { REFRESH_INTERVALS } from "@/lib/constants/observability"

async function fetchRequests(): Promise<RequestsStatsResponse> {
  const response = await fetch("/api/observability/requests")
  if (!response.ok) {
    throw new Error("Failed to fetch requests")
  }
  return response.json()
}

function getStatusColor(status: RequestItem["status"]): string {
  switch (status) {
    case "pending":
      return "bg-yellow-500/20 text-yellow-400"
    case "approved":
      return "bg-blue-500/20 text-blue-400"
    case "available":
      return "bg-green-500/20 text-green-400"
    case "declined":
      return "bg-red-500/20 text-red-400"
    default:
      return "bg-slate-500/20 text-slate-400"
  }
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`

  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString()
}

export function RequestsPanel() {
  const {
    data,
    isLoading,
    isError,
    error,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["observability", "requests"],
    queryFn: fetchRequests,
    refetchInterval: REFRESH_INTERVALS.REQUESTS,
    staleTime: 30_000,
  })

  if (isLoading) {
    return <RequestsSkeleton />
  }

  if (isError) {
    return (
      <div className="p-4 text-center text-red-400 text-sm">
        {error instanceof Error ? error.message : "Failed to load requests"}
      </div>
    )
  }

  if (!data?.configured) {
    return (
      <div data-testid="requests-panel" className="p-4 text-center text-slate-500 text-sm">
        {data?.error || "Overseerr not configured"}
      </div>
    )
  }

  if (!data?.available) {
    return (
      <div data-testid="requests-panel" className="p-4 text-center text-slate-500 text-sm">
        {data?.error || "Unable to fetch request data"}
      </div>
    )
  }

  return (
    <div data-testid="requests-panel" className="divide-y divide-slate-700">
      {/* Stats Summary */}
      <div className="p-4">
        <div className="grid grid-cols-4 gap-3">
          <StatBox label="Pending" value={data.stats.pending} color="text-yellow-400" />
          <StatBox label="Approved" value={data.stats.approved} color="text-blue-400" />
          <StatBox label="Available" value={data.stats.available} color="text-green-400" />
          <StatBox label="Declined" value={data.stats.declined} color="text-red-400" />
        </div>
      </div>

      {/* Recent Requests */}
      {data.recentRequests.length > 0 && (
        <div className="p-4">
          <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">
            Recent Requests
          </h4>
          <div className="space-y-2">
            {data.recentRequests.slice(0, 5).map((req) => (
              <RequestRow key={req.id} request={req} overseerrUrl={data.overseerrUrl} />
            ))}
          </div>
        </div>
      )}

      <div className="p-2 text-center text-xs text-slate-600 border-t border-slate-700">
        {data.stats.total} total requests • Updated {new Date(dataUpdatedAt).toLocaleTimeString()}
      </div>
    </div>
  )
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  )
}

function RequestRow({ request, overseerrUrl }: { request: RequestItem; overseerrUrl?: string }) {
  const href = overseerrUrl && request.tmdbId
    ? `${overseerrUrl}/${request.type}/${request.tmdbId}`
    : undefined

  const baseClassName = "flex items-center gap-3 bg-slate-800/30 rounded-lg p-2"
  const hoverClassName = href ? "hover:bg-slate-800/50 transition-colors cursor-pointer" : ""

  const content = (
    <>
      <span className="text-slate-400 shrink-0">
        {request.type === "movie" ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        )}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-white truncate">{request.title}</span>
          <span className="text-xs text-slate-500 shrink-0">
            {request.type === "movie" ? "Movie" : "TV"}
          </span>
        </div>
        <div className="text-xs text-slate-500 truncate">
          by {request.requestedBy} • {formatTimeAgo(request.requestedAt)}
        </div>
      </div>
      <span
        className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${getStatusColor(request.status)}`}
      >
        {request.status}
      </span>
    </>
  )

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        data-testid={`request-${request.id}`}
        className={`${baseClassName} ${hoverClassName}`}
      >
        {content}
      </a>
    )
  }

  return (
    <div data-testid={`request-${request.id}`} className={baseClassName}>
      {content}
    </div>
  )
}

function RequestsSkeleton() {
  return (
    <div className="divide-y divide-slate-700">
      <div className="p-4">
        <div className="grid grid-cols-4 gap-3 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="text-center">
              <div className="h-6 w-8 bg-slate-700 rounded mx-auto" />
              <div className="h-3 w-12 bg-slate-800 rounded mt-1 mx-auto" />
            </div>
          ))}
        </div>
      </div>
      <div className="p-4">
        <div className="h-4 w-28 bg-slate-700 rounded mb-3" />
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse flex items-center gap-3 bg-slate-800/30 rounded-lg p-2">
              <div className="w-5 h-5 bg-slate-700 rounded" />
              <div className="flex-1 space-y-1">
                <div className="h-4 w-40 bg-slate-700 rounded" />
                <div className="h-3 w-28 bg-slate-800 rounded" />
              </div>
              <div className="h-5 w-16 bg-slate-700 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
