/**
 * The warning lists of the admin page (`/admin/inactivity`) and the member
 * page: who waits for a removal date that a warning named, who the next run
 * warns first, and who the app cannot email. Pure and client-safe; the
 * loaders (`lib/data/inactivity-preview.ts`, `lib/data/member-inactivity.ts`)
 * read the rows and the members.
 *
 * ## The lists
 *
 * Each member counts in one list at most, by the state of their current cycle:
 *
 * | List           | Who                                                                                         |
 * |----------------|---------------------------------------------------------------------------------------------|
 * | First warning  | No open warning (or one more than 7 days past its date), and the planner warns them at the next daily run |
 * | Waiting        | A removal date that a warning names ({@link openRemovalDay}), and the removal gate holds them back |
 *
 * The first warnings come from the run's own planner (`planWarnings`) at the
 * start of the next daily run, so they carry the date that run would name,
 * spread over the removal runs as the run spreads them. While warnings are
 * off, the same planner over the saved leads shows who a switch-on warns
 * first.
 *
 * While warnings are off, only a handled warning holds a removal (R4), so
 * only such a warning puts a member in the waiting list. A pending one is
 * cancelled when its job runs.
 *
 * ## Members the app cannot email
 *
 * {@link cannotEmail} names why, in the order the run and the warning email
 * job check: no address, not one address, not the address plex.tv holds for
 * them (only when this read of plex.tv worked), disabled by an admin, turned
 * off by the member, or refused by the mail server for good (from the last
 * row). The timeline goes on for them: the row is skipped, never held.
 *
 * @module lib/inactivity/notice-lists
 */

import { planWarnings, type PlanContext } from "@/lib/inactivity/notice-plan"
import {
  cycleState,
  emailUnconfirmed,
  graceOver,
  isSingleAddress,
  nextDailyRun,
  removalGate,
  startOfDay,
  type CycleState,
  type NOTICE_CODES,
  type NoticeRow,
  type WarningRules,
} from "@/lib/inactivity/notices"
import { byLongestInactive, type InactivityMember } from "@/lib/inactivity/rules"
import { dayKey } from "@/lib/utils/zoned-time"

/** A notice row with what the lists show besides the rules' fields. */
export interface NoticeDetail extends NoticeRow {
  code: string | null
  /** When a run planned, revived or cancelled it, or the job last tried it. */
  updatedAt: Date
}

/** Why the app cannot email a member: the codes a warning is skipped with. */
export type CannotEmailCode = (typeof NOTICE_CODES.skipped)[number]

/** The newest warning of a cycle, as the lists show it. */
export interface NoticeSummary {
  leadDays: number
  /** A lead of the smallest saved lead or less. */
  lastWarning: boolean
  status: string
  code: string | null
  /** When it was sent or skipped, else when it last changed: planned, revived, tried or cancelled. */
  at: Date
}

/**
 * The newest stage of `rows`: the latest removal date, then the smallest
 * lead. Null without rows.
 */
export function latestNotice(rows: readonly NoticeDetail[], warningDays: readonly number[]): NoticeSummary | null {
  const newest = rows.reduce<NoticeDetail | null>((best, row) => {
    if (!best || row.removeAfter > best.removeAfter) return row
    return row.removeAfter.getTime() === best.removeAfter.getTime() && row.leadDays < best.leadDays ? row : best
  }, null)
  if (!newest) return null
  return {
    leadDays: newest.leadDays,
    lastWarning: newest.leadDays <= warningDays[warningDays.length - 1],
    status: newest.status,
    code: newest.code,
    at: newest.handledAt ?? newest.updatedAt,
  }
}

/** What decides whether the app can email a member. */
export interface MailFacts {
  email: string | null
  disabledAt: Date | null
  inactivityEmailsOff: boolean
  /** The plex.tv email this read found for them, lower case. */
  plexEmail: string | undefined
  /** False when plex.tv's list could not be read, so the address is not checked against it. */
  plexRead: boolean
}

/**
 * Why the app cannot email the member, or null when it can.
 *
 * @example
 * ```ts
 * const facts = { email: "member@example.com", disabledAt: null, inactivityEmailsOff: false, plexEmail: "member@example.com", plexRead: true }
 * cannotEmail(facts)                                    // null
 * cannotEmail({ ...facts, email: null })                // "no_email"
 * cannotEmail({ ...facts, plexEmail: "new@example.com" }) // "email_unconfirmed"
 * cannotEmail({ ...facts, inactivityEmailsOff: true })  // "unsubscribed"
 * ```
 */
export function cannotEmail(facts: MailFacts, last: NoticeSummary | null = null): CannotEmailCode | null {
  if (!facts.email?.trim()) return "no_email"
  if (!isSingleAddress(facts.email)) return "invalid_email"
  if (facts.plexRead && emailUnconfirmed(facts.email, facts.plexEmail)) return "email_unconfirmed"
  if (facts.disabledAt) return "disabled"
  if (facts.inactivityEmailsOff) return "unsubscribed"
  return last?.status === "skipped" && last.code === "rejected" ? "rejected" : null
}

/**
 * The removal date that the cycle's warnings hold the member to, or null
 * when none does. With warnings on, that is the date of the active rows,
 * unless it started more than 7 days before `runAt` (the warnings start
 * again). With warnings off, only handled rows hold a date (R4): the later
 * of the due day and their latest date.
 */
export function openRemovalDay(state: CycleState, { warningsOn, runAt }: { warningsOn: boolean; runAt: Date }): string | null {
  if (warningsOn) return state.active.length === 0 || graceOver(state, runAt) ? null : state.day
  const handled = state.rows.filter((row) => (row.status === "sent" || row.status === "skipped") && row.handledAt !== null)
  if (handled.length === 0) return null
  const removeAfter = handled.reduce((latest, row) => (row.removeAfter > latest ? row.removeAfter : latest), startOfDay(state.dueDay, state.zone))
  return dayKey(removeAfter.getTime(), state.zone)
}

/** A member with an open warning whom the gate holds back. */
export interface WaitingEntry {
  member: InactivityMember
  /** The removal date, `YYYY-MM-DD` in the cycle's zone. */
  removalDay: string
  last: NoticeSummary | null
}

/** A member the next daily run warns first. */
export interface FirstWarningEntry {
  member: InactivityMember
  /** The removal date the first warning names, `YYYY-MM-DD` in the member zone. */
  removalDay: string
}

export interface ListContext extends Omit<PlanContext, "now"> {
  /** The page's clock, for the gate. */
  now: Date
  /** Warning emails are on: the gate then waits for the last warning. */
  warningsOn: boolean
}

/**
 * The waiting members, the soonest date first, and the first warnings of the
 * next daily run, the longest inactive first. `members` are the members with
 * a share and no skip, each with every notice row of theirs.
 */
export function warningLists(
  members: readonly { member: InactivityMember; rows: readonly NoticeDetail[] }[],
  ctx: ListContext
): { waiting: WaitingEntry[]; firstWarnings: FirstWarningEntry[] } {
  const runAt = nextDailyRun(ctx.now, ctx.serverZone)
  const warnings: WarningRules = { warningDays: ctx.warningDays, serverZone: ctx.serverZone }
  const plans = new Map(planWarnings(members, { ...ctx, now: runAt }).map((plan) => [plan.userId, plan]))
  const gate = { ...ctx, warnings: ctx.warningsOn ? warnings : null }

  const waiting: WaitingEntry[] = []
  const firstWarnings: FirstWarningEntry[] = []
  for (const { member, rows } of members) {
    const state = cycleState(member, rows, ctx)
    if (state.active.length === 0 || graceOver(state, runAt)) {
      const plan = plans.get(member.id)
      if (plan) firstWarnings.push({ member, removalDay: dayKey(plan.removeAfter.getTime(), plan.zone) })
      continue
    }
    const removalDay = openRemovalDay(state, { warningsOn: ctx.warningsOn, runAt })
    if (removalDay && removalGate(member, rows, gate) !== null) {
      const cycle = rows.filter((row) => row.cycleAt.getTime() === state.cycleAt.getTime())
      waiting.push({ member, removalDay, last: latestNotice(cycle, ctx.warningDays) })
    }
  }
  waiting.sort((a, b) => a.removalDay.localeCompare(b.removalDay) || byLongestInactive(a.member, b.member))
  firstWarnings.sort((a, b) => byLongestInactive(a.member, b.member))
  return { waiting, firstWarnings }
}
