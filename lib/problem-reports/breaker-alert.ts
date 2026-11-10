/**
 * Queues the admins' Discord alert when fixes that replace files trip the
 * breaker (`PROBLEM_BREAKER_ALERT`, `lib/queue/jobs/problem-breaker-alert.ts`).
 * The banner on Automations > Problem reports says so whatever happens here,
 * so a queue that is down or not set up only costs the DM. Called from the
 * fix job, in a worker; it never throws.
 *
 * @module lib/problem-reports/breaker-alert
 */

import "server-only"

import { addJob } from "@/lib/queue/client"
import { isRedisConfigured } from "@/lib/queue/connection"
import { JOB_TYPES } from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("PROBLEM_BREAKER_ALERT")

/** Three attempts, the second a minute after the first, as for the report alerts. */
const ALERT_JOB_OPTIONS = { attempts: 3, backoff: { type: "exponential", delay: 60_000 } }

export async function queueBreakerAlert(trippedAt: Date): Promise<void> {
  if (!isRedisConfigured()) return
  try {
    await addJob(JOB_TYPES.PROBLEM_BREAKER_ALERT, { trippedAt: trippedAt.toISOString() }, ALERT_JOB_OPTIONS)
  } catch (error) {
    logger.error("Could not queue the breaker alert", error)
  }
}
