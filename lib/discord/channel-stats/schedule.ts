/**
 * The BullMQ schedule of the Discord stat channels job, kept in step with
 * `Config`: boot and the settings save both call {@link ensureChannelStatsSchedule},
 * so a switch or interval change applies without a restart. Without
 * `REDIS_URL` there is no queue and the job does not run.
 *
 * @module lib/discord/channel-stats/schedule
 */

import { MIN_INTERVAL_MINUTES } from "@/lib/discord/channel-stats/config"
import { prisma } from "@/lib/prisma"
import { removeScheduledJob, scheduleRepeatingJob } from "@/lib/queue/client"
import { JOB_TYPES } from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"
import { TimeoutError, withTimeout } from "@/lib/utils/with-timeout"

const logger = createLogger("CHANNEL_STATS_SCHEDULE")

const SCHEDULER_ID = "discord-channel-stats"
const SCHEDULER_TIMEOUT_MS = 5000

export type ChannelStatsScheduleResult =
  | { ok: true; state: "scheduled" | "removed" | "no-redis" }
  | { ok: false; code: "TIMEOUT" | "FAILED" }

/** Upserts the repeating job while the job is on, and removes it while off. Never throws. */
export async function ensureChannelStatsSchedule(): Promise<ChannelStatsScheduleResult> {
  if (!process.env.REDIS_URL) return { ok: true, state: "no-redis" }
  try {
    const config = await prisma.config.findUnique({
      where: { id: "config" },
      select: { discordStatsEnabled: true, discordStatsIntervalMinutes: true },
    })
    if (config?.discordStatsEnabled) {
      const minutes = Math.max(MIN_INTERVAL_MINUTES, config.discordStatsIntervalMinutes)
      await withTimeout(
        scheduleRepeatingJob(SCHEDULER_ID, JOB_TYPES.DISCORD_CHANNEL_STATS, { triggeredBy: "scheduled" }, minutes * 60_000, { attempts: 1 }),
        SCHEDULER_TIMEOUT_MS,
        "Scheduling the Discord channel stats"
      )
      logger.info(`Discord channel stats scheduled every ${minutes} minutes`)
      return { ok: true, state: "scheduled" }
    }
    await withTimeout(removeScheduledJob(SCHEDULER_ID), SCHEDULER_TIMEOUT_MS, "Removing the Discord channel stats schedule")
    return { ok: true, state: "removed" }
  } catch (error) {
    const code = error instanceof TimeoutError ? "TIMEOUT" : "FAILED"
    logger.error("Could not update the Discord channel stats schedule", { code, error })
    return { ok: false, code }
  }
}
