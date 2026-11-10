/**
 * `PROBLEM_REPORT_UPDATE`: one member's DM when a report they made or follow
 * is fixed or closed (docs/problem-reports.md), queued by
 * `queueMemberUpdates` with a job id per member and state, so each change
 * is told once.
 *
 * It goes out between 09:00 and 20:00 in the member's zone (the server's when
 * they have none), and the job delays itself until then. It is skipped when
 * the report has changed again, the bot is off, or the member has no linked
 * Discord; closed DMs (50007) are not retried.
 *
 * @module lib/queue/jobs/problem-report-update
 */

import { DelayedError, type Job } from "bullmq"

import { DiscordApiError, DISCORD_DMS_CLOSED, sendDiscordDirectMessage } from "@/lib/discord/api"
import { isDiscordBotEnabled } from "@/lib/discord/config"
import { getBaseUrl } from "@/lib/env"
import { shutdownSignal } from "@/lib/instrumentation/shutdown"
import { prisma } from "@/lib/prisma"
import { memberUpdateText, type MemberUpdate } from "@/lib/problem-reports/notify"
import { reportTitle } from "@/lib/problem-reports/title"
import { serverZone } from "@/lib/utils/server-zone"
import { closedEventDataSchema, fixedEventDataSchema } from "@/lib/validations/problem-reports"
import { nextSendWindow } from "@/lib/wrapped/notify/window"
import { resolveZone } from "@/lib/wrapped/time/zone"

import { JOB_TYPES, type JobPayloadMap } from "../types"

const SEND_LIMIT_MS = 60_000

type UpdateJob = Pick<Job<JobPayloadMap[typeof JOB_TYPES.PROBLEM_REPORT_UPDATE]>, "data" | "moveToDelayed">

type UpdateSkip = "CHANGED" | "BOT_DISABLED" | "NOT_LINKED" | "DMS_CLOSED"

/** Who ended the report, from its last FIXED or CLOSED event. */
function endedBy(event: { kind: string; data: unknown } | undefined): MemberUpdate["by"] {
  if (event?.kind === "FIXED") return fixedEventDataSchema.safeParse(event.data).data?.reason === "fix" ? "fix" : "admin"
  return closedEventDataSchema.safeParse(event?.data).data?.reason === "cancelled" ? "reporter" : "admin"
}

/** Sends one member's update; see the module comment. @internal */
export async function processProblemReportUpdate(job: UpdateJob, token?: string): Promise<{ sent: true } | { skipped: UpdateSkip }> {
  const { reportId, userId, status } = job.data
  const report = await prisma.problemReport.findUnique({
    where: { id: reportId },
    select: {
      status: true, reporterId: true, memberNote: true, title: true, year: true, showTitle: true, seasonNumber: true, episodeNumber: true,
      events: { where: { kind: { in: ["FIXED", "CLOSED"] } }, orderBy: { createdAt: "desc" }, take: 1, select: { kind: true, data: true } },
    },
  })
  if (!report || report.status !== status) return { skipped: "CHANGED" }
  if (!(await isDiscordBotEnabled())) return { skipped: "BOT_DISABLED" }
  const member = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true, disabledAt: true, discordConnection: { select: { discordUserId: true, revokedAt: true } } },
  })
  const discord = member?.discordConnection
  if (!member || member.disabledAt || !discord || discord.revokedAt) return { skipped: "NOT_LINKED" }

  const now = new Date()
  const sendAt = nextSendWindow(now, resolveZone(member, await serverZone()).zone)
  if (sendAt.getTime() > now.getTime()) {
    await job.moveToDelayed(sendAt.getTime(), token)
    throw new DelayedError()
  }

  const own = report.reporterId === userId
  const text = memberUpdateText({ own, status, by: endedBy(report.events[0]), title: reportTitle(report), hasNote: report.memberNote !== null }, getBaseUrl())
  try {
    await sendDiscordDirectMessage(discord.discordUserId, text, AbortSignal.any([AbortSignal.timeout(SEND_LIMIT_MS), shutdownSignal]))
  } catch (error) {
    if (error instanceof DiscordApiError && error.code === DISCORD_DMS_CLOSED) return { skipped: "DMS_CLOSED" }
    throw error
  }
  return { sent: true }
}

export function getProblemReportUpdateProcessor(jobType: string): ((job: Job, token?: string) => Promise<unknown>) | null {
  return jobType === JOB_TYPES.PROBLEM_REPORT_UPDATE ? processProblemReportUpdate : null
}
