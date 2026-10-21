/**
 * The `REWIND_FINAL_CUT` processor on `rewind-batch` (P8.5, design 7.1 and
 * 9.6), on the season console's step pattern (`rewind-season.ts`).
 *
 * ```
 * refused before 00:30 on 1 January in the westernmost zone
 *   (an early `through` only on staging, REWIND_STAGING=1)
 * aggregate ─► (wait) ─► warm batches ─► (wait) ─► REWIND_GENERATE_ALL kind final-cut ─► done
 *   REWIND_SERVER_AGGREGATE     the full year, with archetype counts and medians
 *   REWIND_METADATA_WARM        the titles not warm yet: in practice those first watched in December
 *   REWIND_GENERATE_ALL         dedup rewind:all:{year}:final-cut; one child per member,
 *                               copyPolicy 'changed-slots' and the full-year window
 * ```
 *
 * Deduplicated on `rewind:final:{year}` and never retried: a failed final cut
 * is started again, and the fan-out leaves out the members it already
 * finished, so a re-run is a no-op for them. Each child's write keeps the
 * season issue in `previousData`, sets `finalCutAt` and `dataThrough`, and
 * prewarms the cards for the new `factsHash` (the completion hooks).
 *
 * @module lib/queue/jobs/rewind-final-cut
 */

import { UnrecoverableError, type Job } from "bullmq"

import { getEnv } from "@/lib/env"
import { sanitizeJobId } from "@/lib/queue/job-id"
import { getRewindQueue } from "@/lib/queue/rewind-producers"
import { JOB_TYPES, type RewindFinalCutPayload, type RewindGenerateAllPayload } from "@/lib/queue/types"
import { finalCutOpensAt, seasonZones } from "@/lib/rewind/season-runs"
import { createLogger } from "@/lib/utils/logger"
import { isFinalCut } from "@/lib/wrapped/aggregate/window"

import { parentOf, RETRY, waitForChildren, warmBatches } from "./rewind-season"

const logger = createLogger("REWIND_FINAL_CUT")

export type FinalCutRefusal = "NOT_YET" | "EARLY_THROUGH"

/** Whether this server is the staging copy, the only place an early `through` may run. */
export const isRewindStaging = () => getEnv().REWIND_STAGING === "1"

/**
 * Why the final cut may not run now, or null: before {@link finalCutOpensAt}
 * for a 31 December `through`; anywhere but staging for an earlier one.
 */
export function finalCutRefusal(
  { year, through }: Pick<RewindFinalCutPayload, "year" | "through">,
  { now, opensAt, staging }: { now: number; opensAt: Date; staging: boolean }
): FinalCutRefusal | null {
  if (!isFinalCut(year, through)) return staging ? null : "EARLY_THROUGH"
  return now < opensAt.getTime() ? "NOT_YET" : null
}

/** `REWIND_FINAL_CUT`; see the module comment. */
export async function processRewindFinalCut(job: Job<RewindFinalCutPayload>, token?: string) {
  const { year, through } = job.data
  const queue = getRewindQueue("rewind-batch")
  const childId = (suffix: string) => sanitizeJobId(`${job.id}:${suffix}`)
  let step = job.data.step ?? "aggregate"

  if (step === "aggregate") {
    const refusal = finalCutRefusal(job.data, { now: Date.now(), opensAt: finalCutOpensAt(year, await seasonZones()), staging: isRewindStaging() })
    if (refusal) {
      logger.warn("Final cut refused", { year, through, refusal })
      throw new UnrecoverableError(refusal)
    }
    await queue.add(
      JOB_TYPES.REWIND_SERVER_AGGREGATE,
      { year, through, warm: "return", finalCut: true },
      { ...RETRY, jobId: childId("aggregate"), parent: parentOf(job), failParentOnFailure: true }
    )
    step = "warm"
    await job.updateData({ ...job.data, step })
    await waitForChildren(job, token)
  }

  if (step === "warm") {
    const batches = await warmBatches(job)
    await queue.addBulk(
      batches.map((batch) => ({
        name: JOB_TYPES.REWIND_METADATA_WARM,
        data: batch,
        opts: { ...RETRY, jobId: childId(`warm:${batch.batch}`), parent: parentOf(job), ignoreDependencyOnFailure: true },
      }))
    )
    step = "generate"
    await job.updateData({ ...job.data, step })
    await waitForChildren(job, token)
  }

  if (step === "generate") {
    const data: RewindGenerateAllPayload = { year, through, audience: "all", scope: "all", kind: "final-cut", finalCut: true }
    await queue.add(JOB_TYPES.REWIND_GENERATE_ALL, data, {
      ...RETRY,
      jobId: childId("generate-all"),
      deduplication: { id: `rewind:all:${year}:final-cut` },
    })
    await job.updateData({ ...job.data, step: "done" })
    logger.info("Final cut fan-out queued", { year, through, triggeredBy: job.data.triggeredBy })
  }
  return { year, through }
}
