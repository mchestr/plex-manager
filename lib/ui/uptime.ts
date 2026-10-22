/**
 * The home page's week of uptime (ui-design-system 5.5): Prometheus's 168
 * hourly segments folded into 84 two-hour bars, plus the words that carry the
 * same meaning for screen readers. Pure and client-safe.
 *
 * ## Folding
 *
 * Each bar is the worst of its two hours, where one down hour in a pair reads
 * as `degraded` (drawn half height) and two read as `down` (hatched):
 *
 * ```
 * hours   up up | up down | down down | unknown up | unknown unknown
 * bars     up   | degraded |   down    |  unknown   |     unknown
 * ```
 *
 * An odd trailing hour folds on its own.
 *
 * @module lib/ui/uptime
 */

import type { StatusSegment } from "@/actions/prometheus-status"
import { formatDateTime, formatPercent, type FormatSettings } from "@/lib/utils/format"

export type UptimeBarStatus = "up" | "degraded" | "down" | "unknown"

export interface UptimeBar {
  /** The first hour's start, in Unix seconds. */
  timestamp: number
  status: UptimeBarStatus
}

/** Folds hourly segments into worst-of pairs: 168 hours give 84 bars. */
export function foldSegments(segments: readonly StatusSegment[]): UptimeBar[] {
  const bars: UptimeBar[] = []
  for (let i = 0; i < segments.length; i += 2) {
    const pair = segments.slice(i, i + 2)
    const down = pair.filter((segment) => segment.status === "down").length
    const status: UptimeBarStatus =
      down === pair.length
        ? "down"
        : down > 0
          ? "degraded"
          : pair.some((segment) => segment.status === "unknown")
            ? "unknown"
            : "up"
    bars.push({ timestamp: pair[0].timestamp, status })
  }
  return bars
}

/** "99.4% uptime over 7 days", from the hours with a known status; null when none is known. */
export function uptimeSummary(segments: readonly StatusSegment[], settings: FormatSettings): string | null {
  const known = segments.filter((segment) => segment.status !== "unknown")
  if (known.length === 0) return null
  const up = known.filter((segment) => segment.status === "up").length
  return `${formatPercent(up / known.length, settings)} uptime over 7 days`
}

/** One sentence per run of down hours: "Plex was down for 3 hours from Oct 12, 2026, 2:00 PM." */
export function uptimeIncidents(
  segments: readonly StatusSegment[],
  serviceName: string,
  settings: FormatSettings
): string[] {
  const incidents: string[] = []
  let start: number | null = null
  let hours = 0
  const close = () => {
    if (start === null) return
    const length = hours === 1 ? "1 hour" : `${hours} hours`
    incidents.push(`${serviceName} was down for ${length} from ${formatDateTime(start * 1000, settings)}.`)
    start = null
    hours = 0
  }
  for (const segment of segments) {
    if (segment.status === "down") {
      start ??= segment.timestamp
      hours += 1
    } else {
      close()
    }
  }
  close()
  return incidents
}
