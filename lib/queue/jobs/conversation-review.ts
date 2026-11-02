/**
 * The `CONVERSATION_REVIEW` processor: one judge call over one admin
 * assistant conversation (spec §4, "Processor").
 *
 * ## Run
 *
 * 1. Start: the review goes from `queued` or `running` to `running`, with a
 *    new `startedAt` and `runToken + 1`. Accepting `running` lets a
 *    redelivered stalled job take the review over; every later write of the
 *    run is conditional on `{ id, status: 'running', runToken }`, so the run
 *    that lost the job, or a review marked stale, writes nothing.
 * 2. Load the messages (in stored order, each one's index its position), the
 *    owner's assistant prompt and tools as they are today, the findings
 *    already raised and the latest `done` review's `reviewedThrough`.
 * 3. Under the `judge-spend` lease: the judge cap, then the judge call (3
 *    minutes at most). `recordText` stays unset, so the usage row keeps no
 *    copy of the transcript.
 * 4. Verify the evidence, then persist (`persistReview`), with
 *    `reviewedThrough` the newest loaded message's `createdAt`.
 *
 * ## Failures
 *
 * | outcome                                | review                                      | job                  |
 * |----------------------------------------|---------------------------------------------|----------------------|
 * | `LEASE_BUSY`                           | back to `queued`                            | re-delayed 30–90 s, no attempt spent |
 * | `PROVIDER`, `ABORTED`, earlier attempt | back to `queued` with the code              | throws, BullMQ retries |
 * | `PROVIDER`, `ABORTED`, last attempt    | `failed` with the code                      | throws               |
 * | any other code                         | `failed` with the code                      | completes            |
 * | `ReviewSuperseded`                     | as the ending or the new run left it        | completes            |
 *
 * Only codes are stored or logged, never provider text, and the log lines
 * carry ids and counts, never finding or summary text.
 *
 * @module lib/queue/jobs/conversation-review
 */

import { DelayedError, type Job } from "bullmq"

import { getAdminAssistantContext } from "@/lib/chatbot/assistant"
import { buildJudgePrompt, type JudgeMessage, type PriorFinding } from "@/lib/judge/build-prompt"
import { persistReview, ReviewSuperseded } from "@/lib/judge/persist"
import { JUDGE_PROMPT_VERSION } from "@/lib/judge/prompts/v1"
import { judgeOutputSchema } from "@/lib/judge/schema"
import { checkJudgeSpend, withJudgeLease } from "@/lib/judge/spend"
import { markReviewFailed } from "@/lib/judge/stale"
import { parseToolLog } from "@/lib/judge/tool-log"
import { verifyFindings } from "@/lib/judge/verify"
import { generateStructured, type StructuredDeps } from "@/lib/llm/generate-structured"
import type { LeaseStore } from "@/lib/locks/lease-lock"
import { prisma } from "@/lib/prisma"
import { JOB_TYPES } from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("conversation-review")

const JUDGE_TIMEOUT_MS = 180_000
const REDELAY_MS = 30_000
const REDELAY_JITTER_MS = 60_000
const RETRIED_CODES = new Set(["PROVIDER", "ABORTED"])

type ReviewPayload = { reviewId: string }
/** The judge model and usage sink, and the lease store; tests swap all three. */
type ReviewDeps = { structured?: StructuredDeps; leaseStore?: LeaseStore }
type Run = { id: string; status: "running"; runToken: number }

/** Step 1, in one transaction so the read sees this start's own token. Null when the review is done, failed or gone. */
async function startRun(reviewId: string) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.conversationReview.updateMany({
      where: { id: reviewId, status: { in: ["queued", "running"] } },
      data: { status: "running", startedAt: new Date(), runToken: { increment: 1 } },
    })
    if (count === 0) return null
    return tx.conversationReview.findUnique({ where: { id: reviewId }, select: { runToken: true, conversationId: true, requestedById: true } })
  })
}

/** Step 2. Null when the conversation is gone. */
async function loadConversation(conversationId: string) {
  const [conversation, rows, findings, lastDone] = await Promise.all([
    prisma.chatConversation.findUnique({ where: { id: conversationId }, select: { userId: true, user: { select: { isAdmin: true, role: true } } } }),
    prisma.chatConversationMessage.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, role: true, content: true, toolLog: true, createdAt: true },
    }),
    prisma.conversationFinding.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" }, select: { type: true, messageId: true, claim: true, status: true } }),
    prisma.conversationReview.findFirst({ where: { conversationId, status: "done" }, orderBy: { completedAt: "desc" }, select: { reviewedThrough: true } }),
  ])
  if (!conversation) return null
  const messages: JudgeMessage[] = rows.map((row, index) => ({ ...row, index, toolLog: parseToolLog(row.toolLog) }))
  const indexOf = new Map(messages.map((message) => [message.id, message.index]))
  const prior: PriorFinding[] = findings.flatMap(({ messageId, ...finding }) => {
    const messageIndex = messageId === null ? undefined : indexOf.get(messageId)
    return messageIndex === undefined ? [] : [{ ...finding, messageIndex }]
  })
  const owner = { isAdmin: conversation.user.isAdmin, role: conversation.user.role }
  return { ownerId: conversation.userId, owner, messages, prior, previousReviewedThrough: lastDone?.reviewedThrough ?? null }
}

/** Back to `queued`, while this run still holds the review. */
async function requeue(run: Run, errorCode?: string): Promise<void> {
  await prisma.conversationReview.updateMany({ where: run, data: { status: "queued", ...(errorCode && { errorCode }) } })
}

async function judgeFailed(job: Job<ReviewPayload>, run: Run, code: string): Promise<void> {
  logger.warn("Conversation review failed", { reviewId: run.id, code, attempt: job.attemptsMade + 1 })
  if (!RETRIED_CODES.has(code)) return markReviewFailed(run.id, code, run.runToken)
  const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 3)
  await (lastAttempt ? markReviewFailed(run.id, code, run.runToken) : requeue(run, code))
  throw new Error(`Judge call failed: ${code}`)
}

/** `CONVERSATION_REVIEW`; see the module comment. The tests pass their own deps; the worker passes none. */
export async function processConversationReview(job: Job<ReviewPayload>, token?: string, deps: ReviewDeps = {}): Promise<void> {
  const { reviewId } = job.data
  const review = await startRun(reviewId)
  if (!review) {
    logger.info("Review is no longer queued or running; nothing to do", { reviewId })
    return
  }
  const run: Run = { id: reviewId, status: "running", runToken: review.runToken }
  const loaded = await loadConversation(review.conversationId)
  const newest = loaded?.messages.at(-1)
  if (!loaded || !newest) {
    logger.warn("Conversation has no messages to review", { reviewId, conversationId: review.conversationId })
    return markReviewFailed(reviewId, "JOB_FAILED", run.runToken)
  }

  const { systemPrompt, tools } = await getAdminAssistantContext(loaded.owner)
  const prompt = buildJudgePrompt({ ...loaded, systemPrompt, tools })
  const called = await withJudgeLease(
    async () => {
      const spend = await checkJudgeSpend()
      if (!spend.ok) return { ok: false as const, error: { code: spend.code } }
      return generateStructured(
        {
          purpose: "judge",
          schema: judgeOutputSchema,
          system: prompt.system,
          prompt: prompt.prompt,
          signal: AbortSignal.timeout(JUDGE_TIMEOUT_MS),
          attribution: { userId: review.requestedById ?? loaded.ownerId, conversationReviewId: reviewId, promptVersion: JUDGE_PROMPT_VERSION },
        },
        deps.structured
      )
    },
    { store: deps.leaseStore }
  )

  if (!called.ok) {
    logger.info("Judge lease is taken; re-delaying the review", { reviewId })
    await requeue(run)
    await job.moveToDelayed(Date.now() + REDELAY_MS + Math.random() * REDELAY_JITTER_MS, token)
    throw new DelayedError()
  }
  if (!called.value.ok) return judgeFailed(job, run, called.value.error.code)

  const { output, modelId } = called.value.value
  const verified = verifyFindings(output, { messages: loaded.messages, window: prompt.window, sentToolText: prompt.sentToolText, sentMessageText: prompt.sentMessageText, tools })
  if (verified.dropped > 0) logger.warn("Dropped judge findings outside the prompt's window", { reviewId, dropped: verified.dropped })
  try {
    const counts = await prisma.$transaction((tx) =>
      persistReview(tx, {
        reviewId,
        conversationId: review.conversationId,
        findings: verified.findings,
        summary: output.summary,
        model: modelId,
        promptVersion: JUDGE_PROMPT_VERSION,
        reviewedThrough: newest.createdAt,
        runToken: run.runToken,
      })
    )
    logger.info("Conversation review done", {
      reviewId,
      conversationId: review.conversationId,
      ...counts,
      dropped: verified.dropped,
      unverified: verified.unverified,
      hasToolEvidence: prompt.hasToolEvidence,
    })
  } catch (error) {
    if (!(error instanceof ReviewSuperseded)) throw error
    logger.info("Review was superseded before its results were written", { reviewId })
  }
}

/** The processor for `CONVERSATION_REVIEW`, or null for any other job type. */
export function getConversationReviewProcessor(jobType: string): typeof processConversationReview | null {
  return jobType === JOB_TYPES.CONVERSATION_REVIEW ? processConversationReview : null
}
