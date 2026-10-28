/**
 * The `REWIND_STALE_SWEEP` processor, every 10 minutes on `rewind-aux`
 * (design 9.3, P2.17).
 *
 * | Row | Condition | Outcome |
 * |---|---|---|
 * | `running` | started 15+ minutes ago, its job not live | `failed` (`WORKER_LOST`), re-enqueued once |
 * | `queued` | created 2+ minutes ago, its job gone or finished | `failed` (`JOB_LOST`) |
 * | `PlexWrapped` `generating` | untouched 15+ minutes, no queued or running generation | `failed` (`WORKER_LOST`) |
 *
 * "Once": a lost run is re-enqueued only when no newer generation exists for
 * that member and year and the run is not itself a re-enqueue (an earlier
 * row's `error.requeuedAs` names it); a hide or unhide comes back as one
 * (`copyPolicy: 'no-llm'`), and a `final-cut` run of 0.5.0 and earlier as a
 * `season` one. Every close is a compare-and-set on the
 * row's status, so a run that finishes during the sweep keeps its outcome.
 *
 * Each sweep also re-checks the season-open run's schedule (P7.8,
 * `ensureSeasonPrepareScheduled`) and the season open's audience switch
 * (P8.2, `ensureSeasonAudienceSwitchScheduled`), and removes the 1 January
 * final cut that a 0.5.0 worker's sweep adds again during a rolling deploy
 * (`cancelScheduledFinalCut`).
 *
 * @module
 */

import type { Queue } from "bullmq"

import { prisma } from "@/lib/prisma"
import { getRewindQueue } from "@/lib/queue/rewind-producers"
import { enqueueRewindGeneration, type RewindGenerationKind } from "@/lib/rewind/enqueue-generation"
import { scheduleSeasonAudienceSwitch } from "@/lib/rewind/season-open"
import { cancelScheduledFinalCut, scheduleSeasonOpenRun } from "@/lib/rewind/season-runs"
import { createLogger } from "@/lib/utils/logger"
import { toStoredError } from "@/lib/wrapped/generation-errors"

const logger = createLogger("REWIND_STALE_SWEEP")

const STALE_RUN_MS = 15 * 60 * 1000
const QUEUED_GRACE_MS = 2 * 60 * 1000
const LIVE_STATES = new Set(["active", "waiting", "delayed", "prioritized", "waiting-children"])

interface SweepResult {
  workerLost: number
  requeued: number
  jobLost: number
  abandoned: number
}

async function jobIsLive(queue: Queue, jobId: string | null): Promise<boolean> {
  const job = jobId ? await queue.getJob(jobId) : undefined
  return job ? LIVE_STATES.has(await job.getState()) : false
}

/** True when a lost run may be run again: nothing newer, and not already a re-run. */
async function mayRequeue(row: { id: string; userId: string; year: number; createdAt: Date }): Promise<boolean> {
  const [newer, recovery] = await Promise.all([
    prisma.rewindGeneration.count({
      where: { userId: row.userId, year: row.year, createdAt: { gt: row.createdAt } },
    }),
    prisma.rewindGeneration.count({ where: { error: { path: ["requeuedAs"], equals: row.id } } }),
  ])
  return newer === 0 && recovery === 0
}

/** A stored kind as this build runs it; see the module comment. */
const kindOf = (stored: string): RewindGenerationKind => (stored === "member" || stored === "admin" ? stored : "season")

function markWrappedFailed(wrappedId: string, code: "WORKER_LOST" | "JOB_LOST") {
  return prisma.plexWrapped.updateMany({
    where: { id: wrappedId, status: { not: "completed" } },
    data: { status: "failed", error: toStoredError(code) },
  })
}

/** Closes lost runs and re-enqueues each one once; see the module comment. */
export async function processRewindStaleSweep(): Promise<SweepResult> {
  const now = Date.now()
  const queue = getRewindQueue("rewind-gen")
  const result: SweepResult = { workerLost: 0, requeued: 0, jobLost: 0, abandoned: 0 }

  const running = await prisma.rewindGeneration.findMany({
    where: { status: "running", startedAt: { lt: new Date(now - STALE_RUN_MS) } },
    select: { id: true, userId: true, year: true, kind: true, copyPolicy: true, wrappedId: true, jobId: true, createdAt: true },
  })
  for (const row of running) {
    if (await jobIsLive(queue, row.jobId)) continue
    const closed = await prisma.rewindGeneration.updateMany({
      where: { id: row.id, status: "running" },
      data: { status: "failed", error: { code: "WORKER_LOST" }, finishedAt: new Date() },
    })
    if (closed.count === 0) continue
    result.workerLost++

    if (await mayRequeue(row)) {
      const { generationId } = await enqueueRewindGeneration({
        userId: row.userId,
        year: row.year,
        kind: kindOf(row.kind),
        // A lost hide or unhide comes back as one: template copy and the stored issue's window.
        ...(row.copyPolicy === "no-llm" && { exclusion: {} }),
      })
      await prisma.rewindGeneration.update({
        where: { id: row.id },
        data: { error: { code: "WORKER_LOST", requeuedAs: generationId } },
      })
      result.requeued++
    } else {
      await markWrappedFailed(row.wrappedId, "WORKER_LOST")
    }
  }

  const queued = await prisma.rewindGeneration.findMany({
    where: { status: "queued", createdAt: { lt: new Date(now - QUEUED_GRACE_MS) } },
    select: { id: true, wrappedId: true, jobId: true },
  })
  for (const row of queued) {
    if (await jobIsLive(queue, row.jobId)) continue
    const closed = await prisma.rewindGeneration.updateMany({
      where: { id: row.id, status: "queued" },
      data: { status: "failed", error: { code: "JOB_LOST" }, finishedAt: new Date() },
    })
    if (closed.count === 0) continue
    result.jobLost++
    await markWrappedFailed(row.wrappedId, "JOB_LOST")
  }

  // Rows left "generating" by the in-request generation this job replaced.
  const abandoned = await prisma.plexWrapped.updateMany({
    where: {
      status: "generating",
      updatedAt: { lt: new Date(now - STALE_RUN_MS) },
      generations: { none: { status: { in: ["queued", "running"] } } },
    },
    data: { status: "failed", error: toStoredError("WORKER_LOST") },
  })
  result.abandoned = abandoned.count

  if (result.workerLost + result.jobLost + result.abandoned > 0) logger.warn("Closed lost Rewind runs", { ...result })

  // Keeps the season-open run on the westernmost zone as members change zones (P7.8).
  await scheduleSeasonOpenRun().catch((error: unknown) => logger.error("Could not schedule the season-open Rewind run", error))
  // And the season open's 08:00 audience switch (P8.2).
  await scheduleSeasonAudienceSwitch().catch((error: unknown) => logger.error("Could not schedule the season open's audience switch", error))
  // A Rewind is final once it is generated: no 1 January final cut, whatever an older worker scheduled.
  const removed = await cancelScheduledFinalCut().catch((error: unknown) => {
    logger.error("Could not cancel the scheduled Rewind final cut", error)
    return 0
  })
  if (removed > 0) logger.info("Cancelled the 1 January Rewind final cut an earlier version scheduled", { removed })
  return result
}
