/**
 * Warning emails before the inactivity sweep removes a member: the notice
 * vocabulary, the dates of a cycle and the removal gate. Pure and
 * client-safe: the sweep (`lib/inactivity/sweep.ts`), the warning step
 * (`lib/inactivity/warn.ts`, through `lib/inactivity/notice-plan.ts`) and the
 * admin page's preview apply the same rules.
 *
 * ## Terms
 *
 * - **Notice row**: one planned warning email and its result
 *   (`InactivityNotice`), keyed by member, cycle, removal date and lead.
 * - **Cycle**: one inactive period, keyed by the member's last active time
 *   (`cycleAt`). A play or a return starts a new cycle, which has no rows.
 * - **Lead**: the days before the removal date that a warning goes out
 *   (`warningDays`, largest first). A warning with the smallest lead, or a
 *   smaller one, is a **last warning**.
 * - **Due day**: the date, in the cycle's zone, on which the member becomes
 *   inactive (last active time plus the threshold).
 * - **Removal date** `D`: the later of the due day and the latest date of the
 *   cycle's active rows (`pending`, `sending`, `sent`, `skipped`). Dates never
 *   move earlier, so a lower threshold keeps the date already sent.
 * - **Handled**: a row `sent` or `skipped`. A skipped warning (no address, an
 *   opt-out) counts, so an opt-out stops email, never the timeline.
 *
 * Every date of a cycle is in the zone stored on its rows; a cycle without
 * rows takes the member zone now (`User.timezone`, else the server zone).
 *
 * ## The removal gate
 *
 * {@link removalGate} names what holds a member back, or null when the sweep
 * may remove them:
 *
 * | Warnings | Removable when |
 * |----------|----------------|
 * | On       | Inactive, `D` started at most {@link NOTICE_GRACE_DAYS} calendar days before the run's date, the last warning for `D` was handled at least {@link MIN_NOTICE_MS} before the run, and someone played on the server after it |
 * | Off      | Inactive, and the run starts on or after the latest date of the cycle's handled rows, if any |
 *
 * With warnings off and no handled row, the gate is the sweep's own rule
 * (`isInactive`), so removal works exactly as before warnings existed.
 *
 * @module lib/inactivity/notices
 */

import { isInactive, lastActiveAt, type InactivityMember } from "@/lib/inactivity/rules"
import { dayKey, formatDayKey, wallTimeToInstant } from "@/lib/utils/zoned-time"
import { nextSendWindow } from "@/lib/wrapped/notify/window"
import { resolveZone } from "@/lib/wrapped/time/zone"

/**
 * Every status of a notice row.
 *
 * @public The warning email job and the admin lists read it.
 */
export const NOTICE_STATUSES = ["pending", "sending", "sent", "skipped", "failed", "cancelled"] as const

export type NoticeStatus = (typeof NOTICE_STATUSES)[number]

/**
 * The closed list of codes, by the status that carries them.
 *
 * @public The warning email job sets the skip, fail and cancel codes.
 */
export const NOTICE_CODES = {
  skipped: ["no_email", "invalid_email", "email_unconfirmed", "disabled", "unsubscribed", "rejected"],
  failed: ["smtp", "smtp_refused", "timeout", "no_transport", "stalled"],
  cancelled: ["removal_off", "warnings_off", "cycle_changed", "protected", "access_ended", "stale_data", "superseded", "late"],
} as const satisfies Partial<Record<NoticeStatus, readonly string[]>>

/** Why a row was skipped, failed or cancelled. */
export type NoticeCode = (typeof NOTICE_CODES)[keyof typeof NOTICE_CODES][number]

/** A failed row with this many attempts is not tried again. */
export const MAX_NOTICE_ATTEMPTS = 9
/** The shortest time from a handled last warning to the run that removes the member. */
export const MIN_NOTICE_MS = 12 * 60 * 60 * 1000
/** Calendar days after the removal date after which the warnings start again. */
const NOTICE_GRACE_DAYS = 7
/** A row `sending` for longer than this lost its job; the next run marks it `failed`, code `stalled`. */
export const STALLED_SENDING_MS = 60 * 60 * 1000
/** The wall time of the daily run in the server zone (`lib/inactivity/schedule.ts`). */
export const DAILY_RUN = { hour: 2, minute: 17 } as const

const DAY_MS = 24 * 60 * 60 * 1000
const ACTIVE: ReadonlySet<string> = new Set<NoticeStatus>(["pending", "sending", "sent", "skipped"])
const HANDLED: ReadonlySet<string> = new Set<NoticeStatus>(["sent", "skipped"])

/** The notice row fields the rules read. */
export interface NoticeRow {
  id: string
  userId: string
  cycleAt: Date
  leadDays: number
  removeAfter: Date
  status: string
  attempts: number
  zone: string
  handledAt: Date | null
}

/** The warning settings a run applies while warnings are on (`GateContext.warnings` is null while off). */
export interface WarningRules {
  /** The leads, largest first, at least one. */
  warningDays: readonly number[]
  serverZone: string
}

/** The calendar date `days` after `day` (`YYYY-MM-DD`). */
export function addDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number)
  const next = new Date(Date.UTC(year, month - 1, date + days))
  return formatDayKey(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())
}

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

/** 00:00 of `day` in `zone`, or the first instant of the day where midnight does not happen. */
export const startOfDay = (day: string, zone: string): Date => wallTimeToInstant(`${day}T00:00`, zone)

/** The date in `zone` of `at`. */
const dayIn = (at: Date, zone: string): string => dayKey(at.getTime(), zone)

/**
 * The date in `zone` on which an email that a run plans at `now` goes out:
 * the send window opens at 09:00 and closes at 20:00 there.
 *
 * @example
 * ```ts
 * noticeSendDay(new Date("2026-12-10T07:17:00Z"), "America/Toronto")   // "2026-12-10" (02:17, sent at 09:00)
 * noticeSendDay(new Date("2026-12-10T07:17:00Z"), "America/Vancouver") // "2026-12-10" (23:17 the evening before, sent at 09:00)
 * noticeSendDay(new Date("2026-12-10T12:00:00Z"), "Asia/Tokyo")        // "2026-12-11" (21:00, sent the next morning)
 * ```
 */
export function noticeSendDay(now: Date, zone: string): string {
  return dayIn(nextSendWindow(now, zone), zone)
}

/**
 * The server zone date of the first daily run at or after `at`.
 *
 * @example
 * ```ts
 * removalRunDay(new Date("2026-12-11T05:00:00Z"), "America/Toronto") // "2026-12-11" (00:00, the 02:17 run follows)
 * removalRunDay(new Date("2026-12-11T08:00:00Z"), "America/Toronto") // "2026-12-12" (03:00, after the run)
 * ```
 */
export function removalRunDay(at: Date, serverZone: string): string {
  const day = dayIn(at, serverZone)
  const wall = `${day}T${String(DAILY_RUN.hour).padStart(2, "0")}:${String(DAILY_RUN.minute).padStart(2, "0")}`
  return wallTimeToInstant(wall, serverZone) >= at ? day : addDays(day, 1)
}

type HandledRow = NoticeRow & { handledAt: Date }

const isActiveNotice = (row: NoticeRow): boolean => ACTIVE.has(row.status)
const isHandled = (row: NoticeRow): row is HandledRow => HANDLED.has(row.status) && row.handledAt !== null
const sameInstant = (a: Date, b: Date) => a.getTime() === b.getTime()

/** The rows of the member's current cycle. */
export function currentCycle(member: InactivityMember, rows: readonly NoticeRow[]): NoticeRow[] {
  const cycleAt = lastActiveAt(member).getTime()
  return rows.filter((row) => row.userId === member.id && row.cycleAt.getTime() === cycleAt)
}

/** A member's current cycle, as the planner and the gate read it. */
export interface CycleState {
  cycleAt: Date
  /** Every row of the cycle, in any status. */
  rows: NoticeRow[]
  /** The rows `pending`, `sending`, `sent` or `skipped`. */
  active: NoticeRow[]
  zone: string
  /** Last active time plus the threshold. */
  due: Date
  dueDay: string
  /** The start of the removal date `D`. */
  removeAfter: Date
  /** The removal date `D`, `YYYY-MM-DD` in {@link zone}. */
  day: string
}

/** The member's current cycle: its rows, its zone and its dates. */
export function cycleState(
  member: InactivityMember,
  rows: readonly NoticeRow[],
  { thresholdDays, serverZone }: { thresholdDays: number; serverZone: string }
): CycleState {
  const cycle = currentCycle(member, rows)
  const active = cycle.filter(isActiveNotice)
  const zone = cycle[0]?.zone ?? resolveZone(member, serverZone).zone
  const cycleAt = lastActiveAt(member)
  const due = new Date(cycleAt.getTime() + thresholdDays * DAY_MS)
  const dueDay = dayIn(due, zone)
  const removeAfter = active.reduce((latest, row) => (row.removeAfter > latest ? row.removeAfter : latest), startOfDay(dueDay, zone))
  return { cycleAt, rows: cycle, active, zone, due, dueDay, removeAfter, day: dayIn(removeAfter, zone) }
}

/**
 * Whether the cycle's removal date started more than {@link NOTICE_GRACE_DAYS}
 * calendar days before `now`'s date, in the cycle's zone: its warnings then
 * start again.
 */
export const graceOver = (state: CycleState, now: Date): boolean => daysBetween(state.day, dayIn(now, state.zone)) > NOTICE_GRACE_DAYS

/** The handled last warnings of the cycle, for any date. */
export const handledLastWarnings = (state: CycleState, warningDays: readonly number[]): HandledRow[] =>
  state.rows.filter(isHandled).filter((row) => row.leadDays <= warningDays[warningDays.length - 1])

/** When the first handled last warning for the cycle's removal date was handled, or null when none is. */
export function lastWarningHandledAt(state: CycleState, warningDays: readonly number[]): Date | null {
  return handledLastWarnings(state, warningDays)
    .filter((row) => sameInstant(row.removeAfter, state.removeAfter))
    .reduce<Date | null>((first, row) => (first === null || row.handledAt < first ? row.handledAt : first), null)
}

/**
 * What the removal gate holds a member back for.
 *
 * | Hold           | Why                                                                    |
 * |----------------|------------------------------------------------------------------------|
 * | `active`       | Not inactive yet                                                       |
 * | `unwarned`     | Warnings on, and the cycle has no warning yet                          |
 * | `date`         | The removal date has not started                                       |
 * | `expired`      | The removal date was more than 7 days ago: the warnings start again    |
 * | `last_warning` | The last warning for the date is not handled                           |
 * | `notice`       | The last warning was handled less than 12 hours before the run         |
 * | `idle`         | No one played on the server after the last warning                     |
 */
export type GateHold = "active" | "unwarned" | "date" | "expired" | "last_warning" | "notice" | "idle"

export interface GateContext {
  thresholdDays: number
  now: Date
  /** The newest play on the whole server: this run's read, or the newest finished run's for the preview. */
  newestPlayAt: Date | null
  /** Null while warnings are off. */
  warnings: WarningRules | null
}

/**
 * What holds `member` back from removal, or null when the sweep may remove
 * them. `rows` are the member's notice rows; only the current cycle counts.
 */
export function removalGate(member: InactivityMember, rows: readonly NoticeRow[], ctx: GateContext): GateHold | null {
  const { thresholdDays, now, newestPlayAt, warnings } = ctx
  if (!isInactive(member, thresholdDays, now)) return "active"
  if (!warnings) {
    const handled = currentCycle(member, rows).filter(isHandled)
    return handled.some((row) => row.removeAfter > now) ? "date" : null
  }
  const state = cycleState(member, rows, { thresholdDays, serverZone: warnings.serverZone })
  if (state.active.length === 0) return "unwarned"
  if (now < state.removeAfter) return "date"
  if (graceOver(state, now)) return "expired"
  const handledAt = lastWarningHandledAt(state, warnings.warningDays)
  if (!handledAt) return "last_warning"
  if (now.getTime() - handledAt.getTime() < MIN_NOTICE_MS) return "notice"
  if (!newestPlayAt || newestPlayAt <= handledAt) return "idle"
  return null
}

/**
 * Whether `value` is exactly one address: one `@` with text on both sides,
 * and no comma, angle bracket or white space (a CR or an LF included).
 *
 * @public The warning email job skips any other value as `invalid_email`.
 */
export function isSingleAddress(value: string): boolean {
  return /^[^\s@,<>]+@[^\s@,<>]+$/.test(value)
}

/**
 * Whether the stored address is one address that differs from the one this
 * run read from plex.tv for the member. A null or malformed value is not
 * checked here: the warning email job skips it with its own code.
 *
 * @example
 * ```ts
 * emailUnconfirmed("Member@Example.com", "member@example.com") // false
 * emailUnconfirmed("old@example.com", "new@example.com")       // true
 * emailUnconfirmed(null, "member@example.com")                 // false
 * ```
 */
export function emailUnconfirmed(stored: string | null, plexEmail: string | undefined): boolean {
  if (stored === null || !isSingleAddress(stored)) return false
  return stored.toLowerCase() !== plexEmail
}

/**
 * Whether a notice row's cycle is over: the member's last active time moved
 * past it, or their access ended after the row was made. The retention sweep
 * deletes only such rows, so a deletion never makes a removal sooner.
 */
export function noticeCycleClosed(
  row: { cycleAt: Date; createdAt: Date },
  user: Pick<InactivityMember, "lastSeenAt" | "createdAt" | "accessRestoredAt" | "accessEndedAt">
): boolean {
  return lastActiveAt(user).getTime() !== row.cycleAt.getTime() || (user.accessEndedAt !== null && user.accessEndedAt > row.createdAt)
}
