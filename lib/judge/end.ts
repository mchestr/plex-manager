/**
 * What ending a conversation does to its judge rows (spec §5): its `queued`
 * and `running` reviews fail with `ENDED`, its findings go, and every review's
 * `summary` is cleared, because findings and summaries quote the text the
 * ending removes.
 *
 * The review rows stay, without text, so their `LLMUsage` rows keep the link
 * the judge cap and the `judge` spend filter count on, the same reason ending
 * keeps the conversation row. The `chatConversations` retention rule's later
 * delete cascades them.
 *
 * Callers pass candidate ids: every write also filters on the conversation
 * having ended, as the retention sweep's message delete does, so an id whose
 * ending lost a race (a turn landed first) keeps its reviews and findings.
 *
 * @module lib/judge/end
 */

import type { Prisma } from "@/lib/generated/prisma/client"
import { type PrismaTransactionClient } from "@/lib/prisma"

/** Ends the judge rows of those of `conversationIds` that have ended, in the caller's transaction. */
export async function endReviewsOf(tx: PrismaTransactionClient, conversationIds: string[]): Promise<void> {
  if (conversationIds.length === 0) return
  const ended = { conversationId: { in: conversationIds }, conversation: { endedAt: { not: null } } } satisfies Prisma.ConversationReviewWhereInput
  await tx.conversationReview.updateMany({ where: { ...ended, status: { in: ["queued", "running"] } }, data: { status: "failed", errorCode: "ENDED" } })
  await tx.conversationFinding.deleteMany({ where: ended })
  await tx.conversationReview.updateMany({ where: ended, data: { summary: null } })
}
