/**
 * The BullMQ schedules of media cleanup (TS 9.4): the nightly library read at
 * 03:07 in the server zone, which chains the run, and the hourly Plex
 * collection sync at minute 41. A copy of `ensureMemberActivitySchedule()`
 * (`lib/inactivity/schedule.ts`): it never throws, gives up after 5 s, and
 * does nothing without `REDIS_URL`.
 *
 * Both are always scheduled: with nothing to do, the processors return at
 * once. While `E2E_TEST_MODE` is `"true"` it schedules nothing, so a page in
 * an end-to-end spec never depends on the clock; specs start jobs through
 * the UI. The check reads the variable raw, as `lib/connections/connection-test.ts`
 * does, so it also holds in the E2E production build.
 *
 * Boot calls it in `startQueueWorker()`, and a save of the feature section
 * calls it again. Upserting the same scheduler ids keeps one schedule however
 * many processes start.
 *
 * @module lib/cleanup/schedule
 */

import "server-only"

import { CLEANUP_JOB_OPTIONS, COLLECTIONS_PATTERN, NIGHTLY_PATTERN } from "@/lib/cleanup/constants"
import { serverZone } from "@/lib/cleanup/settings"
import { scheduleCronJob } from "@/lib/queue/client"
import { JOB_TYPES } from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"
import { TimeoutError, withTimeout } from "@/lib/utils/with-timeout"

const logger = createLogger("CLEANUP_SCHEDULE")

/** The scheduler ids (TS 9.4). @internal */
export const CLEANUP_NIGHTLY_SCHEDULER_ID = "cleanup-nightly"
export const CLEANUP_COLLECTIONS_SCHEDULER_ID = "cleanup-collections"

const SCHEDULER_TIMEOUT_MS = 5000

export type CleanupScheduleResult = { ok: true; state: "scheduled" | "no-redis" | "e2e" } | { ok: false; code: "TIMEOUT" | "FAILED" }

/** Upserts both schedules in the server zone (`Config.timezone`, else `TZ`, else UTC). Never throws. */
export async function ensureCleanupSchedule(): Promise<CleanupScheduleResult> {
  if (!process.env.REDIS_URL) return { ok: true, state: "no-redis" }
  if (process.env.E2E_TEST_MODE === "true") return { ok: true, state: "e2e" }
  try {
    const schedule = async () => {
      const tz = await serverZone()
      await Promise.all([
        scheduleCronJob(
          CLEANUP_NIGHTLY_SCHEDULER_ID,
          JOB_TYPES.CLEANUP_READ,
          { trigger: "scheduled", chain: true },
          { pattern: NIGHTLY_PATTERN, tz },
          CLEANUP_JOB_OPTIONS
        ),
        scheduleCronJob(
          CLEANUP_COLLECTIONS_SCHEDULER_ID,
          JOB_TYPES.CLEANUP_COLLECTIONS,
          { reason: "scheduled" },
          { pattern: COLLECTIONS_PATTERN, tz },
          CLEANUP_JOB_OPTIONS
        ),
      ])
      return tz
    }
    const tz = await withTimeout(schedule(), SCHEDULER_TIMEOUT_MS, "Scheduling media cleanup")
    logger.info("Media cleanup scheduled: nightly at 03:07, collections hourly at minute 41", { tz })
    return { ok: true, state: "scheduled" }
  } catch (error) {
    const code = error instanceof TimeoutError ? "TIMEOUT" : "FAILED"
    logger.error("Could not schedule media cleanup", error, { code })
    return { ok: false, code }
  }
}
