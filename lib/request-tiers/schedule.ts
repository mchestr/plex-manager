/**
 * The BullMQ schedule of the request-tier sync: daily at the admin's chosen
 * hour in the server zone. Boot and the settings save both call
 * {@link ensureRequestTierSchedule}; upserting the same scheduler id keeps one
 * schedule however many processes call it. Without `REDIS_URL` the sync runs
 * only from the admin's "Run now".
 *
 * @module lib/request-tiers/schedule
 */

import { prisma } from "@/lib/prisma"
import { removeScheduledJob, scheduleCronJob } from "@/lib/queue/client"
import { JOB_TYPES } from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"
import { TimeoutError, withTimeout } from "@/lib/utils/with-timeout"
import { normalizeTimeZone } from "@/lib/utils/zoned-time"

const logger = createLogger("REQUEST_TIERS_SCHEDULE")

const SCHEDULER_ID = "request-tier-sync"
const SCHEDULER_TIMEOUT_MS = 5000

export type RequestTierScheduleResult =
  | { ok: true; state: "scheduled" | "removed" | "no-redis" }
  | { ok: false; code: "TIMEOUT" | "FAILED" }

/** Upserts the daily job while the sync is on, and removes it while off. Never throws. */
export async function ensureRequestTierSchedule(): Promise<RequestTierScheduleResult> {
  if (!process.env.REDIS_URL) return { ok: true, state: "no-redis" }
  try {
    const config = await prisma.config.findUnique({
      where: { id: "config" },
      select: { requestTiersEnabled: true, requestTiersRunHour: true, timezone: true },
    })
    if (config?.requestTiersEnabled) {
      const tz = normalizeTimeZone(config.timezone) ?? normalizeTimeZone(process.env.TZ) ?? "UTC"
      await withTimeout(
        scheduleCronJob(
          SCHEDULER_ID,
          JOB_TYPES.REQUEST_TIER_SYNC,
          { triggeredBy: "scheduled" },
          { pattern: `0 ${config.requestTiersRunHour} * * *`, tz },
          { attempts: 1 }
        ),
        SCHEDULER_TIMEOUT_MS,
        "Scheduling the request-tier sync"
      )
      logger.info("Request-tier sync scheduled daily", { hour: config.requestTiersRunHour, tz })
      return { ok: true, state: "scheduled" }
    }
    await withTimeout(removeScheduledJob(SCHEDULER_ID), SCHEDULER_TIMEOUT_MS, "Removing the request-tier sync schedule")
    return { ok: true, state: "removed" }
  } catch (error) {
    const code = error instanceof TimeoutError ? "TIMEOUT" : "FAILED"
    logger.error("Could not update the request-tier sync schedule", { code, error })
    return { ok: false, code }
  }
}
