/**
 * The assistant history's date groups, on the viewer's clock: Today,
 * Yesterday, Previous 7 days, Previous 30 days, then Older. Pure.
 *
 * @module lib/admin/assistant-groups
 */

import { dayKey } from "@/lib/utils/zoned-time"

export type HistoryGroup = "Today" | "Yesterday" | "Previous 7 days" | "Previous 30 days" | "Older"

const DAY_MS = 24 * 60 * 60 * 1000

/** Calendar days from one `YYYY-MM-DD` to another. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

/**
 * The group of a conversation last active at `at`, by calendar day in `zone`.
 * A time ahead of `now` (another clock) is Today.
 *
 * @example
 * ```ts
 * const now = Date.parse("2026-10-28T09:00:00Z")
 * historyGroup(Date.parse("2026-10-27T23:30:00Z"), now, "UTC")          // "Yesterday"
 * historyGroup(Date.parse("2026-10-27T23:30:00Z"), now, "Europe/Berlin") // "Today"
 * ```
 *
 * @internal
 */
export function historyGroup(at: number, now: number, zone: string): HistoryGroup {
  const days = daysBetween(dayKey(at, zone), dayKey(now, zone))
  if (days <= 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days <= 7) return "Previous 7 days"
  if (days <= 30) return "Previous 30 days"
  return "Older"
}

/** Conversations in their groups, newest group first, each keeping the given order. */
export function groupHistory<T extends { lastMessageAt: number }>(items: readonly T[], now: number, zone: string) {
  const groups: { group: HistoryGroup; items: T[] }[] = []
  for (const item of items) {
    const group = historyGroup(item.lastMessageAt, now, zone)
    const last = groups.at(-1)
    if (last?.group === group) last.items.push(item)
    else groups.push({ group, items: [item] })
  }
  return groups
}
