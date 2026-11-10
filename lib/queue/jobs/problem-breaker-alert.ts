/**
 * `PROBLEM_BREAKER_ALERT`: the admins' Discord DM when fixes that replace
 * files trip the breaker (docs/problem-reports.md, "The breaker"), queued by
 * `queueBreakerAlert` with a job id per trip, so each trip is told once.
 *
 * It is skipped once an admin has resumed fixes, while the bot is off, and
 * when no admin linked Discord: the banner on Automations > Problem reports
 * says so either way. An admin whose DMs are closed (50007) is skipped
 * without a retry; a send that reached no admin for another reason throws,
 * so the job can try again.
 *
 * @module lib/queue/jobs/problem-breaker-alert
 */

import type { Job } from "bullmq"

import { DiscordApiError, DISCORD_DMS_CLOSED, sendDiscordDirectMessage } from "@/lib/discord/api"
import { isDiscordBotEnabled } from "@/lib/discord/config"
import { getBaseUrl } from "@/lib/env"
import { shutdownSignal } from "@/lib/instrumentation/shutdown"
import { prisma } from "@/lib/prisma"
import { breakerAlertText } from "@/lib/problem-reports/notify"
import { PROBLEM_REPORT_SETTINGS_ID } from "@/lib/problem-reports/settings"
import { createLogger } from "@/lib/utils/logger"

import { JOB_TYPES, type JobPayloadMap } from "../types"

const logger = createLogger("PROBLEM_BREAKER_ALERT")

const SEND_LIMIT_MS = 60_000

type BreakerJob = Pick<Job<JobPayloadMap[typeof JOB_TYPES.PROBLEM_BREAKER_ALERT]>, "data">

type BreakerSkip = "RESUMED" | "BOT_DISABLED" | "NO_ADMINS" | "DMS_CLOSED"

/** Sends the alert; see the module comment. @internal */
export async function processProblemBreakerAlert(job: BreakerJob): Promise<{ sent: number } | { skipped: BreakerSkip }> {
  const settings = await prisma.problemReportSettings.findUnique({ where: { id: PROBLEM_REPORT_SETTINGS_ID }, select: { breakerTrippedAt: true } })
  if (!settings?.breakerTrippedAt) return { skipped: "RESUMED" }
  if (!(await isDiscordBotEnabled())) return { skipped: "BOT_DISABLED" }
  const admins = (
    await prisma.user.findMany({
      where: { isAdmin: true, disabledAt: null, discordConnection: { is: { revokedAt: null } } },
      select: { id: true, discordConnection: { select: { discordUserId: true } } },
    })
  ).flatMap((admin) => (admin.discordConnection ? [{ id: admin.id, discordUserId: admin.discordConnection.discordUserId }] : []))
  if (admins.length === 0) return { skipped: "NO_ADMINS" }

  const content = breakerAlertText(getBaseUrl())
  const signal = AbortSignal.any([AbortSignal.timeout(SEND_LIMIT_MS), shutdownSignal])
  let sent = 0
  let failure: unknown = null
  for (const admin of admins) {
    try {
      await sendDiscordDirectMessage(admin.discordUserId, content, signal)
      sent++
    } catch (error) {
      if (error instanceof DiscordApiError && error.code === DISCORD_DMS_CLOSED) continue
      logger.warn("Could not send the breaker alert", { adminId: admin.id, error: String(error) })
      failure = error
    }
  }
  if (sent === 0 && failure) throw failure
  if (sent === 0) return { skipped: "DMS_CLOSED" }
  logger.info("Sent the breaker alert", { trippedAt: job.data.trippedAt, admins: sent })
  return { sent }
}

export function getProblemBreakerAlertProcessor(jobType: string): ((job: Job) => Promise<unknown>) | null {
  return jobType === JOB_TYPES.PROBLEM_BREAKER_ALERT ? processProblemBreakerAlert : null
}
