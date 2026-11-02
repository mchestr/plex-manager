/**
 * The `LLMUsage` rows that are conversation judge calls: a review attached
 * and no conversation. The judge's daily cap (`checkJudgeSpend`,
 * `lib/judge/spend.ts`), the judge spend metric (`lib/observability/metrics.ts`)
 * and the `judge` bucket of `llmSpendSince` (`lib/llm/usage-totals.ts`) all
 * sum exactly these rows, so the three always agree.
 *
 * Assistant rows are the ones with a conversation (`chatConversationId`), the
 * rows the assistant caps count. Judge calls never set one, and a row that
 * ever carried both would count once, as the assistant's: the `chat` and
 * `judge` buckets are disjoint by construction, so `wrapped` (everything
 * else) never subtracts a row twice.
 *
 * @module lib/judge/usage-rows
 */

import type { Prisma } from "@/lib/generated/prisma/client"

export const JUDGE_USAGE_WHERE = { conversationReviewId: { not: null }, chatConversationId: null } satisfies Prisma.LLMUsageWhereInput
