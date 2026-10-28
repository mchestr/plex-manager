"use client"

import { useInfiniteQuery } from "@tanstack/react-query"

import { getUserActivityTimeline } from "@/actions/user-queries"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { Time } from "@/components/ui/time"
import { queryKeys } from "@/hooks/query-keys"
import { useFormat } from "@/lib/format-context"
import { chatMessageLabel } from "@/lib/ui/privacy-copy"
import type { Tone } from "@/lib/ui/status"
import type { UserActivityItem, UserActivityTimelineData } from "@/types/admin"

interface UserActivityTimelineProps {
  userId: string
  /** The first page, rendered on the server. */
  initialData: UserActivityTimelineData
}

const PAGE_SIZE = 10

const COMMAND_STATUS: Record<string, { tone: Tone; label: string }> = {
  SUCCESS: { tone: "success", label: "Success" },
  FAILED: { tone: "destructive", label: "Failed" },
  PENDING: { tone: "neutral", label: "Pending" },
  TIMEOUT: { tone: "warning", label: "Timed out" },
}

const MARK_LABEL: Record<string, string> = {
  FINISHED_WATCHING: "Finished",
  NOT_INTERESTED: "Not interested",
  KEEP_FOREVER: "Keep forever",
  REWATCH_CANDIDATE: "Rewatch",
  POOR_QUALITY: "Poor quality",
  WRONG_VERSION: "Wrong version",
}

function formatMediaTitle(item: UserActivityItem & { type: "media_mark" }) {
  if (item.mediaType === "EPISODE" && item.parentTitle) {
    const episode = item.seasonNumber != null && item.episodeNumber != null ? ` S${item.seasonNumber}E${item.episodeNumber}` : ""
    return `${item.parentTitle}${episode}: ${item.title}`
  }
  return item.year ? `${item.title} (${item.year})` : item.title
}

function ActivityItem({ item }: { item: UserActivityItem }) {
  const status = item.type === "discord_command" ? (COMMAND_STATUS[item.status] ?? { tone: "neutral" as const, label: item.status }) : null
  // An assistant message shows its length, never its text (GAP-32)
  const detail = item.type === "discord_command" ? (chatMessageLabel(item.argsLength) ?? item.commandArgs) : null

  return (
    <li className="flex flex-col gap-1.5 rounded-lg border bg-card p-4" data-testid={`activity-item-${item.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" data-testid="activity-type-badge">
          {item.type === "discord_command" ? "Discord" : "Media mark"}
        </Badge>
        <span className="text-caption text-muted-foreground">
          <Time value={item.timestamp} />
        </span>
      </div>
      {item.type === "discord_command" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-ui text-foreground">{item.commandName}</span>
            {status && <StatusBadge tone={status.tone} label={status.label} />}
            {item.responseTimeMs != null && <span className="text-caption text-muted-foreground">{item.responseTimeMs} ms</span>}
          </div>
          {detail && (
            <p className="truncate text-caption text-muted-foreground" title={detail} data-testid="activity-command-detail">
              {detail}
            </p>
          )}
          <p className="text-caption text-muted-foreground">Sent in {item.channelType.replace(/-/g, " ")}</p>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">{MARK_LABEL[item.markType] ?? item.markType.replace(/_/g, " ").toLowerCase()}</Badge>
            <span className="text-ui text-foreground">{formatMediaTitle(item)}</span>
          </div>
          <p className="text-caption text-muted-foreground">Marked through {item.markedVia}</p>
        </>
      )}
    </li>
  )
}

/**
 * A member's activity, newest first (GAP-38): keyset pages through
 * `useInfiniteQuery`, with "Show older activity" and a "Showing 30 of 47" line.
 */
export function UserActivityTimeline({ userId, initialData }: UserActivityTimelineProps) {
  const f = useFormat()
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError } = useInfiniteQuery({
    queryKey: queryKeys.userActivityTimeline(userId),
    queryFn: async ({ pageParam }) => {
      const result = await getUserActivityTimeline({ userId, cursor: pageParam, pageSize: PAGE_SIZE })
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialData: { pages: [initialData], pageParams: [undefined] },
    staleTime: 30_000,
  })

  const items = data.pages.flatMap((page) => page.items)
  const total = data.pages[0]?.total ?? 0

  if (items.length === 0) {
    return <p className="rounded-lg border bg-card p-6 text-center text-ui text-muted-foreground">This member has no activity yet.</p>
  }

  return (
    <div className="flex flex-col gap-3" data-testid="user-activity-timeline">
      <ol className="flex flex-col gap-2">
        {items.map((item) => (
          <ActivityItem key={`${item.type}-${item.id}`} item={item} />
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-label text-muted-foreground" aria-live="polite" data-testid="activity-count">
          Showing {f.number(items.length)} of {f.number(total)}
        </p>
        {hasNextPage && (
          <Button variant="outline" size="sm" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage} data-testid="activity-show-older">
            {isFetchingNextPage ? "Loading older activity" : "Show older activity"}
          </Button>
        )}
      </div>
      {isFetchNextPageError && (
        <p role="alert" className="text-label text-destructive">
          Couldn&apos;t load older activity. Try again.
        </p>
      )}
    </div>
  )
}
