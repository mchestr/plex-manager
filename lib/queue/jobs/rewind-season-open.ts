/**
 * The `REWIND_SEASON_OPEN` processor on `rewind-aux` (P8.2): the season
 * open's 08:00 audience switch. The rules are in `lib/rewind/season-open.ts`.
 *
 * A run that finds the season-open generation still going moves itself 10
 * minutes on (a `DelayedError`, which costs no attempt) until 12:00 on the
 * opening day. The staging rehearsal does not use this job: the script
 * switches through `openRewindToEveryone` itself.
 *
 * @module lib/queue/jobs/rewind-season-open
 */

import { DelayedError, type Job } from "bullmq"

import { prisma } from "@/lib/prisma"
import type { RewindSeasonOpenPayload } from "@/lib/queue/types"
import { rewindFeatureOn } from "@/lib/rewind/features"
import { openRewindToEveryone, seasonAudienceSwitchGivesUpAt, seasonOpenReadiness } from "@/lib/rewind/season-open"
import { SYSTEM_ACTOR } from "@/lib/session-revocation"
import { createLogger } from "@/lib/utils/logger"
import { serverZone } from "@/lib/utils/server-zone"
import { DEFAULT_SEASON } from "@/lib/wrapped/season"

const logger = createLogger("REWIND_SEASON_OPEN")

const RECHECK_MS = 10 * 60 * 1000

export type SeasonOpenOutcome =
  | { outcome: "SWITCHED"; notified: number }
  | { outcome: "ALREADY_OPEN" | "REWIND_OFF" | "NOT_ENABLED" | "STILL_GENERATING" | "NOT_PREPARED" }
  | { outcome: "FAILURES"; failed: number }

/** `REWIND_SEASON_OPEN`; see the module comment. */
export async function processRewindSeasonOpen(job: Job<RewindSeasonOpenPayload>, token?: string): Promise<SeasonOpenOutcome> {
  const { year } = job.data
  const config = await prisma.config.findUnique({
    where: { id: "config" },
    select: { rewindEnabled: true, rewindAudience: true, rewindDisabledPages: true, rewindSeasonOpens: true },
  })
  if (config?.rewindAudience === "all") return { outcome: "ALREADY_OPEN" }
  if (!config?.rewindEnabled) {
    logger.warn("Rewind is off, so the season open leaves the audience as it is", { year })
    return { outcome: "REWIND_OFF" }
  }
  if (!rewindFeatureOn(config, "season.auto-open")) {
    logger.info("The scheduled audience switch is not turned on; switch the audience in Settings", { year })
    return { outcome: "NOT_ENABLED" }
  }

  const now = Date.now()
  const readiness = await seasonOpenReadiness(year, { now })
  if (readiness.state === "running") {
    const givesUpAt = seasonAudienceSwitchGivesUpAt(year, config.rewindSeasonOpens ?? DEFAULT_SEASON.opens, await serverZone()).getTime()
    if (now + RECHECK_MS <= givesUpAt) {
      logger.info("The season-open generation is still running; checking again in 10 minutes", { year, ...readiness })
      await job.moveToDelayed(now + RECHECK_MS, token)
      throw new DelayedError()
    }
    logger.error("The season-open generation did not finish in time; switch the audience in Settings once it has", undefined, { year, ...readiness })
    return { outcome: "STILL_GENERATING" }
  }
  if (readiness.state === "not-prepared") {
    logger.warn("The season-open Prepare did not complete; check /admin/rewind, then switch the audience in Settings", { year, prepare: readiness.prepare })
    return { outcome: "NOT_PREPARED" }
  }
  if (readiness.state === "failures") {
    logger.warn("Some members' Rewinds failed; use Retry failed, then switch the audience in Settings", { year, failed: readiness.failed })
    return { outcome: "FAILURES", failed: readiness.failed }
  }

  const { switched, notified } = await openRewindToEveryone(year, SYSTEM_ACTOR)
  if (!switched) return { outcome: "ALREADY_OPEN" }
  logger.info("Rewind is open to everyone", { year, notified, triggeredBy: job.data.triggeredBy })
  return { outcome: "SWITCHED", notified }
}
