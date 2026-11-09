/**
 * The warning email job (`INACTIVITY_NOTICE`, payload `{ noticeId }`): sends
 * one planned warning, a notice row (`InactivityNotice`), before the
 * inactivity sweep removes a member. The member activity job hands it the
 * pending rows of each run ({@link enqueueInactivityNotices}); the job id
 * holds the row id, so a second add joins the first job.
 *
 * ```
 * row not pending ─► stop
 * outside 09:00-20:00 in the row's zone ─► delay to the next 09:00 (DelayedError)
 * a cancel code (lib/inactivity/notice-checks.ts) ─► cancelled
 * no mail set-up ─► failed, no_transport (the removal waits)
 * no address, a bad one, disabled, unsubscribed ─► skipped (the timeline goes on)
 * render, then claim: pending ─► sending, attempts + 1 (no row changed: another job has it)
 * send, 60 seconds at most or until shutdown
 *   ├─ taken ─► sent
 *   ├─ the mailbox refused for good (rejected) ─► skipped, rejected
 *   ├─ any other 5xx, a refused login or certificate ─► failed, smtp_refused
 *   └─ 4xx, network, timeout ─► pending, thrown for a retry; on the last attempt failed, smtp or timeout
 * ```
 *
 * Every status change is a compare-and-set from the status the job expects,
 * so two jobs never both send one row. A failed row logs
 * `inactivity_notice.failed` at error level with its code; a later run plans
 * it again. A thrown error is `failureError`'s, the class and the reply code
 * only, so the queue's stored reason never holds an address. A temporary
 * failure or a timeout after the whole message went out may still mean the
 * server took it, so a retry can send a second copy.
 *
 * @module lib/queue/jobs/inactivity-notice
 */

import { DelayedError, type Job, type JobsOptions } from "bullmq"

import { getActiveService } from "@/lib/data/active-service"
import { getEmailConfig } from "@/lib/email/config"
import { warningStage } from "@/lib/email/templates/inactivity"
import { failureError, sendEmail, type SendResult, type SmtpFailureKind } from "@/lib/email/transport"
import { warningMessage } from "@/lib/email/warning-email"
import { readInactivityMember } from "@/lib/inactivity/members"
import { noticeCancelCode, noticeRecipient } from "@/lib/inactivity/notice-checks"
import { readNotices } from "@/lib/inactivity/notice-store"
import type { NoticeCode, NoticeStatus } from "@/lib/inactivity/notices"
import { getInactivitySettings, getInactivityWarnings } from "@/lib/inactivity/settings"
import type { NoticeEnqueuer } from "@/lib/inactivity/warn"
import { shutdownSignal } from "@/lib/instrumentation/shutdown"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { serverZone } from "@/lib/utils/server-zone"
import { nextSendWindow } from "@/lib/wrapped/notify/window"

import { addJob } from "../client"
import { JOB_TYPES, type JobPayloadMap } from "../types"

const logger = createLogger("INACTIVITY_NOTICE")

/** The longest one send may take. */
const SEND_LIMIT_MS = 60_000

/** Three attempts, the second a minute after the first: a temporary failure gets two more tries. */
const NOTICE_JOB_OPTIONS = { attempts: 3, backoff: { type: "exponential", delay: 60_000 } } satisfies Partial<JobsOptions>

type NoticeJob = Pick<Job<JobPayloadMap[typeof JOB_TYPES.INACTIVITY_NOTICE]>, "data" | "attemptsMade" | "opts" | "moveToDelayed">

/** What the job did with the row: its new status and code, or `not_pending` when another job or run had it. */
type NoticeJobResult = { status: NoticeStatus; code: NoticeCode | null } | { status: "not_pending" }

const NOT_PENDING: NoticeJobResult = { status: "not_pending" }

/** Adds one job for each pending row; the member activity job passes it to the run. */
export const enqueueInactivityNotices: NoticeEnqueuer = async (noticeIds) => {
  for (const noticeId of noticeIds) await addJob(JOB_TYPES.INACTIVITY_NOTICE, { noticeId }, NOTICE_JOB_OPTIONS)
}

type Outcome = { status: Exclude<NoticeStatus, "sending">; code: NoticeCode | null }

/** Moves the row from `from` to `outcome`, and logs it; a row another job moved first is left alone. */
async function settle(notice: { id: string; userId: string }, from: NoticeStatus, outcome: Outcome, smtpCode: number | null = null): Promise<NoticeJobResult> {
  const handled = outcome.status === "sent" || outcome.status === "skipped"
  const { count } = await prisma.inactivityNotice.updateMany({
    where: { id: notice.id, status: from },
    data: { ...outcome, ...(handled ? { handledAt: new Date() } : {}) },
  })
  if (count === 0) return NOT_PENDING
  const fields = { noticeId: notice.id, userId: notice.userId, code: outcome.code, smtpCode }
  if (outcome.status === "failed") logger.error("inactivity_notice.failed", undefined, fields)
  else logger.info(`inactivity_notice.${outcome.status}`, fields)
  return outcome
}

/** Whether a failure of this kind gets another attempt of the job, unless it was the last. */
const retryable = (kind: SmtpFailureKind) => kind === "temporary" || kind === "timeout"

/** The row's outcome after a send that gets no retry. */
function sendOutcome(sent: SendResult): Outcome {
  if (sent.ok) return { status: "sent", code: null }
  const { kind } = sent.failure
  if (kind === "rejected") return { status: "skipped", code: "rejected" }
  if (kind === "refused") return { status: "failed", code: "smtp_refused" }
  return { status: "failed", code: kind === "timeout" ? "timeout" : "smtp" }
}

/** Everything the send-time checks read, at once. */
async function readFacts(userId: string) {
  const [member, user, rows, settings, warnings, zone, plex, newestRun] = await Promise.all([
    readInactivityMember(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, disabledAt: true, inactivityEmailsOff: true } }),
    readNotices([userId]),
    getInactivitySettings(),
    getInactivityWarnings(),
    serverZone(),
    getActiveService("plex"),
    prisma.inactivityRun.findFirst({ where: { finishedAt: { not: null } }, orderBy: { startedAt: "desc" }, select: { blocked: true, finishedAt: true } }),
  ])
  return { member, user, rows, settings, warnings, zone, ownerPlexUserId: plex?.adminPlexUserId ?? null, newestRun }
}

/** Sends one warning email; see the module comment. */
async function processInactivityNotice(job: NoticeJob, token?: string): Promise<NoticeJobResult> {
  const notice = await prisma.inactivityNotice.findUnique({
    where: { id: job.data.noticeId },
    select: { id: true, userId: true, cycleAt: true, leadDays: true, removeAfter: true, status: true, attempts: true, zone: true, handledAt: true, createdAt: true, updatedAt: true },
  })
  if (notice?.status !== "pending") return NOT_PENDING

  const now = new Date()
  const sendAt = nextSendWindow(now, notice.zone)
  if (sendAt.getTime() > now.getTime()) {
    await job.moveToDelayed(sendAt.getTime(), token)
    throw new DelayedError()
  }

  const facts = await readFacts(notice.userId)
  const { member, user, settings, warnings } = facts
  if (!member || !user) return NOT_PENDING
  const cancel = noticeCancelCode({
    notice, member, rows: facts.rows, now,
    removalEnabled: settings.enabled, thresholdDays: settings.thresholdDays,
    warningsEnabled: warnings.warningsEnabled, warningDays: warnings.warningDays,
    serverZone: facts.zone, ownerPlexUserId: facts.ownerPlexUserId, newestRun: facts.newestRun,
  })
  if (cancel) return settle(notice, "pending", { status: "cancelled", code: cancel })
  const config = getEmailConfig()
  if (!config) return settle(notice, "pending", { status: "failed", code: "no_transport" })
  const recipient = noticeRecipient(user)
  if ("skip" in recipient) return settle(notice, "pending", { status: "skipped", code: recipient.skip })

  const message = await warningMessage(config, { userId: notice.userId, name: user.name, email: recipient.email }, {
    stage: warningStage(notice.leadDays, warnings.warningDays),
    thresholdDays: settings.thresholdDays,
    zone: notice.zone,
    removeAfter: notice.removeAfter,
    cycleAt: notice.cycleAt,
    now,
  })
  const claim = await prisma.inactivityNotice.updateMany({
    where: { id: notice.id, status: "pending" satisfies NoticeStatus },
    data: { status: "sending" satisfies NoticeStatus, attempts: { increment: 1 } },
  })
  if (claim.count === 0) return NOT_PENDING

  const sent = await sendEmail(config, message, AbortSignal.any([AbortSignal.timeout(SEND_LIMIT_MS), shutdownSignal]))
  const attempt = job.attemptsMade + 1
  if (!sent.ok && retryable(sent.failure.kind) && attempt < (job.opts.attempts ?? 1)) {
    const { kind, smtpCode } = sent.failure
    await prisma.inactivityNotice.updateMany({ where: { id: notice.id, status: "sending" satisfies NoticeStatus }, data: { status: "pending" satisfies NoticeStatus } })
    logger.warn("inactivity_notice.retry", { noticeId: notice.id, userId: notice.userId, kind, smtpCode, attempt })
    throw failureError(sent.failure)
  }
  return settle(notice, "sending", sendOutcome(sent), sent.ok ? sent.smtpCode : sent.failure.smtpCode)
}

/** The processor for the warning email job type, or null. */
export function getInactivityNoticeProcessor(jobType: string): ((job: NoticeJob, token?: string) => Promise<NoticeJobResult>) | null {
  return jobType === JOB_TYPES.INACTIVITY_NOTICE ? processInactivityNotice : null
}
