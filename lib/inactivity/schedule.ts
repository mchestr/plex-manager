/**
 * The BullMQ schedule of the daily member activity run (last seen from
 * Tautulli, then the inactivity sweep): 02:17 in the server zone. It is always
 * scheduled, because the read changes no one's access; the sweep inside does
 * nothing until an admin turns it on. Boot calls
 * {@link ensureMemberActivitySchedule} once Redis answers; upserting the same
 * scheduler id keeps one schedule however many processes start. Without
 * `REDIS_URL` the run happens only from the admin's "Run now".
 *
 * @module lib/inactivity/schedule
 */

import "server-only"

import { prisma } from "@/lib/prisma"
import { scheduleCronJob } from "@/lib/queue/client"
import { JOB_TYPES } from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"
import { TimeoutError, withTimeout } from "@/lib/utils/with-timeout"
import { normalizeTimeZone } from "@/lib/utils/zoned-time"

const logger = createLogger("INACTIVITY_SCHEDULE")

/** The scheduler id and cron pattern of the daily run. @internal */
export const MEMBER_ACTIVITY_SCHEDULER_ID = "member-activity"
/** Off the hour, so the run does not start with every job scheduled at 02:00. @internal */
export const MEMBER_ACTIVITY_PATTERN = "17 2 * * *"

const SCHEDULER_TIMEOUT_MS = 5000

export type MemberActivityScheduleResult =
  | { ok: true; state: "scheduled" | "no-redis" }
  | { ok: false; code: "TIMEOUT" | "FAILED" }

/** Upserts the daily run in `Config.timezone` (else `TZ`, else UTC). Never throws. */
export async function ensureMemberActivitySchedule(): Promise<MemberActivityScheduleResult> {
  if (!process.env.REDIS_URL) return { ok: true, state: "no-redis" }
  try {
    const config = await prisma.config.findUnique({ where: { id: "config" }, select: { timezone: true } })
    const tz = normalizeTimeZone(config?.timezone) ?? normalizeTimeZone(process.env.TZ) ?? "UTC"
    await withTimeout(
      scheduleCronJob(
        MEMBER_ACTIVITY_SCHEDULER_ID,
        JOB_TYPES.MEMBER_ACTIVITY,
        { triggeredBy: "scheduled" },
        { pattern: MEMBER_ACTIVITY_PATTERN, tz },
        { attempts: 1 }
      ),
      SCHEDULER_TIMEOUT_MS,
      "Scheduling the member activity run"
    )
    logger.info("Member activity run scheduled daily at 02:17", { tz })
    return { ok: true, state: "scheduled" }
  } catch (error) {
    const code = error instanceof TimeoutError ? "TIMEOUT" : "FAILED"
    logger.error("Could not schedule the member activity run", { code, error })
    return { ok: false, code }
  }
}
