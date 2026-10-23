/**
 * The BullMQ schedule of the retention sweep (P11.14): daily at 03:30 in the
 * server zone. Boot calls {@link ensureRetentionSchedule} once Redis answers;
 * upserting the same scheduler id keeps one schedule however many processes
 * start. Without Redis, `lib/retention/fallback.ts` runs the sweep instead.
 *
 * @module
 */

import { prisma } from "@/lib/prisma"
import { scheduleCronJob } from "@/lib/queue/client"
import { JOB_TYPES } from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"
import { withTimeout } from "@/lib/utils/with-timeout"
import { normalizeTimeZone } from "@/lib/utils/zoned-time"

const logger = createLogger("RETENTION_SCHEDULE")

/** The scheduler id and cron pattern of the daily sweep. @internal */
export const RETENTION_SCHEDULER_ID = "retention-sweep"
/** @internal */
export const RETENTION_PATTERN = "30 3 * * *"

const SCHEDULER_TIMEOUT_MS = 5000

/** Upserts the daily sweep's scheduler in `Config.timezone` (else `TZ`, else UTC). */
export async function ensureRetentionSchedule(): Promise<void> {
  const config = await prisma.config.findUnique({ where: { id: "config" }, select: { timezone: true } })
  const tz = normalizeTimeZone(config?.timezone) ?? normalizeTimeZone(process.env.TZ) ?? "UTC"
  await withTimeout(
    scheduleCronJob(
      RETENTION_SCHEDULER_ID,
      JOB_TYPES.RETENTION_SWEEP,
      { triggeredBy: "scheduled" },
      { pattern: RETENTION_PATTERN, tz },
      { attempts: 1 }
    ),
    SCHEDULER_TIMEOUT_MS,
    "Scheduling the retention sweep"
  )
  logger.info("Retention sweep scheduled daily at 03:30", { tz })
}
