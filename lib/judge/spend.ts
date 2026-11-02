/**
 * The judge's daily spend cap and the `judge-spend` lease (spec §4, step 3).
 *
 * ## Cap
 *
 * {@link checkJudgeSpend} sums today's `LLMUsage.cost` over the judge's rows
 * ({@link JUDGE_USAGE_WHERE}: a `conversationReviewId` and no
 * `chatConversationId`) against `Config.llmDailyCapJudgeUsd`. "Today" is the
 * server-zone day the assistant caps use (`spendDay` in `lib/llm/budget.ts`).
 * Judge rows never carry a `chatConversationId`, so they never count against
 * the assistant caps, and assistant rows never count here.
 *
 * Counting through `conversationReviewId` is deliberate. Ending a conversation
 * keeps its review rows (the normal path), so the link survives. Only a hard
 * delete of the conversation the same day (a member erase, or retention's
 * delete of an ended row, which is months later) nulls it, and that day's
 * judge spend for that conversation then drops out of the cap: the same
 * property the assistant caps already have for an erased member's own rows.
 * A purpose column or a `promptVersion`-prefix match would couple the cap to
 * naming.
 *
 * ## Lease
 *
 * {@link withJudgeLease} runs the check, the judge call and the recording of
 * its cost under one {@link LeaseLock} named `judge-spend` on the
 * {@link RedisLeaseStore}, so one review at a time across the deployment
 * checks and spends:
 *
 * ```
 * acquire once ── taken ──▶ LEASE_BUSY (the processor re-delays the job)
 *      │
 *      ▼
 *   run fn ◀── renew every 60 s (5-minute lease) ── stop on a lost renewal
 *      │
 *      ▼
 *   release, whether fn returned or threw
 * ```
 *
 * A lease lost mid-call (Redis restarted, say) does not stop `fn`: its cost is
 * still recorded, and another worker may start one review meanwhile, so the
 * overshoot is bounded by one review.
 *
 * @module lib/judge/spend
 */

import "server-only"

import { JUDGE_USAGE_WHERE } from "@/lib/judge/usage-rows"
import { spendDay } from "@/lib/llm/budget"
import { LeaseLock, type LeaseStore } from "@/lib/locks/lease-lock"
import { RedisLeaseStore } from "@/lib/locks/redis-lease-store"
import { prisma } from "@/lib/prisma"
import { getRedisConnection } from "@/lib/queue/connection"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("JUDGE_SPEND")

/** The cap a missing `Config` row stands for: the column default. */
const DEFAULT_JUDGE_CAP_USD = 1

/** Longer than the 3-minute judge call; renewed while the review runs. */
const LEASE_MS = 300_000
const RENEW_EVERY_MS = 60_000

export type JudgeSpendCheck = { ok: true } | { ok: false; code: "BUDGET_EXCEEDED" | "BUDGET_UNAVAILABLE" }

/**
 * Whether today's judge spend is still under `llmDailyCapJudgeUsd`. Never
 * throws: when the cap or the sum cannot be read, the review is refused with
 * `BUDGET_UNAVAILABLE`. A cap of 0 refuses every review.
 */
export async function checkJudgeSpend(now: Date = new Date()): Promise<JudgeSpendCheck> {
  try {
    const [config, day] = await Promise.all([
      prisma.config.findUnique({ where: { id: "config" }, select: { llmDailyCapJudgeUsd: true } }),
      spendDay(now),
    ])
    const { _sum } = await prisma.lLMUsage.aggregate({
      _sum: { cost: true },
      where: { ...JUDGE_USAGE_WHERE, createdAt: { gte: day.start } },
    })
    const cap = config?.llmDailyCapJudgeUsd ?? DEFAULT_JUDGE_CAP_USD
    return (_sum.cost ?? 0) >= cap ? { ok: false, code: "BUDGET_EXCEEDED" } : { ok: true }
  } catch (error) {
    logger.error("Judge spend check failed, refusing the review", error)
    return { ok: false, code: "BUDGET_UNAVAILABLE" }
  }
}

/**
 * Runs `fn` while holding the `judge-spend` lease. Tries to take it once and
 * returns `LEASE_BUSY` at once when another review holds it, or when the store
 * cannot answer. Renews it every minute while `fn` runs and always releases
 * it; an error from `fn` propagates after the release.
 */
export async function withJudgeLease<T>(
  fn: () => Promise<T>,
  { store = new RedisLeaseStore(getRedisConnection()) }: { store?: LeaseStore } = {}
): Promise<{ ok: true; value: T } | { ok: false; code: "LEASE_BUSY" }> {
  const lock = new LeaseLock({ name: "judge-spend", leaseDurationMs: LEASE_MS, store })
  if (!(await lock.acquire())) return { ok: false, code: "LEASE_BUSY" }

  const renewal = setInterval(() => {
    lock.renew().then((renewed) => {
      if (renewed) return
      clearInterval(renewal)
      logger.warn("Judge spend lease lost before renewal")
    })
  }, RENEW_EVERY_MS)
  renewal.unref()

  try {
    return { ok: true, value: await fn() }
  } finally {
    clearInterval(renewal)
    await lock.release()
  }
}
