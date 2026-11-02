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
 * ## The status poll
 *
 * The conversation page polls a pending review's status, and a dead one
 * would keep it waiting. {@link reapIfStuck} lets the poll reap: only when
 * the latest review is past its limit, after reading the job states, and in
 * a short transaction that takes the conversation's row lock first, the
 * order `enqueueReview` and `persistReview` keep.
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

type LatestReview = { status: string; startedAt: Date | null; createdAt: Date }

/**
 * Reaps a conversation's dead reviews when its latest one is past its limit
 * (running for over 10 minutes, or queued for over 2 with its job missing or
 * failed). Reads the job states before any transaction and opens one only
 * when there is something to reap. True when it reaped.
 */
export async function reapIfStuck(
  conversationId: string,
  latest: LatestReview,
  getJobState: (jobId: string) => Promise<ReadJobState>,
  now = new Date()
): Promise<boolean> {
  const age = (since: Date | null) => (since === null ? 0 : now.getTime() - since.getTime())
  const runningOver = latest.status === "running" && age(latest.startedAt) > RUNNING_LIMIT_MS
  const queuedOver = latest.status === "queued" && age(latest.createdAt) > QUEUED_GRACE_MS
  if (!runningOver && !queuedOver) return false
  const jobStates = queuedOver ? await readQueuedJobStates(conversationId, getJobState) : new Map<string, ReadJobState>()
  if (!runningOver && ![...jobStates.values()].some((state) => state === null || state === "failed")) return false
  const reaped = await prisma.$transaction(async (tx) => {
    await tx.chatConversation.updateMany({ where: { id: conversationId }, data: { reviewLockedAt: now } })
    return reapStaleReviews(tx, conversationId, { jobStates, now })
  })
  return reaped > 0
}
