/**
 * The season console's processors on `rewind-batch` (P7.8, design 9.1), both
 * on BullMQ's step-job pattern: the step is kept in `job.data.step`, children
 * are added with `parent`, then `moveToWaitingChildren` parks the job until
 * they finish (`WaitingChildrenError`). Child ids are fixed per parent, so a
 * retried step re-adds the same children instead of new ones.
 *
 * ```
 * REWIND_SEASON_PREPARE  aggregate ─► (wait) ─► warm batches ─► (wait) ─► generate ─► done
 *                        child REWIND_SERVER_AGGREGATE fails the parent; a warm batch that fails is ignored
 *
 * REWIND_GENERATE_ALL    fan-out ─► (wait for every REWIND_GENERATE_USER) ─► done
 * ```
 *
 * ## Fan-out
 *
 * One `REWIND_GENERATE_USER` child (`kind: 'season'`) per member: enabled,
 * with a Plex identity, admins only when the run's audience is `config` and
 * `rewindAudience` is `admins`. Members whose generation for the year is
 * queued or running are left out, and the children carry no deduplication id
 * (design 9.1); a child that finds the member's lock taken ends `skipped`.
 * `scope: 'failed'` keeps only members whose latest run failed (`WORKER_LOST`
 * and `JOB_LOST` included). The rest of eligibility (entitlement, managed
 * accounts, Tautulli identity) is each child's own check, with the payload's
 * audience.
 *
 * @module
 */

import { randomUUID } from "node:crypto"

import { WaitingChildrenError, type Job } from "bullmq"

import { prisma } from "@/lib/prisma"
import { sanitizeJobId } from "@/lib/queue/job-id"
import { getRewindQueue } from "@/lib/queue/rewind-producers"
import {
  JOB_TYPES,
  type RewindGenerateAllPayload,
  type RewindGenerateUserPayload,
  type RewindMetadataWarmPayload,
  type RewindSeasonPreparePayload,
} from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"
import { toStoredError } from "@/lib/wrapped/generation-errors"

import type { JobProcessor } from "./index"

const logger = createLogger("REWIND_SEASON_JOBS")

const RETRY = { attempts: 3, backoff: { type: "exponential", delay: 30_000 } } as const

const parentOf = (job: Job) => ({ id: job.id!, queue: job.queueQualifiedName })

/** Parks the job until its children finish; returns when there is nothing left to wait for. */
async function waitForChildren(job: Job, token: string | undefined): Promise<void> {
  if (token && (await job.moveToWaitingChildren(token))) throw new WaitingChildrenError()
}

/** The members a fan-out generates; see the module comment. */
async function fanOutMembers({ year, audience, scope }: RewindGenerateAllPayload): Promise<string[]> {
  const config = await prisma.config.findUnique({ where: { id: "config" }, select: { rewindAudience: true } })
  const adminsOnly = audience === "config" && (config?.rewindAudience ?? "admins") !== "all"
  const members = await prisma.user.findMany({
    where: {
      disabledAt: null,
      plexUserId: { not: null },
      ...(adminsOnly && { isAdmin: true }),
      rewindGenerations: { none: { year, status: { in: ["queued", "running"] } } },
    },
    select: { id: true },
  })
  if (scope === "all") return members.map((m) => m.id)

  const latest = await prisma.rewindGeneration.findMany({
    where: { year, userId: { in: members.map((m) => m.id) }, status: { not: "skipped" } },
    distinct: ["userId"],
    orderBy: [{ userId: "asc" }, { createdAt: "desc" }],
    select: { userId: true, status: true },
  })
  return latest.filter((row) => row.status === "failed").map((row) => row.userId)
}

/**
 * Creates each member's `PlexWrapped` (when missing) and a queued `season`
 * generation, then adds the children. A Rewind that has not completed shows
 * "generating"; a completed one keeps its data and links (FR-40).
 */
async function fanOut(job: Job<RewindGenerateAllPayload>): Promise<number> {
  const { year, audience, through } = job.data
  const userIds = await fanOutMembers(job.data)
  if (userIds.length === 0) return 0

  await prisma.plexWrapped.createMany({
    data: userIds.map((userId) => ({ userId, year, status: "pending", data: "{}" })),
    skipDuplicates: true,
  })
  const wrapped = await prisma.plexWrapped.findMany({ where: { year, userId: { in: userIds } }, select: { id: true, userId: true } })
  const runs = wrapped.map((w) => ({ id: randomUUID(), wrappedId: w.id, userId: w.userId }))
  await prisma.rewindGeneration.createMany({
    data: runs.map((run) => ({ ...run, year, kind: "season", status: "queued", jobId: run.id })),
  })
  const wrappedIds = runs.map((run) => run.wrappedId)
  await prisma.plexWrapped.updateMany({
    where: { id: { in: wrappedIds }, status: { not: "completed" } },
    data: { status: "generating", error: null },
  })

  try {
    await getRewindQueue("rewind-gen").addBulk(
      runs.map((run) => ({
        name: JOB_TYPES.REWIND_GENERATE_USER,
        data: { generationId: run.id, userId: run.userId, year, audience, through } satisfies RewindGenerateUserPayload,
        opts: { ...RETRY, jobId: run.id, parent: parentOf(job), ignoreDependencyOnFailure: true },
      }))
    )
  } catch (error) {
    await prisma.rewindGeneration.updateMany({
      where: { id: { in: runs.map((run) => run.id) }, status: "queued" },
      data: { status: "failed", error: { code: "JOB_LOST" }, finishedAt: new Date() },
    })
    await prisma.plexWrapped.updateMany({
      where: { id: { in: wrappedIds }, status: { not: "completed" } },
      data: { status: "failed", error: toStoredError("JOB_LOST") },
    })
    throw error
  }
  return runs.length
}

/** `REWIND_GENERATE_ALL`: fans out, then waits for every child; see the module comment. */
export async function processRewindGenerateAll(job: Job<RewindGenerateAllPayload>, token?: string) {
  if ((job.data.step ?? "fan-out") === "fan-out") {
    const queued = await fanOut(job)
    logger.info("Rewind fan-out queued", { year: job.data.year, scope: job.data.scope, audience: job.data.audience, queued })
    await job.updateData({ ...job.data, step: "done" })
  }
  await waitForChildren(job, token)
  return { year: job.data.year, scope: job.data.scope, audience: job.data.audience }
}

/** The warm batches the aggregate child handed back. */
async function warmBatches(job: Job): Promise<RewindMetadataWarmPayload[]> {
  const values = await job.getChildrenValues<{ warmBatches?: RewindMetadataWarmPayload[] }>()
  return Object.values(values).flatMap((value) => value?.warmBatches ?? [])
}

/** `REWIND_SEASON_PREPARE`: the aggregate, then the warm batches, then `REWIND_GENERATE_ALL`. */
export async function processRewindSeasonPrepare(job: Job<RewindSeasonPreparePayload>, token?: string) {
  const { year, through, audience } = job.data
  const queue = getRewindQueue("rewind-batch")
  const childId = (suffix: string) => sanitizeJobId(`${job.id}:${suffix}`)
  let step = job.data.step ?? "aggregate"

  if (step === "aggregate") {
    await queue.add(
      JOB_TYPES.REWIND_SERVER_AGGREGATE,
      { year, through, warm: "return" },
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
    const data: RewindGenerateAllPayload = { year, through, audience, scope: "all" }
    await queue.add(JOB_TYPES.REWIND_GENERATE_ALL, data, { ...RETRY, jobId: childId("generate-all") })
    await job.updateData({ ...job.data, step: "done" })
  }
  return { year, through, audience }
}

/** The season console's processors by job name, for `rewind-queues.ts`. */
export const REWIND_SEASON_PROCESSORS: Record<string, JobProcessor> = {
  [JOB_TYPES.REWIND_SEASON_PREPARE]: (job, token) => processRewindSeasonPrepare(job as Job<RewindSeasonPreparePayload>, token),
  [JOB_TYPES.REWIND_GENERATE_ALL]: (job, token) => processRewindGenerateAll(job as Job<RewindGenerateAllPayload>, token),
}
