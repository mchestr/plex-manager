import "server-only"

import { addSpend } from "@/lib/llm/budget"
import type { TokenUsage } from "@/lib/llm/models"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("LLM_USAGE")

/**
 * Why a billed call ended. Anything but `ok` is a billed failure: the provider
 * charged for the tokens even though the output was unusable.
 */
export type UsageOutcome = "ok" | "length" | "content-filter" | "refusal" | "schema"

/** Who and what a call was for. Every field but `userId` is optional. */
export interface UsageAttribution {
  userId: string
  wrappedId?: string | null
  generationId?: string | null
  chatConversationId?: string | null
  promptVersion?: string | null
  factsHash?: string | null
}

export interface UsageRecord {
  attribution: UsageAttribution
  provider: string
  /** The model the provider reports serving, not the one requested. */
  modelId: string
  usage: TokenUsage
  cost: number
  outcome: UsageOutcome
  prompt?: string | null
  response?: string | null
}

/**
 * Write one `LLMUsage` row for one billed attempt. Network errors with no
 * usage are never recorded; truncated, refused and schema-failed responses
 * are. A failed write is logged, never thrown: losing a usage row must not
 * fail the generation that paid for it. An assistant call (one with a
 * `chatConversationId`) also adds its cost to today's cached spend, which the
 * caps in `lib/llm/budget.ts` read.
 */
export async function recordUsage(record: UsageRecord): Promise<void> {
  const { attribution, usage } = record
  try {
    await prisma.lLMUsage.create({
      data: {
        userId: attribution.userId,
        wrappedId: attribution.wrappedId ?? null,
        generationId: attribution.generationId ?? null,
        chatConversationId: attribution.chatConversationId ?? null,
        // An assistant call joins its conversation's row on the LLM usage list; any other call is its own.
        ...(attribution.chatConversationId ? { groupKey: attribution.chatConversationId } : {}),
        promptVersion: attribution.promptVersion ?? null,
        factsHash: attribution.factsHash ?? null,
        provider: record.provider,
        model: record.modelId,
        prompt: record.prompt ?? null,
        response: record.response ?? null,
        promptTokens: usage.inputTokens,
        completionTokens: usage.outputTokens,
        totalTokens: usage.inputTokens + usage.outputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        reasoningTokens: usage.reasoningTokens,
        cost: record.cost,
        outcome: record.outcome,
      },
    })
    if (attribution.chatConversationId) await addSpend(attribution.userId, record.cost)
  } catch (error) {
    logger.error("Failed to record LLM usage", error, { provider: record.provider, model: record.modelId })
  }
}
