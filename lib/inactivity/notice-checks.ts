/**
 * The checks the warning email job (`lib/queue/jobs/inactivity-notice.ts`)
 * makes at send time, once the send window is open: whether the email must
 * be cancelled, and whether the member cannot get it. Pure, so each code has
 * its own test.
 *
 * ## Cancel codes, first match
 *
 * | Code            | When                                                                     |
 * |-----------------|--------------------------------------------------------------------------|
 * | `removal_off`   | Automatic removal is off                                                 |
 * | `warnings_off`  | Warning emails are off                                                   |
 * | `cycle_changed` | The member's last active time is not the row's cycle (a play, a return)  |
 * | `protected`     | A skip other than `not_read` protects the member; only a run reads Tautulli |
 * | `access_ended`  | The member's access ended after the row was made                         |
 * | `stale_data`    | The newest finished run stopped on stale data (`STALE_DATA_BLOCKS`) and finished after the row became pending |
 * | `superseded`    | The cycle's removal date is now later than the row's (a threshold increase) |
 * | `late`          | The send day is on or after the row's date, or a first warning goes out more than one day after the send day it was planned for |
 *
 * A cancelled row is planned again by a later run when the same lead and date
 * are due, and a late first warning gets a new date with the full lead.
 *
 * A stale run that finished before the row became pending does not cancel it.
 * Runs hold a claim, so they do not overlap, and a run plans rows only after
 * its data guards pass. So such a run came before the run that planned the
 * row. That planning run is still in progress while the jobs it enqueued
 * run, so it is not the newest finished run yet.
 *
 * ## Skip codes
 *
 * The timeline goes on for a member the app cannot email: a skipped warning
 * counts as handled, first match: `no_email`, `invalid_email` (not exactly
 * one address, `isSingleAddress`), `disabled` (an admin disabled the member)
 * and `unsubscribed` (`User.inactivityEmailsOff`).
 *
 * @module lib/inactivity/notice-checks
 */

import type { InactivityBlock } from "@/lib/inactivity/blocks"
import { cycleState, daysBetween, isSingleAddress, noticeSendDay, type NOTICE_CODES, type NoticeRow } from "@/lib/inactivity/notices"
import { inactivitySkip, lastActiveAt, type InactivityMember } from "@/lib/inactivity/rules"
import { dayKey } from "@/lib/utils/zoned-time"

type NoticeCancelCode = (typeof NOTICE_CODES.cancelled)[number]
type NoticeSkipCode = Extract<(typeof NOTICE_CODES.skipped)[number], "no_email" | "invalid_email" | "disabled" | "unsubscribed">

/** The blocks of a run that stopped on stale data: its warnings wait for a good run. */
const STALE_DATA_BLOCKS: ReadonlySet<string> = new Set<InactivityBlock>(["sync_failed", "tautulli_stale", "history_short"])

/** The row and what the job read for it. */
interface SendCheck {
  /** `updatedAt` is when the row became `pending`: planned, planned again or released for a retry. */
  notice: NoticeRow & { createdAt: Date; updatedAt: Date }
  member: InactivityMember
  /** Every notice row of the member. */
  rows: readonly NoticeRow[]
  removalEnabled: boolean
  thresholdDays: number
  warningsEnabled: boolean
  /** The leads, largest first. */
  warningDays: readonly number[]
  serverZone: string
  ownerPlexUserId: string | null
  /** The `blocked` and `finishedAt` of the newest finished run, or null when there is none. */
  newestRun: { blocked: string | null; finishedAt: Date | null } | null
  now: Date
}

/** Whether the newest finished run stopped on stale data after the row became pending. */
function staleAfterPlan(run: SendCheck["newestRun"], pendingSince: Date): boolean {
  if (!run || run.blocked === null || run.finishedAt === null) return false
  return STALE_DATA_BLOCKS.has(run.blocked) && run.finishedAt > pendingSince
}

/** Why the email must not go out now, or null when it may. See the module comment. */
export function noticeCancelCode(check: SendCheck): NoticeCancelCode | null {
  const { notice, member, now } = check
  if (!check.removalEnabled) return "removal_off"
  if (!check.warningsEnabled) return "warnings_off"
  if (lastActiveAt(member).getTime() !== notice.cycleAt.getTime()) return "cycle_changed"
  if (inactivitySkip(member, { ownerPlexUserId: check.ownerPlexUserId, readSince: null }) !== "not_read") return "protected"
  if (member.accessEndedAt && member.accessEndedAt > notice.createdAt) return "access_ended"
  if (staleAfterPlan(check.newestRun, notice.updatedAt)) return "stale_data"

  const state = cycleState(member, check.rows, { thresholdDays: check.thresholdDays, serverZone: check.serverZone })
  if (notice.removeAfter < state.removeAfter) return "superseded"

  const sendDay = noticeSendDay(now, notice.zone)
  if (daysBetween(sendDay, dayKey(notice.removeAfter.getTime(), notice.zone)) <= 0) return "late"
  const first = notice.leadDays >= check.warningDays[0]
  if (first && daysBetween(noticeSendDay(notice.updatedAt, notice.zone), sendDay) > 1) return "late"
  return null
}

/** The address the email goes to, or why the member cannot get it. */
export function noticeRecipient(user: { email: string | null; disabledAt: Date | null; inactivityEmailsOff: boolean }): { email: string } | { skip: NoticeSkipCode } {
  if (user.email === null || user.email.trim() === "") return { skip: "no_email" }
  if (!isSingleAddress(user.email)) return { skip: "invalid_email" }
  if (user.disabledAt !== null) return { skip: "disabled" }
  if (user.inactivityEmailsOff) return { skip: "unsubscribed" }
  return { email: user.email }
}
