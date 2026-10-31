/**
 * Who the inactivity sweep may remove, and how many at once. Pure and
 * client-safe: the sweep (`lib/inactivity/sweep.ts`) and the admin page's
 * preview apply the same rules.
 *
 * ## Skips
 *
 * {@link inactivitySkip} names the first rule that protects a member, in this
 * order:
 *
 * | Skip       | When                                                                   |
 * |------------|------------------------------------------------------------------------|
 * | `no_plex`  | The member has no Plex account (`plexUserId`)                          |
 * | `admin`    | An admin                                                               |
 * | `owner`    | The Plex server owner (`PlexServer.adminPlexUserId`)                   |
 * | `role`     | The member holds a role, such as Support                               |
 * | `exempt`   | Exempt from the subscription requirement                               |
 * | `paying`   | Subscription `ACTIVE` or `PAST_DUE`                                    |
 * | `excluded` | An admin excluded the member on their page                             |
 * | `not_read` | The latest read did not find them in Tautulli, or Tautulli keeps no history for them |
 *
 * ## Inactive
 *
 * A member is inactive once `thresholdDays` days have passed since
 * {@link lastActiveAt}: the later of their newest play and the day they
 * joined, so a member who joined recently and has not played yet is not
 * inactive.
 *
 * ## Safety limit
 *
 * A scheduled run removes no one when more members qualify than
 * {@link scheduledRunLimit} allows (5% of the members with access, from 1 to
 * 10). An admin run removes no one when more qualify than the admin confirmed.
 *
 * @module lib/inactivity/rules
 */

import type { SubscriptionStatus } from "@/lib/generated/prisma/client"

/** The member fields the rules read. */
export interface InactivityMember {
  id: string
  plexUserId: string | null
  isAdmin: boolean
  role: string | null
  isExempt: boolean
  inactivityExcluded: boolean
  subscriptionStatus: SubscriptionStatus | null
  createdAt: Date
  lastSeenAt: Date | null
  lastSeenReadAt: Date | null
}

/** Every skip, in priority order. */
export const INACTIVITY_SKIPS = ["no_plex", "admin", "owner", "role", "exempt", "paying", "excluded", "not_read"] as const

/** Why the sweep leaves a member alone. */
export type InactivitySkip = (typeof INACTIVITY_SKIPS)[number]

/** The words the admin pages show for each skip. */
export const SKIP_LABELS: Record<InactivitySkip, string> = {
  no_plex: "No Plex account",
  admin: "Admin",
  owner: "Server owner",
  role: "Has a role",
  exempt: "Exempt",
  paying: "Paying member",
  excluded: "Excluded by an admin",
  not_read: "Not found in Tautulli",
}

const DAY_MS = 24 * 60 * 60 * 1000

const PAYING: readonly SubscriptionStatus[] = ["ACTIVE", "PAST_DUE"]

/**
 * The first rule that protects `member` from the sweep, or `null` when none
 * does. `ownerPlexUserId` is the active server's `adminPlexUserId`;
 * `readSince` is when the latest read from Tautulli started, or `null` when
 * none has finished, so no member counts as read.
 *
 * @example
 * ```ts
 * const member = { id: "u1", plexUserId: "42", isAdmin: false, role: null, isExempt: false, inactivityExcluded: false,
 *   subscriptionStatus: null, createdAt: new Date("2025-01-01"), lastSeenAt: null, lastSeenReadAt: new Date("2026-10-31") }
 * inactivitySkip(member, { ownerPlexUserId: "1", readSince: new Date("2026-10-31") }) // null
 * inactivitySkip({ ...member, plexUserId: " 1 " }, { ownerPlexUserId: "1", readSince: null }) // "owner"
 * ```
 */
export function inactivitySkip(
  member: InactivityMember,
  { ownerPlexUserId, readSince }: { ownerPlexUserId: string | null; readSince: Date | null }
): InactivitySkip | null {
  const plexUserId = member.plexUserId?.trim()
  if (!plexUserId) return "no_plex"
  if (member.isAdmin) return "admin"
  if (ownerPlexUserId && plexUserId === ownerPlexUserId.trim()) return "owner"
  if (member.role !== null) return "role"
  if (member.isExempt) return "exempt"
  if (member.subscriptionStatus && PAYING.includes(member.subscriptionStatus)) return "paying"
  if (member.inactivityExcluded) return "excluded"
  if (!readSince || !member.lastSeenReadAt || member.lastSeenReadAt < readSince) return "not_read"
  return null
}

/** The later of the member's newest play and the day they joined. */
export function lastActiveAt(member: Pick<InactivityMember, "lastSeenAt" | "createdAt">): Date {
  const { lastSeenAt, createdAt } = member
  return lastSeenAt && lastSeenAt > createdAt ? lastSeenAt : createdAt
}

/** Whether at least `thresholdDays` days have passed since {@link lastActiveAt}. */
export function isInactive(
  member: Pick<InactivityMember, "lastSeenAt" | "createdAt">,
  thresholdDays: number,
  now: Date
): boolean {
  return now.getTime() - lastActiveAt(member).getTime() >= thresholdDays * DAY_MS
}

/** Sort order of the candidates: the longest inactive first, then by id, so a run and the preview list them alike. */
export function byLongestInactive(a: InactivityMember, b: InactivityMember): number {
  return lastActiveAt(a).getTime() - lastActiveAt(b).getTime() || a.id.localeCompare(b.id)
}

/**
 * The most members a scheduled run may remove: 5% of the members with access
 * to the server, at least 1 and at most 10. When more qualify, the run
 * removes no one (`over_limit`), because so many at once more likely means
 * stale data than a real drop in activity.
 */
export function scheduledRunLimit(sharedMembers: number): number {
  return Math.max(1, Math.min(10, Math.floor(sharedMembers * 0.05)))
}
