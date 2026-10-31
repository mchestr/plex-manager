/**
 * When a member last played something on Plex, as the admin users list shows,
 * filters and sorts it. Pure and client-safe.
 *
 * `lastSeenAt` is the start of the member's newest play in Tautulli and never
 * moves backwards; `lastSeenReadAt` is when the daily read last found the
 * member in Tautulli (`lib/inactivity/sync.ts`).
 *
 * ## States
 *
 * | State     | When                                                                       |
 * |-----------|----------------------------------------------------------------------------|
 * | `seen`    | `lastSeenAt` is set                                                        |
 * | `never`   | The read found the member in Tautulli, with no play                        |
 * | `unknown` | No read found them: no Plex account, not in Tautulli, or no read has run   |
 *
 * ## Filters (`?seen=`)
 *
 * | Value         | Members                                       |
 * |---------------|-----------------------------------------------|
 * | `all`         | Everyone (the default)                        |
 * | `recent`      | Seen less than 30 days before now             |
 * | `inactive90`  | Seen, and not in the 90 days before now       |
 * | `inactive180` | Seen, and not in the 180 days before now      |
 * | `never`       | State `never`                                 |
 * | `unknown`     | State `unknown`                               |
 *
 * The inactive filters leave out members with no play, who show as `never`
 * or `unknown`; the inactivity sweep applies its own rules
 * (`lib/inactivity/rules.ts`). The Members tile counts `inactive180`.
 *
 * ## Sort
 *
 * {@link lastSeenRank} is compared before the sort direction applies, so the
 * `lastSeen` sort lists the members with a play first (newest or oldest),
 * then Never, then unknown, in both directions.
 *
 * @module lib/admin/last-seen
 */

import type { AdminUserWithWrappedStats } from "@/types/admin"

export type LastSeenState = "seen" | "never" | "unknown"

type LastSeenFields = Pick<AdminUserWithWrappedStats, "lastSeenAt" | "lastSeenReadAt">

export const SEEN_FILTERS = ["all", "recent", "inactive90", "inactive180", "never", "unknown"] as const

export type SeenFilter = (typeof SEEN_FILTERS)[number]

/** The words for each `?seen=` value, for the filter's options and its chip. */
export const SEEN_FILTER_LABELS: Record<SeenFilter, string> = {
  all: "All",
  recent: "Seen in the last 30 days",
  inactive90: "Not seen in 90 days",
  inactive180: "Not seen in 180 days",
  never: "Never seen",
  unknown: "Unknown",
}

/** Days without a play that the Members tile counts, the `inactive180` filter. */
export const INACTIVE_STAT_DAYS = 180

const DAY_MS = 86_400_000

/** The filters that test the age of the newest play, in days. */
const AGE_TESTS: Record<"recent" | "inactive90" | "inactive180", (days: number) => boolean> = {
  recent: (days) => days < 30,
  inactive90: (days) => days >= 90,
  inactive180: (days) => days >= INACTIVE_STAT_DAYS,
}

const RANK: Record<LastSeenState, number> = { seen: 0, never: 1, unknown: 2 }

export function lastSeenState(user: LastSeenFields): LastSeenState {
  if (user.lastSeenAt) return "seen"
  return user.lastSeenReadAt ? "never" : "unknown"
}

/** Whether the member matches a `?seen=` value at `now` (epoch milliseconds). */
export function matchesSeen(user: LastSeenFields, value: SeenFilter, now: number): boolean {
  if (value === "all") return true
  if (value === "never" || value === "unknown") return lastSeenState(user) === value
  return user.lastSeenAt !== null && AGE_TESTS[value]((now - user.lastSeenAt.getTime()) / DAY_MS)
}

/** The member's group in the `lastSeen` sort: a play, then Never, then unknown. */
export function lastSeenRank(user: LastSeenFields): number {
  return RANK[lastSeenState(user)]
}
