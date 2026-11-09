/**
 * The warning planner: which warning emails one run plans, for every member
 * who passes the sweep's own steps (a share, no skip). Pure and client-safe;
 * the warning step (`lib/inactivity/warn.ts`) stores what it returns.
 *
 * ## Each member
 *
 * `s` is the send day (`noticeSendDay`), `D` the removal date of the cycle
 * (`cycleState`), `Lmax` and `Lmin` the largest and the smallest lead.
 *
 * 1. No active row: outside the window (`dueDay - s > Lmax`) nothing; else a
 *    first warning (lead `Lmax`), dated as below.
 * 2. `D` was more than 7 days before the run's date: a new first warning
 *    (the warnings start again with the full lead).
 * 3. `D - s <= 0`: when the last warning for `D` is not handled, or a later
 *    last warning failed or was cancelled (not superseded), a new last
 *    warning (lead `Lmin`, date `s + Lmin`); when it was handled 12 hours ago
 *    or more and no one played on the server since, the same, once a cycle.
 *    Otherwise it is the sweep's turn.
 * 4. `D - s > Lmax` (after a threshold increase): nothing yet.
 * 5. Else the most urgent stage, the smallest lead of `D - s` or more, unless
 *    an active row for `D` already has that lead or a smaller one. After
 *    missed runs, a member with 3 days left gets the 7-day stage, never 30.
 *
 * A plan whose key (cycle, date, lead) has a row already revives a
 * `cancelled` row or a `failed` row with fewer than 9 attempts, and plans
 * nothing for any other.
 *
 * ## First warning dates
 *
 * A member's removal run is the first daily run at or after
 * `max(due, start(D))`. The planner counts the members of each removal run
 * from the date of every open cycle, then gives each new first warning,
 * the longest inactive first, the first date from `s + Lmax` on whose
 * removal run holds fewer members than that run's safety limit. The limit
 * counts the members with a share less every member planned for an earlier
 * removal run, since each removal lowers the next run's limit (5% of 40
 * members is 2, of 38 only 1). So a catch-up batch drains a few members a day
 * instead of blocking every scheduled run (`over_limit`). New last warnings
 * and dates moved by a threshold increase do not look at the count.
 *
 * @module lib/inactivity/notice-plan
 */

import {
  addDays,
  cycleState,
  daysBetween,
  graceOver,
  handledLastWarnings,
  lastWarningHandledAt,
  MAX_NOTICE_ATTEMPTS,
  MIN_NOTICE_MS,
  noticeSendDay,
  removalRunDay,
  startOfDay,
  type CycleState,
  type NoticeRow,
  unsentLaterLastWarning,
  type WarningRules,
} from "@/lib/inactivity/notices"
import { byLongestInactive, scheduledRunLimit, type InactivityMember } from "@/lib/inactivity/rules"

/** One member the run may warn, with every notice row of theirs. */
export interface PlanMember {
  member: InactivityMember
  rows: readonly NoticeRow[]
}

export interface PlanContext extends WarningRules {
  now: Date
  thresholdDays: number
  /** The newest play on the whole server that this run read. */
  newestPlayAt: Date | null
  /** Members with a share of the server, for the safety limit. */
  sharedMembers: number
}

/** One warning to store: a new row, or `reviveId`'s row back to work. */
export interface NoticePlan {
  userId: string
  cycleAt: Date
  leadDays: number
  removeAfter: Date
  zone: string
  /** The row with this key to plan again, or null for a new row. */
  reviveId: string | null
}

type Decision = { kind: "none" } | { kind: "first" } | { kind: "date"; leadDays: number; day: string }

const NONE: Decision = { kind: "none" }

function decide(state: CycleState, sendDay: string, ctx: PlanContext): Decision {
  const leads = ctx.warningDays
  const [largest, smallest] = [leads[0], leads[leads.length - 1]]
  if (state.active.length === 0) return daysBetween(sendDay, state.dueDay) > largest ? NONE : { kind: "first" }
  if (graceOver(state, ctx.now)) return { kind: "first" }

  const left = daysBetween(sendDay, state.day)
  const newLastWarning: Decision = { kind: "date", leadDays: smallest, day: addDays(sendDay, smallest) }
  if (left <= 0) {
    const handledAt = lastWarningHandledAt(state, leads)
    if (!handledAt || unsentLaterLastWarning(state, leads)) return newLastWarning
    const idle = ctx.now.getTime() - handledAt.getTime() >= MIN_NOTICE_MS && (!ctx.newestPlayAt || ctx.newestPlayAt <= handledAt)
    return idle && handledLastWarnings(state, leads).length < 2 ? newLastWarning : NONE
  }
  if (left > largest) return NONE

  const stage = leads.filter((lead) => lead >= left).at(-1)!
  const sent = state.active.some((row) => row.removeAfter.getTime() === state.removeAfter.getTime() && row.leadDays <= stage)
  return sent ? NONE : { kind: "date", leadDays: stage, day: state.day }
}

/** The plan for `leadDays` and `removeAfter` in the cycle, or null when its row may not be planned again. */
function planFor(member: InactivityMember, state: CycleState, leadDays: number, removeAfter: Date): NoticePlan | null {
  const existing = state.rows.find((row) => row.leadDays === leadDays && row.removeAfter.getTime() === removeAfter.getTime())
  const revivable = existing && (existing.status === "cancelled" || (existing.status === "failed" && existing.attempts < MAX_NOTICE_ATTEMPTS))
  if (existing && !revivable) return null
  return { userId: member.id, cycleAt: state.cycleAt, leadDays, removeAfter, zone: state.zone, reviveId: existing?.id ?? null }
}

const later = (a: Date, b: Date) => (a > b ? a : b)

/**
 * The removal runs that hold more members than their safety limit, where
 * each run's limit counts the members with a share less those planned for
 * an earlier run.
 */
function overLimit(load: ReadonlyMap<string, number>, sharedMembers: number): Set<string> {
  const over = new Set<string>()
  let before = 0
  for (const day of [...load.keys()].sort()) {
    const members = load.get(day)!
    if (members > scheduledRunLimit(sharedMembers - before)) over.add(day)
    before += members
  }
  return over
}

/**
 * The warnings one run plans for `members`, the members who passed the
 * sweep's steps (a share, no skip), with every row of theirs.
 *
 * @example
 * ```ts
 * // Threshold 180 and leads 30, 7, 1: the first warning goes out 30 days before the due day
 * const member = { id: "u1", plexUserId: "42", isAdmin: false, role: null, inactivityExcluded: false,
 *   subscriptionStatus: null, createdAt: new Date("2025-01-01T00:00:00Z"), lastSeenAt: new Date("2026-05-02T00:00:00Z"),
 *   lastSeenReadAt: null, accessEndedAt: null, accessRestoredAt: null, timezone: "America/Toronto" }
 * planWarnings([{ member, rows: [] }], { now: new Date("2026-09-28T06:17:00Z"), thresholdDays: 180,
 *   warningDays: [30, 7, 1], serverZone: "America/Toronto", newestPlayAt: null, sharedMembers: 40 })
 * // [{ userId: "u1", leadDays: 30, removeAfter: 2026-10-28T04:00:00.000Z (00:00 in Toronto), reviveId: null, ... }]
 * ```
 */
export function planWarnings(members: readonly PlanMember[], ctx: PlanContext): NoticePlan[] {
  const plans: NoticePlan[] = []
  const load = new Map<string, number>()
  const count = (state: CycleState, removeAfter: Date) => {
    const run = removalRunDay(later(state.due, removeAfter), ctx.serverZone)
    load.set(run, (load.get(run) ?? 0) + 1)
  }
  const firsts: { member: InactivityMember; state: CycleState; sendDay: string }[] = []

  for (const { member, rows } of members) {
    const state = cycleState(member, rows, ctx)
    const sendDay = noticeSendDay(ctx.now, state.zone)
    const decision = decide(state, sendDay, ctx)
    if (decision.kind === "first") {
      firsts.push({ member, state, sendDay })
      continue
    }
    let removeAfter = state.removeAfter
    if (decision.kind === "date") {
      const planned = startOfDay(decision.day, state.zone)
      const plan = planFor(member, state, decision.leadDays, planned)
      if (plan) plans.push(plan)
      removeAfter = later(removeAfter, planned)
    }
    if (decision.kind === "date" || state.active.length > 0) count(state, removeAfter)
  }

  /** Whether one more member on `run` keeps it, and every run after it, within its limit. */
  const hasRoom = (run: string) => {
    const already = overLimit(load, ctx.sharedMembers)
    const after = overLimit(new Map(load).set(run, (load.get(run) ?? 0) + 1), ctx.sharedMembers)
    return [...after].every((day) => day !== run && already.has(day))
  }
  const largest = ctx.warningDays[0]
  for (const { member, state, sendDay } of firsts.sort((a, b) => byLongestInactive(a.member, b.member))) {
    let day = addDays(sendDay, largest)
    let removeAfter = startOfDay(day, state.zone)
    while (!hasRoom(removalRunDay(later(state.due, removeAfter), ctx.serverZone))) {
      day = addDays(day, 1)
      removeAfter = startOfDay(day, state.zone)
    }
    count(state, removeAfter)
    const plan = planFor(member, state, largest, removeAfter)
    if (plan) plans.push(plan)
  }
  return plans
}
