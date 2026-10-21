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
 * row's `error.requeuedAs` names it). Every close is a compare-and-set on the
 * row's status, so a run that finishes during the sweep keeps its outcome.
 *
 * Each sweep also re-checks the season-open run's schedule (P7.8,
 * `ensureSeasonPrepareScheduled`).
 *
 * @module
 */

import type { Queue } from "bullmq"

import { prisma } from "@/lib/prisma"
import { getRewindQueue } from "@/lib/queue/rewind-producers"
import { enqueueRewindGeneration, type RewindGenerationKind } from "@/lib/rewind/enqueue-generation"
import { scheduleSeasonOpenRun } from "@/lib/rewind/season-runs"
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
    select: { id: true, userId: true, year: true, kind: true, wrappedId: true, jobId: true, createdAt: true },
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
        kind: row.kind as RewindGenerationKind,
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
  return result
}
