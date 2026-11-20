/**
 * The admins' Discord alert about problem reports: `PROBLEM_REPORT_NOTIFY`
 * on the main queue, payload `{ reportId }` (docs/problem-reports.md).
 *
 * ```
 * a new report ─ queueReportAlert ─► PROBLEM_REPORT_NOTIFY { reportId }, dedup problem-report:notify:{reportId}
 *   ├─ not with the server admin, or alerted already ─► skipped
 *   ├─ the bot is off, or no admin linked Discord ─► skipped (the Automations badge still counts it)
 *   ├─ one serializable transaction, for the report's member:
 *   │    their last alert less than an hour ago ─► delays itself to an hour after it (DelayedError)
 *   │    else claims every report of theirs with the server admin and no alert (alertedAt null → now)
 *   │         nothing to claim ─► another job sent it
 *   └─ one text DM per linked admin listing what it claimed
 *        closed DMs (50007) ─► that admin is skipped, never retried
 * ```
 *
 * So a member's reports reach the admins at most once an hour: the first at
 * once, and the ones in the next hour together when it ends. Everything that
 * reads the database or the environment runs before the claim, so only the
 * text and the sends follow it. A send that fails for every admin, other
 * than 50007, releases the claim and throws, so one of the three attempts can
 * retry it; a send that reached one admin keeps the claim, so no admin is
 * told twice, and an admin whose DM failed then is not told. A worker that
 * stops between the claim and the sends loses that alert; the Automations
 * badge still counts the reports.
 *
 * @module lib/queue/jobs/problem-report-notify
 */

import { DelayedError, type Job } from "bullmq"

import { inSerializable } from "@/lib/db/serializable"
import { DiscordApiError, DISCORD_DMS_CLOSED, sendDiscordDirectMessage } from "@/lib/discord/api"
import { isDiscordBotEnabled } from "@/lib/discord/config"
import { getBaseUrl } from "@/lib/env"
import { shutdownSignal } from "@/lib/instrumentation/shutdown"
import { prisma } from "@/lib/prisma"
import { adminAlertText } from "@/lib/problem-reports/notify"
import { reportTitle } from "@/lib/problem-reports/title"
import { createLogger } from "@/lib/utils/logger"

import { JOB_TYPES, type JobPayloadMap } from "../types"

const logger = createLogger("PROBLEM_REPORT_NOTIFY")

/** The least time between two alerts about one member's reports. */
const ALERT_GAP_MS = 60 * 60 * 1000
const SEND_LIMIT_MS = 60_000

type NotifyJob = Pick<Job<JobPayloadMap[typeof JOB_TYPES.PROBLEM_REPORT_NOTIFY]>, "data" | "moveToDelayed">

type NotifySkip = "NOT_WITH_ADMIN" | "ALREADY_SENT" | "BOT_DISABLED" | "NO_ADMINS" | "DMS_CLOSED"

type ReportAlertResult = { sent: number } | { skipped: NotifySkip }

function skipped(reportId: string, reason: NotifySkip): ReportAlertResult {
  logger.info("Skipped a problem report alert", { reportId, reason })
  return { skipped: reason }
}

const CLAIMED_SELECT = { id: true, problem: true, title: true, year: true, showTitle: true, seasonNumber: true, episodeNumber: true } as const

type Claim =
  | { waitUntil: number }
  | { reports: { id: string; problem: string; title: string; year: number | null; showTitle: string | null; seasonNumber: number | null; episodeNumber: number | null }[] }

/** The member's reports to alert about now, or when the next alert may go out. */
async function claimReports(reporterId: string, now: Date): Promise<Claim> {
  return inSerializable(async (tx): Promise<Claim> => {
    const last = await tx.problemReport.findFirst({
      where: { reporterId, alertedAt: { not: null } },
      orderBy: { alertedAt: "desc" },
      select: { alertedAt: true },
    })
    if (last?.alertedAt && now.getTime() - last.alertedAt.getTime() < ALERT_GAP_MS) return { waitUntil: last.alertedAt.getTime() + ALERT_GAP_MS }
    const reports = await tx.problemReport.findMany({
      where: { reporterId, status: "WITH_ADMIN", alertedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: CLAIMED_SELECT,
    })
    if (reports.length > 0) await tx.problemReport.updateMany({ where: { id: { in: reports.map((report) => report.id) }, alertedAt: null }, data: { alertedAt: now } })
    return { reports }
  })
}

/** Sends one alert; see the module comment. @internal */
export async function processProblemReportNotify(job: NotifyJob, token?: string): Promise<ReportAlertResult> {
  const { reportId } = job.data
  const report = await prisma.problemReport.findUnique({ where: { id: reportId }, select: { status: true, alertedAt: true, reporterId: true } })
  if (!report || report.status !== "WITH_ADMIN") return skipped(reportId, "NOT_WITH_ADMIN")
  if (report.alertedAt) return skipped(reportId, "ALREADY_SENT")
  if (!(await isDiscordBotEnabled())) return skipped(reportId, "BOT_DISABLED")
  const admins = (
    await prisma.user.findMany({
      where: { isAdmin: true, disabledAt: null, discordConnection: { is: { revokedAt: null } } },
      select: { id: true, discordConnection: { select: { discordUserId: true } } },
    })
  ).flatMap((admin) => (admin.discordConnection ? [{ id: admin.id, discordUserId: admin.discordConnection.discordUserId }] : []))
  if (admins.length === 0) return skipped(reportId, "NO_ADMINS")
  // Before the claim: a claim that a throw leaves behind would make every retry skip as ALREADY_SENT
  const reporter = await prisma.user.findUnique({ where: { id: report.reporterId }, select: { name: true } })
  const baseUrl = getBaseUrl()

  const now = new Date()
  const claim = await claimReports(report.reporterId, now)
  if ("waitUntil" in claim) {
    await job.moveToDelayed(claim.waitUntil, token)
    throw new DelayedError()
  }
  if (claim.reports.length === 0) return skipped(reportId, "ALREADY_SENT")
  const ids = claim.reports.map((claimed) => claimed.id)

  const content = adminAlertText(
    reporter?.name ?? null,
    claim.reports.map((claimed) => ({ id: claimed.id, title: reportTitle(claimed), problem: claimed.problem })),
    baseUrl
  )
  const signal = AbortSignal.any([AbortSignal.timeout(SEND_LIMIT_MS), shutdownSignal])
  let sent = 0
  let failure: unknown = null
  for (const admin of admins) {
    try {
      await sendDiscordDirectMessage(admin.discordUserId, content, signal)
      sent++
    } catch (error) {
      if (error instanceof DiscordApiError && error.code === DISCORD_DMS_CLOSED) {
        logger.info("An admin's Discord DMs are closed; not retrying", { reportId, adminId: admin.id })
        continue
      }
      logger.warn("Could not send a problem report alert", { reportId, adminId: admin.id, error: String(error) })
      failure = error
    }
  }

  if (sent === 0 && failure) {
    await prisma.problemReport.updateMany({ where: { id: { in: ids }, alertedAt: now }, data: { alertedAt: null } })
    throw failure
  }
  if (sent === 0) return skipped(reportId, "DMS_CLOSED")
  logger.info("Sent the problem report alert", { reportId, reports: ids.length, admins: sent })
  return { sent }
}

export function getProblemReportNotifyProcessor(jobType: string): ((job: Job, token?: string) => Promise<unknown>) | null {
  return jobType === JOB_TYPES.PROBLEM_REPORT_NOTIFY ? processProblemReportNotify : null
}
