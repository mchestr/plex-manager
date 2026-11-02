/**
 * Queues one review of a conversation, or returns the one already open. The
 * manual `reviewConversation` action and the nightly sweep share it, each
 * with its own queue client.
 *
 * ## Process
 *
 * 1. AI features off (`Config.llmDisabled`): `LLM_DISABLED`. No active
 *    `judge` provider: `UNAVAILABLE`. Neither creates a review.
 * 2. Read the BullMQ states of the conversation's `queued` reviews, before
 *    any transaction: a slow Redis never holds row locks.
 * 3. In one transaction, first take the conversation's row lock (writing
 *    `reviewLockedAt`, as `persistReview` does), filtered on
 *    `REVIEWABLE_CONVERSATION`. A count of 0 is `NOT_FOUND` when the row is
 *    missing and `CONFLICT` when it is a Discord or ended conversation. Then
 *    reap the dead reviews, and return the open (`queued` or `running`) one
 *    or create a `queued` one.
 * 4. After commit, and only for a review it created, add the job. A queue
 *    that is down or throws fails that review with `ENQUEUE_FAILED` at once:
 *    `QUEUE_UNAVAILABLE`. A throw is logged first, with the review id and
 *    the error; the caller gets only the code.
 *
 * Under READ COMMITTED two concurrent calls would each see no open review
 * and each insert one; the row lock taken first makes the second wait and
 * then see the first one's committed review.
 *
 * @module lib/judge/enqueue
 */

import type { JobState } from "bullmq"

import { isLlmDisabled } from "@/lib/judge/guards"
import { REVIEWABLE_CONVERSATION } from "@/lib/judge/scope"
import { markReviewFailed, readQueuedJobStates, reapStaleReviews } from "@/lib/judge/stale"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("conversation-review")

type EnqueueReviewInput = { conversationId: string; trigger: "manual" | "nightly"; requestedById: string | null }

type EnqueueReviewDeps = {
  /** Adds the `judge:review` job; its id comes from `JOB_ID_POLICY`. */
  enqueue: (data: { reviewId: string }) => Promise<{ ok: true } | { ok: false; code: "QUEUE_UNAVAILABLE" }>
  getJobState: (jobId: string) => Promise<JobState | null | "unknown">
}

type OpenReview = { ok: true; reviewId: string; status: "queued" | "running"; created: boolean }
type Refused = { ok: false; code: "NOT_FOUND" | "CONFLICT" | "LLM_DISABLED" | "UNAVAILABLE" | "QUEUE_UNAVAILABLE" }

async function addJob(deps: EnqueueReviewDeps, reviewId: string): Promise<boolean> {
  try {
    return (await deps.enqueue({ reviewId })).ok
  } catch (error) {
    logger.warn("Could not add the review's job; failing the review", { reviewId, error })
    return false
  }
}

/** Queues a review of `conversationId`, or returns its open one; see the module docs. */
export async function enqueueReview(input: EnqueueReviewInput, deps: EnqueueReviewDeps): Promise<OpenReview | Refused> {
  const { conversationId } = input
  const [disabled, provider] = await Promise.all([
    isLlmDisabled(),
    prisma.lLMProvider.findFirst({ where: { isActive: true, purpose: "judge" }, select: { id: true } }),
  ])
  if (disabled) return { ok: false, code: "LLM_DISABLED" }
  if (!provider) return { ok: false, code: "UNAVAILABLE" }

  const jobStates = await readQueuedJobStates(conversationId, deps.getJobState)
  const outcome = await prisma.$transaction(async (tx): Promise<OpenReview | Refused> => {
    const locked = await tx.chatConversation.updateMany({
      where: { id: conversationId, ...REVIEWABLE_CONVERSATION },
      data: { reviewLockedAt: new Date() },
    })
    if (locked.count === 0) {
      const exists = await tx.chatConversation.findUnique({ where: { id: conversationId }, select: { id: true } })
      return { ok: false, code: exists ? "CONFLICT" : "NOT_FOUND" }
    }
    await reapStaleReviews(tx, conversationId, { jobStates })
    const open = await tx.conversationReview.findFirst({
      where: { conversationId, status: { in: ["queued", "running"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    })
    if (open) return { ok: true, reviewId: open.id, status: open.status === "running" ? "running" : "queued", created: false }
    const review = await tx.conversationReview.create({
      data: { conversationId, status: "queued", trigger: input.trigger, requestedById: input.requestedById },
      select: { id: true },
    })
    return { ok: true, reviewId: review.id, status: "queued", created: true }
  })
  if (!outcome.ok || !outcome.created) return outcome

  if (!(await addJob(deps, outcome.reviewId))) {
    await markReviewFailed(outcome.reviewId, "ENQUEUE_FAILED")
    return { ok: false, code: "QUEUE_UNAVAILABLE" }
  }
  return outcome
}
