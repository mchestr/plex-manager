"use client"

import { useQuery } from "@tanstack/react-query"
import type { QueuesResponse, QueueItem } from "@/app/api/observability/queues/route"
import { SonarrIcon, RadarrIcon } from "@/components/ui/service-icons"
import { REFRESH_INTERVALS } from "@/lib/constants/observability"

async function fetchQueues(): Promise<QueuesResponse> {
  const response = await fetch("/api/observability/queues")
  if (!response.ok) {
    throw new Error("Failed to fetch queues")
  }
  return response.json()
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatETA(isoString: string | null): string {
  if (!isoString) return "--"
  const eta = new Date(isoString)
  const now = new Date()
  const diffMs = eta.getTime() - now.getTime()
  if (diffMs < 0) return "Soon"
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 60) return `${diffMins}m`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ${diffMins % 60}m`
  return `${Math.floor(diffHours / 24)}d ${diffHours % 24}h`
}

function getStatusColor(status: QueueItem["status"]): string {
  switch (status) {
    case "downloading":
      return "text-green-400"
    case "queued":
      return "text-cyan-400"
    case "paused":
      return "text-yellow-400"
    case "failed":
      return "text-red-400"
    case "completed":
      return "text-green-400"
    default:
      return "text-slate-400"
  }
}

function getProgressBarColor(status: QueueItem["status"]): string {
  switch (status) {
    case "downloading":
      return "bg-green-500"
    case "queued":
      return "bg-cyan-500"
    case "paused":
      return "bg-yellow-500"
    case "failed":
      return "bg-red-500"
    case "completed":
      return "bg-green-500"
    default:
      return "bg-slate-500"
  }
}

export function DownloadQueuesPanel() {
  const {
    data,
    isLoading,
    isError,
    error,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["observability", "queues"],
    queryFn: fetchQueues,
    refetchInterval: REFRESH_INTERVALS.DOWNLOAD_QUEUES,
    staleTime: 10_000,
  })

  if (isLoading) {
    return <QueuesSkeleton />
  }

  if (isError) {
    return (
      <div data-testid="download-queues-panel" className="p-4 text-center text-red-400 text-sm">
        {error instanceof Error ? error.message : "Failed to load queues"}
      </div>
    )
  }

  if (!data?.available) {
    return (
      <div data-testid="download-queues-panel" className="p-4 text-center text-slate-500 text-sm">
        {data?.error || "Neither Sonarr nor Radarr configured"}
      </div>
    )
  }

  if (data.items.length === 0) {
    return (
      <div data-testid="download-queues-panel" className="p-8 text-center">
        <div className="text-slate-500 text-sm">No items in queue</div>
        <div className="text-xs text-slate-600 mt-1">
          Last updated: {new Date(dataUpdatedAt).toLocaleTimeString()}
        </div>
      </div>
    )
  }

  const getQueueUrl = (source: "sonarr" | "radarr") => {
    const baseUrl = source === "sonarr" ? data.sonarrUrl : data.radarrUrl
    return baseUrl ? `${baseUrl}/activity/queue` : undefined
  }

  return (
    <div data-testid="download-queues-panel">
      <div className="divide-y divide-slate-700">
        {data.items.slice(0, 5).map((item) => {
          const queueUrl = getQueueUrl(item.source)
          const Wrapper = queueUrl ? 'a' : 'div'
          const wrapperProps = queueUrl ? {
            href: queueUrl,
            target: "_blank",
            rel: "noopener noreferrer",
          } : {}

          return (
          <Wrapper
            key={`${item.source}-${item.id}`}
            className={`p-4 flex items-center gap-4 ${queueUrl ? 'hover:bg-slate-800/50 transition-colors cursor-pointer' : ''}`}
            data-testid={`queue-item-${item.source}-${item.id}`}
            {...wrapperProps}
          >
            {/* Source icon */}
            <div className="shrink-0 text-slate-400">
              {item.source === "sonarr" ? (
                <SonarrIcon className="w-6 h-6" />
              ) : (
                <RadarrIcon className="w-6 h-6" />
              )}
            </div>

            {/* Content info */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">
                {item.title}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                <span className={getStatusColor(item.status)}>
                  {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                </span>
                <span>•</span>
                <span>{item.quality}</span>
                <span>•</span>
                <span>{formatBytes(item.size)}</span>
              </div>
              {/* Progress bar */}
              <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${getProgressBarColor(item.status)}`}
                  style={{ width: `${item.progress}%` }}
                />
              </div>
            </div>

            {/* Progress and ETA */}
            <div className="shrink-0 text-right">
              <div className="text-lg font-bold text-cyan-400">
                {item.progress}%
              </div>
              {item.status === "downloading" && (
                <div className="text-xs text-slate-500">
                  ETA: {formatETA(item.estimatedCompletionTime)}
                </div>
              )}
            </div>
          </Wrapper>
          )
        })}
      </div>
      <div className="p-2 text-center text-xs text-slate-600 border-t border-slate-700">
        {data.items.length} item{data.items.length !== 1 ? "s" : ""} in queue
        {data.items.length > 5 && ` (showing 5)`} • Updated{" "}
        {new Date(dataUpdatedAt).toLocaleTimeString()}
      </div>
    </div>
  )
}

function QueuesSkeleton() {
  return (
    <div data-testid="download-queues-panel" className="divide-y divide-slate-700">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="p-4 flex items-center gap-4 animate-pulse">
          <div className="w-6 h-6 bg-slate-700 rounded" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-56 bg-slate-700 rounded" />
            <div className="h-3 w-40 bg-slate-800 rounded" />
            <div className="h-1.5 w-full bg-slate-700 rounded" />
          </div>
          <div className="w-12 text-right space-y-1">
            <div className="h-5 w-10 bg-slate-700 rounded ml-auto" />
            <div className="h-3 w-12 bg-slate-800 rounded ml-auto" />
          </div>
        </div>
      ))}
    </div>
  )
}
