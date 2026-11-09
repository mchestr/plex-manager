/**
 * The warning step of a member activity run: plans the warning emails that
 * are due and hands the pending ones to the warning email job. It sends
 * nothing itself, so the run's claim and an admin run's time limit never
 * wait for a mail server.
 *
 * `runSweep` calls it after the share list and before the safety limit, with
 * the members who hold a share and no skip, and only while warnings are on
 * and the caller passed an enqueuer. An inline Run now (no Redis) passes
 * none, so it never plans an email that no worker would send.
 *
 * ## Steps
 *
 * 1. Mark rows left `sending` for over an hour `failed`, code `stalled`, and
 *    log `inactivity_notice.failed` for them, as the job does for each
 *    failed row.
 * 2. Read the members' rows and plan (`planWarnings`).
 * 3. Stop when the run's signal aborted.
 * 4. Store the plans. A member whose stored address is one address that
 *    differs from their plex.tv email gets the row `skipped`, code
 *    `email_unconfirmed`, so the timeline goes on without an email. While
 *    email is not set up, such a member gets no row at all: the job fails
 *    every other member's row (`no_transport`), so every member waits for
 *    email, and none moves on without it.
 * 5. Hand every `pending` row of the members' current cycles, new or old, to
 *    the enqueuer.
 *
 * Returns the rows it planned, which the run stores as `warned`.
 *
 * @module lib/inactivity/warn
 */

import "server-only"

import { planWarnings } from "@/lib/inactivity/notice-plan"
import { failStalledNotices, pendingNoticeIds, readNotices, writeNotices, type NoticeWrite } from "@/lib/inactivity/notice-store"
import { emailConfigured } from "@/lib/email/config"
import { emailUnconfirmed, type WarningRules } from "@/lib/inactivity/notices"
import type { InactivityMember } from "@/lib/inactivity/rules"
import type { InactivitySettingsValues } from "@/lib/inactivity/settings"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("INACTIVITY_WARN")

/** Hands pending notice rows, by id, to the job that sends them; adding a row twice joins its first job. */
export type NoticeEnqueuer = (noticeIds: string[]) => Promise<void>

export interface WarningStepOptions {
  runId: string
  /** The members with a share and no skip. */
  members: readonly InactivityMember[]
  /** Members with a share of the server, for the safety limit. */
  sharedMembers: number
  settings: Pick<InactivitySettingsValues, "thresholdDays">
  warnings: WarningRules
  now: Date
  newestPlayAt: Date | null
  /** plex.tv id to the lower-case plex.tv email, from this run's share read. */
  plexEmails: ReadonlyMap<string, string>
  signal?: AbortSignal
  enqueueNotices: NoticeEnqueuer
}

/** Plans the due warnings and enqueues the pending ones. Returns the rows it planned. Throws on a database error. */
export async function runWarningStep(options: WarningStepOptions): Promise<number> {
  const { runId, members, now, signal } = options
  if (signal?.aborted) return 0
  const stalled = await failStalledNotices(now)
  if (stalled > 0) logger.error("inactivity_notice.failed", undefined, { runId, code: "stalled", count: stalled })

  const rows = await readNotices(members.map((member) => member.id))
  const byUser = Map.groupBy(rows, (row) => row.userId)
  const plans = planWarnings(
    members.map((member) => ({ member, rows: byUser.get(member.id) ?? [] })),
    { ...options.warnings, now, thresholdDays: options.settings.thresholdDays, newestPlayAt: options.newestPlayAt, sharedMembers: options.sharedMembers }
  )
  if (signal?.aborted) return 0

  const planned = new Set(plans.map((plan) => plan.userId))
  const stored = planned.size
    ? await prisma.user.findMany({ where: { id: { in: [...planned] } }, select: { id: true, email: true } })
    : []
  const emailOf = new Map(stored.map((user) => [user.id, user.email]))
  const plexIdOf = new Map(members.map((member) => [member.id, member.plexUserId?.trim() ?? ""]))
  const mailReady = emailConfigured()
  const writes = plans.flatMap((plan): NoticeWrite[] => {
    const unconfirmed = emailUnconfirmed(emailOf.get(plan.userId) ?? null, options.plexEmails.get(plexIdOf.get(plan.userId)!))
    if (unconfirmed && !mailReady) return []
    return [{ ...plan, status: unconfirmed ? "skipped" : "pending", code: unconfirmed ? "email_unconfirmed" : null }]
  })
  const warned = await writeNotices(writes, { runId, now })

  const pending = await pendingNoticeIds(members)
  if (pending.length > 0) await options.enqueueNotices(pending)
  logger.info("inactivity.warnings_planned", { runId, warned, pending: pending.length })
  return warned
}
