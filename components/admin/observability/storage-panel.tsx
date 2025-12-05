"use client"

import { useQuery } from "@tanstack/react-query"
import type { StorageResponse, DiskSpaceItem, LibraryInfo } from "@/app/api/observability/storage/route"
import { SonarrIcon, RadarrIcon } from "@/components/ui/service-icons"
import { REFRESH_INTERVALS } from "@/lib/constants/observability"

async function fetchStorage(): Promise<StorageResponse> {
  const response = await fetch("/api/observability/storage")
  if (!response.ok) {
    throw new Error("Failed to fetch storage")
  }
  return response.json()
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function getUsageColor(percent: number): string {
  if (percent >= 90) return "bg-red-500"
  if (percent >= 75) return "bg-yellow-500"
  return "bg-green-500"
}

function getUsageTextColor(percent: number): string {
  if (percent >= 90) return "text-red-400"
  if (percent >= 75) return "text-yellow-400"
  return "text-green-400"
}

function getLibraryIcon(type: string): string {
  switch (type.toLowerCase()) {
    case "movie":
      return "🎬"
    case "show":
      return "📺"
    case "artist":
    case "music":
      return "🎵"
    case "photo":
      return "📷"
    default:
      return "📁"
  }
}

export function StoragePanel() {
  const {
    data,
    isLoading,
    isError,
    error,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["observability", "storage"],
    queryFn: fetchStorage,
    refetchInterval: REFRESH_INTERVALS.STORAGE,
    staleTime: 30_000,
  })

  if (isLoading) {
    return <StorageSkeleton />
  }

  if (isError) {
    return (
      <div className="p-4 text-center text-red-400 text-sm">
        {error instanceof Error ? error.message : "Failed to load storage"}
      </div>
    )
  }

  if (!data?.available) {
    return (
      <div data-testid="storage-panel" className="p-4 text-center text-slate-500 text-sm">
        {data?.error || "No services configured for storage metrics"}
      </div>
    )
  }

  return (
    <div data-testid="storage-panel" className="divide-y divide-slate-700">
      {/* Disk Space Section */}
      {data.diskSpace.length > 0 && (
        <div className="p-4">
          <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">
            Disk Usage
          </h4>
          <div className="space-y-3">
            {data.diskSpace.map((disk, idx) => (
              <DiskSpaceRow key={`${disk.path}-${idx}`} disk={disk} />
            ))}
          </div>
        </div>
      )}

      {/* Libraries Section */}
      {data.libraries.length > 0 && (
        <div className="p-4">
          <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">
            Libraries
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {data.libraries.map((lib) => (
              <LibraryCard key={lib.sectionId} library={lib} />
            ))}
          </div>
        </div>
      )}

      <div className="p-2 text-center text-xs text-slate-600 border-t border-slate-700">
        Updated {new Date(dataUpdatedAt).toLocaleTimeString()}
      </div>
    </div>
  )
}

function DiskSpaceRow({ disk }: { disk: DiskSpaceItem }) {
  return (
    <div data-testid={`disk-${disk.source}`} className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {disk.source === "sonarr" ? (
            <SonarrIcon className="w-4 h-4 text-slate-400" />
          ) : (
            <RadarrIcon className="w-4 h-4 text-slate-400" />
          )}
          <span className="text-white truncate max-w-[200px]" title={disk.path}>
            {disk.label}
          </span>
        </div>
        <span className={getUsageTextColor(disk.usedPercent)}>
          {disk.usedPercent}%
        </span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${getUsageColor(disk.usedPercent)}`}
          style={{ width: `${disk.usedPercent}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-500">
        <span>{formatBytes(disk.usedSpace)} used</span>
        <span>{formatBytes(disk.freeSpace)} free</span>
      </div>
    </div>
  )
}

function LibraryCard({ library }: { library: LibraryInfo }) {
  return (
    <div
      data-testid={`library-${library.sectionId}`}
      className="bg-slate-800/50 rounded-lg p-3 flex items-center gap-3"
    >
      <span className="text-xl">{getLibraryIcon(library.sectionType)}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white truncate">
          {library.sectionName}
        </div>
        <div className="text-xs text-slate-500">
          {library.count.toLocaleString()} items
        </div>
      </div>
    </div>
  )
}

function StorageSkeleton() {
  return (
    <div className="divide-y divide-slate-700">
      <div className="p-4">
        <div className="h-4 w-20 bg-slate-700 rounded mb-3" />
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="animate-pulse space-y-2">
              <div className="flex justify-between">
                <div className="h-4 w-32 bg-slate-700 rounded" />
                <div className="h-4 w-10 bg-slate-700 rounded" />
              </div>
              <div className="h-2 bg-slate-700 rounded-full" />
              <div className="flex justify-between">
                <div className="h-3 w-20 bg-slate-800 rounded" />
                <div className="h-3 w-20 bg-slate-800 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="p-4">
        <div className="h-4 w-16 bg-slate-700 rounded mb-3" />
        <div className="grid grid-cols-2 gap-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="animate-pulse bg-slate-800/50 rounded-lg p-3 flex items-center gap-3">
              <div className="w-6 h-6 bg-slate-700 rounded" />
              <div className="flex-1 space-y-1">
                <div className="h-4 w-20 bg-slate-700 rounded" />
                <div className="h-3 w-16 bg-slate-800 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
