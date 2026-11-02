/**
 * The judge's guards: the master "AI features" switch, and the last checks a
 * review passes before its paid judge call.
 *
 * ## AI features
 *
 * {@link isLlmDisabled} reads `Config.llmDisabled` the way every LLM caller
 * reads it (the assistant, Rewind, the admin shell): a missing `Config` row
 * is on. The switch promises that the app sends no LLM requests while it is
 * off, so the judge sends none either:
 *
 * - `enqueueReview` refuses with `LLM_DISABLED`, before a review exists;
 * - the nightly sweep stops at `disabled` (`lib/judge/sweep.ts`);
 * - a review queued before the switch went off fails with `LLM_DISABLED`
 *   just before its call (below), so jobs already in the queue send nothing;
 * - the conversation page says so and turns Review off
 *   (`getConversationReview`'s `llmDisabled`).
 *
 * ## Before the call
 *
 * The review job loads the conversation, then may wait minutes behind the
 * `judge-spend` lease. {@link blockedBeforeCall} runs under the lease, just
 * before the spend check, and reads the state as it is when the call would
 * be sent:
 *
 * | finds                                                           | outcome        |
 * |-----------------------------------------------------------------|----------------|
 * | the review is gone, or no longer `running` with the run's token | `SUPERSEDED`   |
 * | the conversation has ended                                      | `SUPERSEDED`   |
 * | AI features are off                                             | `LLM_DISABLED` |
 * | none of these                                                   | null: call     |
 *
 * `SUPERSEDED` writes nothing: the takeover, the reap or the ending that
 * moved the review on has written it already. The conversation check is a
 * backstop, since every ending also fails an open review with `ENDED` in its
 * own transaction (`lib/judge/end.ts`).
 *
 * @module lib/judge/guards
 */

import { prisma } from "@/lib/prisma"

/** Whether AI features are off (`Config.llmDisabled`); see the module docs. */
export async function isLlmDisabled(): Promise<boolean> {
  const config = await prisma.config.findUnique({ where: { id: "config" }, select: { llmDisabled: true } })
  return config?.llmDisabled === true
}

/** Why the run must not call the judge, or null when it may; see "Before the call". */
export async function blockedBeforeCall(
  run: { id: string; status: "running"; runToken: number },
  conversationId: string
): Promise<"SUPERSEDED" | "LLM_DISABLED" | null> {
  const [held, open, disabled] = await Promise.all([
    prisma.conversationReview.findFirst({ where: run, select: { id: true } }),
    prisma.chatConversation.findFirst({ where: { id: conversationId, endedAt: null }, select: { id: true } }),
    isLlmDisabled(),
  ])
  if (!held || !open) return "SUPERSEDED"
  return disabled ? "LLM_DISABLED" : null
}
