/**
 * Discord Command Audit — shared query helpers
 *
 * Pure, testable helpers used across the metrics readers:
 * - {@link dateRangeWhere} builds the `createdAt` clause used by every reader.
 * - {@link countByStatus} folds a single `groupBy(["status"])` result into a
 *   `{ success, failed, timeout, ... }` shape, replacing paired `count()` calls.
 * - {@link toDateKey} buckets a timestamp into a `YYYY-MM-DD` day key.
 */

import type { DiscordCommandStatus } from "@/lib/generated/prisma/client"

/**
 * Build a Prisma `where` clause constraining `createdAt` to `[start, end)`.
 *
 * The upper bound uses `lt` (exclusive) to match the app's
 * `toEndOfDayExclusive` convention; the lower bound uses `gte` (inclusive).
 */
export function dateRangeWhere(
  start: Date,
  end: Date
): { createdAt: { gte: Date; lt: Date } } {
  return {
    createdAt: {
      gte: start,
      lt: end,
    },
  }
}

/**
 * Bucket a timestamp into its `YYYY-MM-DD` (UTC) day key.
 */
export function toDateKey(date: Date): string {
  return date.toISOString().split("T")[0]
}

/**
 * A single status-count group as returned by `groupBy(["status"])`.
 */
export interface StatusCountGroup {
  status: DiscordCommandStatus
  _count: { _all: number }
}

/**
 * Per-status counts folded from a `groupBy(["status"])` result.
 */
export interface StatusCounts {
  success: number
  failed: number
  timeout: number
  pending: number
}

/**
 * Fold a `groupBy(["status"])` result into per-status counts.
 *
 * Replaces multiple paired `count({ where: { status } })` queries with a
 * single grouped query whose rows are summed client-side.
 */
export function foldStatusCounts(groups: StatusCountGroup[]): StatusCounts {
  const counts: StatusCounts = {
    success: 0,
    failed: 0,
    timeout: 0,
    pending: 0,
  }

  for (const group of groups) {
    switch (group.status) {
      case "SUCCESS":
        counts.success += group._count._all
        break
      case "FAILED":
        counts.failed += group._count._all
        break
      case "TIMEOUT":
        counts.timeout += group._count._all
        break
      case "PENDING":
        counts.pending += group._count._all
        break
    }
  }

  return counts
}
