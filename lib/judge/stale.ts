/**
 * Stuck conversation reviews (spec §4, "Stuck reviews"), and the conditional
 * write that fails a review.
 *
 * ## Dead reviews
 *
 * | status    | dead when                                                              |
 * |-----------|------------------------------------------------------------------------|
 * | `running` | `startedAt` is more than 10 minutes ago                                |
 * | `queued`  | its job is missing or `failed`, and the row is more than 2 minutes old |
 *
 * A dead review is marked `failed` with `STALE`. One attempt is at most the
 * 3-minute judge call plus its write, so a healthy run never reaches 10
 * minutes; backoff between attempts happens while the review is `queued`. The
 * 2 minutes cover the moment between a review's commit and its `addJob`.
 *
 * ## No Redis in a transaction
 *
 * {@link readQueuedJobStates} reads the job states first, outside any
 * transaction, and {@link reapStaleReviews} takes them as a map, so a slow
 * Redis never holds row locks. A `queued` review with no entry in the map
 * (one created after the read) or an `unknown` state (Redis unreachable) is
 * never reaped. Every reap is a conditional `updateMany`, so a review that
 * moved on since the read is left alone.
 *
 * @module lib/judge/stale
 */

import type { JobState } from "bullmq"

import { reviewJobId } from "@/lib/judge/job-state"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"

type ReadJobState = JobState | null | "unknown"

const RUNNING_LIMIT_MS = 10 * 60_000
const QUEUED_GRACE_MS = 2 * 60_000
const STALE = { status: "failed", errorCode: "STALE" } as const

/**
 * Fails a review. With `runToken` (the run's own failure) only that run's
 * `running` review, with `code`. Without it (an enqueue failure, the worker's
 * crash fallback) a review still `queued` or `running`, keeping a stored
 * `errorCode` and writing `code` only when none is stored.
 */
export async function markReviewFailed(reviewId: string, code: string, runToken?: number): Promise<void> {
  if (runToken !== undefined) {
    await prisma.conversationReview.updateMany({
      where: { id: reviewId, status: "running", runToken },
      data: { status: "failed", errorCode: code },
    })
    return
  }
  const pending = { id: reviewId, status: { in: ["queued" as const, "running" as const] } }
  const coded = await prisma.conversationReview.updateMany({ where: { ...pending, errorCode: null }, data: { status: "failed", errorCode: code } })
  if (coded.count > 0) return
  await prisma.conversationReview.updateMany({ where: pending, data: { status: "failed" } })
}

/**
 * The job state of each `queued` review, of one conversation or of all when
 * `conversationId` is null, keyed by review id. Call it before opening the
 * transaction that reaps.
 */
export async function readQueuedJobStates(
  conversationId: string | null,
  getJobState: (jobId: string) => Promise<ReadJobState>
): Promise<Map<string, ReadJobState>> {
  const queued = await prisma.conversationReview.findMany({
    where: { status: "queued", ...(conversationId !== null && { conversationId }) },
    select: { id: true },
  })
  return new Map(await Promise.all(queued.map(async ({ id }) => [id, await getJobState(reviewJobId(id))] as const)))
}

/** Marks the dead reviews of one conversation, or of all, `failed` with `STALE`; returns how many. Makes no Redis call. */
export async function reapStaleReviews(
  tx: PrismaTransactionClient,
  conversationId: string | null,
  { jobStates, now = new Date() }: { jobStates: Map<string, ReadJobState>; now?: Date }
): Promise<number> {
  const scope = conversationId === null ? {} : { conversationId }
  const running = await tx.conversationReview.updateMany({
    where: { ...scope, status: "running", startedAt: { lt: new Date(now.getTime() - RUNNING_LIMIT_MS) } },
    data: STALE,
  })
  let reaped = running.count
  const graceOver = new Date(now.getTime() - QUEUED_GRACE_MS)
  for (const [id, state] of jobStates) {
    if (state !== null && state !== "failed") continue
    const queued = await tx.conversationReview.updateMany({ where: { id, ...scope, status: "queued", createdAt: { lt: graceOver } }, data: STALE })
    reaped += queued.count
  }
  return reaped
}
