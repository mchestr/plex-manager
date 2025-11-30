"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { getUserActivityTimeline } from "@/actions/user-queries"
import { Pagination } from "@/components/ui/pagination"
import { formatRelativeTime } from "@/lib/utils/time-formatting"
import type { UserActivityItem, UserActivityTimelineData } from "@/types/admin"

interface UserActivityTimelineProps {
  userId: string
  initialData: UserActivityTimelineData
}

function getStatusBadge(status: string) {
  switch (status) {
    case "SUCCESS":
      return (
        <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs font-medium rounded">
          Success
        </span>
      )
    case "FAILED":
      return (
        <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-xs font-medium rounded">
          Failed
        </span>
      )
    case "PENDING":
      return (
        <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs font-medium rounded">
          Pending
        </span>
      )
    case "TIMEOUT":
      return (
        <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-400 text-xs font-medium rounded">
          Timeout
        </span>
      )
    default:
      return (
        <span className="px-1.5 py-0.5 bg-slate-500/20 text-slate-400 text-xs font-medium rounded">
          {status}
        </span>
      )
  }
}

function getMarkTypeBadge(markType: string) {
  switch (markType) {
    case "FINISHED_WATCHING":
      return (
        <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-xs font-medium rounded">
          Finished
        </span>
      )
    case "NOT_INTERESTED":
      return (
        <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-xs font-medium rounded">
          Not Interested
        </span>
      )
    case "KEEP_FOREVER":
      return (
        <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs font-medium rounded">
          Keep Forever
        </span>
      )
    case "REWATCH_CANDIDATE":
      return (
        <span className="px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 text-xs font-medium rounded">
          Rewatch
        </span>
      )
    case "POOR_QUALITY":
      return (
        <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-400 text-xs font-medium rounded">
          Poor Quality
        </span>
      )
    case "WRONG_VERSION":
      return (
        <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-xs font-medium rounded">
          Wrong Version
        </span>
      )
    default:
      return (
        <span className="px-1.5 py-0.5 bg-slate-500/20 text-slate-400 text-xs font-medium rounded">
          {markType.replace(/_/g, " ")}
        </span>
      )
  }
}

function formatMediaTitle(item: UserActivityItem & { type: "media_mark" }) {
  if (item.mediaType === "EPISODE" && item.parentTitle) {
    const episodeInfo =
      item.seasonNumber != null && item.episodeNumber != null
        ? ` S${item.seasonNumber}E${item.episodeNumber}`
        : ""
    return `${item.parentTitle}${episodeInfo}: ${item.title}`
  }
  return item.year ? `${item.title} (${item.year})` : item.title
}

function ActivityItem({ item }: { item: UserActivityItem }) {
  const isDiscord = item.type === "discord_command"

  return (
    <div
      className="relative pl-8 pb-6 last:pb-0"
      data-testid={`activity-item-${item.id}`}
    >
      {/* Timeline line */}
      <div className="absolute left-[11px] top-3 bottom-0 w-px bg-slate-700 last:hidden" />

      {/* Timeline dot */}
      <div
        className={`absolute left-0 top-1.5 w-6 h-6 rounded-full flex items-center justify-center ${
          isDiscord ? "bg-indigo-500/20" : "bg-purple-500/20"
        }`}
      >
        <div
          className={`w-2.5 h-2.5 rounded-full ${
            isDiscord ? "bg-indigo-400" : "bg-purple-400"
          }`}
        />
      </div>

      {/* Content */}
      <div className="bg-slate-800/30 rounded-lg p-4">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {/* Type badge */}
          {isDiscord ? (
            <span
              className="px-2 py-1 bg-indigo-500/20 text-indigo-400 text-xs font-medium rounded"
              data-testid="activity-type-badge"
            >
              Discord
            </span>
          ) : (
            <span
              className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs font-medium rounded"
              data-testid="activity-type-badge"
            >
              Media Mark
            </span>
          )}

          {/* Timestamp */}
          <span className="text-xs text-slate-500">
            {formatRelativeTime(item.timestamp)}
          </span>
        </div>

        {/* Type-specific content */}
        {item.type === "discord_command" ? (
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-sm text-slate-300 font-mono">
                {item.commandName}
              </span>
              {getStatusBadge(item.status)}
              {item.responseTimeMs != null && (
                <span className="text-xs text-slate-500">
                  {item.responseTimeMs}ms
                </span>
              )}
            </div>
            {item.commandArgs && (
              <p
                className="text-xs text-slate-500 truncate"
                title={item.commandArgs}
              >
                {item.commandArgs}
              </p>
            )}
            <p className="text-xs text-slate-500 mt-1 capitalize">
              via {item.channelType.replace(/-/g, " ")}
            </p>
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              {getMarkTypeBadge(item.markType)}
            </div>
            <p className="text-sm text-slate-300">{formatMediaTitle(item)}</p>
            <p className="text-xs text-slate-500 mt-1 capitalize">
              via {item.markedVia}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export function UserActivityTimeline({
  userId,
  initialData,
}: UserActivityTimelineProps) {
  const [page, setPage] = useState(1)
  const pageSize = 10

  const { data, isLoading } = useQuery({
    queryKey: ["user-activity-timeline", userId, page, pageSize],
    queryFn: () => getUserActivityTimeline(userId, { page, pageSize }),
    initialData: page === 1 ? initialData : undefined,
    staleTime: 30000,
  })

  if (isLoading && !data) {
    return (
      <div className="p-8 text-center text-slate-500">
        Loading activity...
      </div>
    )
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500">
        No activity recorded for this user yet
      </div>
    )
  }

  return (
    <div data-testid="user-activity-timeline">
      <div className="p-4">
        {data.items.map((item) => (
          <ActivityItem key={item.id} item={item} />
        ))}
      </div>

      {data.totalPages > 1 && (
        <div className="border-t border-slate-700 px-4">
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            totalCount={data.total}
            totalPages={data.totalPages}
            hasNextPage={data.page < data.totalPages}
            hasPreviousPage={data.page > 1}
            onPageChange={setPage}
            data-testid="activity-pagination"
          />
        </div>
      )}
    </div>
  )
}
