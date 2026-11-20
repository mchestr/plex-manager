/**
 * Queues the admins' Discord alert about a new problem report
 * (`lib/queue/jobs/problem-report-notify.ts`). The report is saved first and
 * the Automations badge counts it whatever happens here, so a queue that is
 * down or not set up only costs the alert.
 *
 * @module lib/problem-reports/alerts
 */

import "server-only"

import { isRedisConfigured } from "@/lib/queue/connection"
import { enqueueFromRequest } from "@/lib/queue/request-path"
import { JOB_TYPES } from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("PROBLEM_REPORT_ALERT")

/** Three attempts, the second a minute after the first. */
const ALERT_JOB_OPTIONS = { attempts: 3, backoff: { type: "exponential", delay: 60_000 } }

/** Queues the alert for a new report; never throws. */
export async function queueReportAlert(reportId: string): Promise<void> {
  if (!isRedisConfigured()) return
  const queued = await enqueueFromRequest(JOB_TYPES.PROBLEM_REPORT_NOTIFY, { reportId }, ALERT_JOB_OPTIONS)
  if (!queued.ok) logger.warn("Could not queue the problem report alert", { reportId })
}
