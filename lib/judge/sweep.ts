/**
 * The nightly conversation review sweep (spec §4, "Nightly sweep"), the
 * `CONVERSATION_REVIEW_SWEEP` job that `lib/judge/schedule.ts` schedules.
 *
 * ## Selection
 *
 * {@link selectSweepCandidates} pages through `REVIEWABLE_CONVERSATION`
 * conversations whose `lastMessageAt` is at or before the sweep's start,
 * oldest first, 200 at a time, and keeps one when:
 *
 * 1. it has at least `minTurns` user messages (tool calls happen inside
 *    assistant turns and never count);
 * 2. its `lastMessageAt` is after its latest `done` review's
 *    `reviewedThrough`, or it has no `done` review;
 * 3. it is {@link inSample} at `sampleRate`;
 * 4. it is not parked by repeated failures (below).
 *
 * It stops at 50 kept, so the limit counts after the sample and the skip and
 * a run of sampled-out or parked conversations never starves newer ones.
 *
 * ## Failure skip
 *
 * A conversation is parked while its three most recent `nightly` reviews by
 * `createdAt` all `failed` with a code that says something about the
 * conversation (`SCHEMA`, `TRUNCATED`, `REFUSAL`, `CONTENT_FILTER`) and its
 * `lastMessageAt` is not after the newest of them. Any other code (budget,
 * queue, provider, staleness, ending), a `done` review among the three or a
 * newer message unparks it, so an outage never parks a night's conversations.
 *
 * ## Run
 *
 * {@link processReviewSweep} first reads its settings: while nightly reviews
 * (`judgeNightlyEnabled`) or AI features (`Config.llmDisabled`) are off it
 * queues nothing and stops at `disabled`. The schedule follows the setting
 * (`lib/judge/schedule.ts`), but an "off" save the queue never received
 * leaves it in place, so the job checks for itself, as the request-tier sync
 * does. It then checks the judge cap before each enqueue and stops at `cap`;
 * `enqueueReview` reads the job states before its transaction, so no Redis
 * call runs inside one. A conversation whose open review already exists, or
 * whose job could not be added, counts as skipped.
 *
 * @module lib/judge/sweep
 */

import { createHash } from "node:crypto"

import { enqueueReview } from "@/lib/judge/enqueue"
import { reviewJobState } from "@/lib/judge/job-state"
import { REVIEWABLE_CONVERSATION } from "@/lib/judge/scope"
import { checkJudgeSpend } from "@/lib/judge/spend"
import { prisma } from "@/lib/prisma"
import { addJob, getJobState } from "@/lib/queue/client"
import { JOB_TYPES } from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("conversation-review-sweep")

const SWEEP_LIMIT = 50
const BATCH_SIZE = 200
const PARKED_AFTER = 3
const COUNTING_CODES = new Set(["SCHEMA", "TRUNCATED", "REFUSAL", "CONTENT_FILTER"])

type SweepConfig = { sampleRate: number; minTurns: number }
type SweepResult = { queued: number; skipped: number; stoppedBy: "cap" | "limit" | "done" | "no-provider" | "disabled" }

/**
 * Whether a conversation is in tonight's sample at `rate` percent. The key is
 * `` `${conversationId}|${lastMessageAt.toISOString()}` ``, on the full
 * instant: its SHA-256, the first 8 hex digits read as an unsigned integer,
 * mod 100, is compared with `rate`. A retried sweep picks the same set, and a
 * new message re-draws the conversation, so a low rate never leaves the same
 * ones out every night.
 *
 * @internal
 */
export function inSample(conversationId: string, lastMessageAt: Date, rate: number): boolean {
  const digest = createHash("sha256").update(`${conversationId}|${lastMessageAt.toISOString()}`).digest("hex")
  return Number.parseInt(digest.slice(0, 8), 16) % 100 < rate
}

/** The failure skip; see the module docs. */
async function isParked(conversationId: string, lastMessageAt: Date): Promise<boolean> {
  const recent = await prisma.conversationReview.findMany({
    where: { conversationId, trigger: "nightly" },
    orderBy: { createdAt: "desc" },
    take: PARKED_AFTER,
    select: { status: true, errorCode: true, createdAt: true },
  })
  if (recent.length < PARKED_AFTER) return false
  if (!recent.every((review) => review.status === "failed" && review.errorCode !== null && COUNTING_CODES.has(review.errorCode))) return false
  return lastMessageAt.getTime() <= recent[0]!.createdAt.getTime()
}

type Keyset = { lastMessageAt: Date; id: string }

function readBatch(now: Date, after: Keyset | null) {
  return prisma.chatConversation.findMany({
    where: {
      ...REVIEWABLE_CONVERSATION,
      lastMessageAt: { lte: now },
      ...(after && { OR: [{ lastMessageAt: { gt: after.lastMessageAt } }, { lastMessageAt: after.lastMessageAt, id: { gt: after.id } }] }),
    },
    orderBy: [{ lastMessageAt: "asc" }, { id: "asc" }],
    take: BATCH_SIZE,
    select: {
      id: true,
      lastMessageAt: true,
      _count: { select: { messages: { where: { role: "user" } } } },
      reviews: { where: { status: "done" }, orderBy: { completedAt: "desc" }, take: 1, select: { reviewedThrough: true } },
    },
  })
}

/**
 * Up to 50 conversation ids to review tonight, oldest first; see the module docs.
 *
 * @internal
 */
export async function selectSweepCandidates(now: Date, cfg: SweepConfig): Promise<string[]> {
  const picked: string[] = []
  let after: Keyset | null = null
  for (;;) {
    const batch = await readBatch(now, after)
    for (const row of batch) {
      const lastMessageAt = row.lastMessageAt!
      after = { lastMessageAt, id: row.id }
      if (row._count.messages < cfg.minTurns) continue
      const reviewedThrough = row.reviews[0]?.reviewedThrough
      if (reviewedThrough && lastMessageAt.getTime() <= reviewedThrough.getTime()) continue
      if (!inSample(row.id, lastMessageAt, cfg.sampleRate)) continue
      if (await isParked(row.id, lastMessageAt)) continue
      picked.push(row.id)
      if (picked.length === SWEEP_LIMIT) return picked
    }
    if (batch.length < BATCH_SIZE) return picked
  }
}

/** `CONVERSATION_REVIEW_SWEEP`: queues tonight's nightly reviews; see the module docs. */
export async function processReviewSweep(): Promise<SweepResult> {
  const config = await prisma.config.findUnique({
    where: { id: "config" },
    select: { judgeNightlyEnabled: true, llmDisabled: true, judgeSampleRate: true, judgeMinTurns: true },
  })
  // A missing row is off: judgeNightlyEnabled defaults to false
  if (!config?.judgeNightlyEnabled || config.llmDisabled) {
    logger.info("Conversation review sweep skipped: nightly reviews or AI features are off", { nightly: config?.judgeNightlyEnabled ?? false })
    return { queued: 0, skipped: 0, stoppedBy: "disabled" }
  }
  const candidates = await selectSweepCandidates(new Date(), { sampleRate: config.judgeSampleRate, minTurns: config.judgeMinTurns })
  const deps = {
    enqueue: async (data: { reviewId: string }) => {
      await addJob(JOB_TYPES.CONVERSATION_REVIEW, data)
      return { ok: true as const }
    },
    getJobState: (jobId: string) => reviewJobState(jobId, getJobState),
  }

  const result = await queueAll(candidates, deps)
  logger.info("Conversation review sweep finished", { candidates: candidates.length, ...result })
  return result
}

async function queueAll(candidates: string[], deps: Parameters<typeof enqueueReview>[1]): Promise<SweepResult> {
  let queued = 0
  let skipped = 0
  for (const conversationId of candidates) {
    if (!(await checkJudgeSpend()).ok) return { queued, skipped, stoppedBy: "cap" }
    const outcome = await enqueueReview({ conversationId, trigger: "nightly", requestedById: null }, deps)
    if (!outcome.ok && outcome.code === "UNAVAILABLE") return { queued, skipped, stoppedBy: "no-provider" }
    if (outcome.ok && outcome.created) queued += 1
    else skipped += 1
  }
  return { queued, skipped, stoppedBy: candidates.length === SWEEP_LIMIT ? "limit" : "done" }
}

/** The processor for `CONVERSATION_REVIEW_SWEEP`, or null for any other job type. */
export function getConversationReviewSweepProcessor(jobType: string): typeof processReviewSweep | null {
  return jobType === JOB_TYPES.CONVERSATION_REVIEW_SWEEP ? processReviewSweep : null
}
