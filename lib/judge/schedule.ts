/**
 * The BullMQ schedule of the nightly conversation review sweep: daily at
 * 03:17 in the server zone while `judgeNightlyEnabled` is on. Worker start
 * and the settings save both call {@link ensureJudgeSchedule}; upserting the
 * same scheduler id keeps one schedule however many processes call it.
 * Without `REDIS_URL` there is no sweep, only manual reviews.
 *
 * @module lib/judge/schedule
 */

import { prisma } from "@/lib/prisma"
import { removeScheduledJob, scheduleCronJob } from "@/lib/queue/client"
import { JOB_TYPES } from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"
import { TimeoutError, withTimeout } from "@/lib/utils/with-timeout"
import { normalizeTimeZone } from "@/lib/utils/zoned-time"

const logger = createLogger("JUDGE_SCHEDULE")

const SCHEDULER_ID = "judge-review-sweep"
const SCHEDULER_TIMEOUT_MS = 5000
const PATTERN = "17 3 * * *"

type JudgeScheduleResult = { ok: true; state: "scheduled" | "removed" | "no-redis" } | { ok: false; code: "TIMEOUT" | "FAILED" }

/** Upserts the nightly sweep while it is on, and removes it while off. Never throws. */
export async function ensureJudgeSchedule(): Promise<JudgeScheduleResult> {
  if (!process.env.REDIS_URL) return { ok: true, state: "no-redis" }
  try {
    const config = await prisma.config.findUnique({
      where: { id: "config" },
      select: { judgeNightlyEnabled: true, timezone: true },
    })
    if (config?.judgeNightlyEnabled) {
      const tz = normalizeTimeZone(config.timezone) ?? normalizeTimeZone(process.env.TZ) ?? "UTC"
      await withTimeout(
        scheduleCronJob(SCHEDULER_ID, JOB_TYPES.CONVERSATION_REVIEW_SWEEP, { triggeredBy: "scheduled" }, { pattern: PATTERN, tz }, { attempts: 1 }),
        SCHEDULER_TIMEOUT_MS,
        "Scheduling the conversation review sweep"
      )
      logger.info("Conversation review sweep scheduled nightly", { tz })
      return { ok: true, state: "scheduled" }
    }
    await withTimeout(removeScheduledJob(SCHEDULER_ID), SCHEDULER_TIMEOUT_MS, "Removing the conversation review sweep schedule")
    return { ok: true, state: "removed" }
  } catch (error) {
    const code = error instanceof TimeoutError ? "TIMEOUT" : "FAILED"
    logger.error("Could not update the conversation review sweep schedule", { code, error })
    return { ok: false, code }
  }
}
