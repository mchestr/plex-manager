"use client"

import { RefreshDataButton } from "@/components/admin/cleanup/page/refresh-data-button"
import { readTimeText } from "@/components/admin/cleanup/preview/read-time"
import { Spinner } from "@/components/ui/spinner"
import { StatusDot } from "@/components/ui/status-badge"
import { SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import type { SourceStatus } from "@/lib/cleanup/schema/snapshot"
import type { CleanupSnapshotState } from "@/lib/cleanup/types/screens"
import { useFormat } from "@/lib/format-context"
import { cn } from "@/lib/utils"
import { SERVICES, type Service } from "@/lib/validations/cleanup-vocabulary"

/** UX 8.2 and 4.1.4. */
const SOURCE_LINE_WORDS = {
  firstRead: "Reading your library for the first time. This takes 1 to 3 minutes.",
  reading: "Reading the library. This takes 1 to 3 minutes.",
  noData: "No library data yet.",
} as const

interface SourceLineProps {
  /** The sources of the newest complete snapshot. Only configured sources show. */
  sources: readonly SourceStatus[]
  snapshot: CleanupSnapshotState
  /** The job queue is set up. */
  redis: boolean
  /** The render's clock, for "today". */
  now: number
  /** Show "Refresh data now" at the end (first use). The Rules heading leaves it out (`shots/02-rules-normal.png`). */
  refresh?: boolean
  className?: string
}

/** One dot per configured service, in `SERVICES` order. A service fails when one of its parts failed (the Plex share list too). */
function serviceDots(sources: readonly SourceStatus[]): { service: Service; failed: boolean }[] {
  return SERVICES.flatMap((service) => {
    const own = sources.filter((source) => source.service === service && source.state !== "notConfigured")
    return own.length > 0 ? [{ service, failed: own.some((source) => source.state === "failed") }] : []
  })
}

/**
 * The source line of the Rules tab (UX 4.1.1, 4.1.4): a status dot for each
 * configured source, the time of the library data, and "Refresh data now".
 * Before the first library data it reads "Reading your library for the
 * first time" (`admin-cleanup-first-read`), and while a read runs it shows
 * a spinner. Both go to a polite live region.
 */
export function SourceLine({ sources, snapshot, redis, now, refresh = true, className }: SourceLineProps) {
  const f = useFormat()
  const dots = serviceDots(sources)
  const taken = snapshot.takenAt ?? snapshot.finishedAt
  const firstRead = !taken && redis

  const status = firstRead || (taken && snapshot.reading) ? (
    <span className="inline-flex items-center gap-2" data-testid={firstRead ? "admin-cleanup-first-read" : undefined}>
      <Spinner />
      {firstRead ? SOURCE_LINE_WORDS.firstRead : SOURCE_LINE_WORDS.reading}
    </span>
  ) : taken ? (
    <span>
      Library data from <span data-testid="admin-cleanup-data-timestamp">{readTimeText(f, taken, now)}</span>
    </span>
  ) : (
    <span>{SOURCE_LINE_WORDS.noData}</span>
  )

  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-muted-foreground", className)} data-testid="admin-cleanup-sources">
      {dots.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Library data sources">
          {dots.map(({ service, failed }) => (
            <li key={service}>
              <StatusDot
                tone={failed ? "destructive" : "success"}
                label={failed ? `${SERVICE_NAMES[service]} failed` : SERVICE_NAMES[service]}
                className="text-label"
                data-testid={`admin-cleanup-source-${service}`}
              />
            </li>
          ))}
        </ul>
      )}
      <span aria-live="polite">{status}</span>
      {refresh && <RefreshDataButton redis={redis} reading={snapshot.reading} className="-ml-2" />}
    </div>
  )
}
