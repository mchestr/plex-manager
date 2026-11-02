/**
 * The master "AI features" switch, as the conversation judge obeys it.
 *
 * {@link isLlmDisabled} reads `Config.llmDisabled` the way every LLM caller
 * reads it (the assistant, Rewind, the admin shell): a missing `Config` row
 * is on. The switch promises that the app sends no LLM requests while it is
 * off, so the judge sends none either:
 *
 * - `enqueueReview` refuses with `LLM_DISABLED`, before a review exists;
 * - the nightly sweep stops at `disabled` (`lib/judge/sweep.ts`).
 *
 * @module lib/judge/guards
 */

import { prisma } from "@/lib/prisma"

/** Whether AI features are off (`Config.llmDisabled`); see the module docs. */
export async function isLlmDisabled(): Promise<boolean> {
  const config = await prisma.config.findUnique({ where: { id: "config" }, select: { llmDisabled: true } })
  return config?.llmDisabled === true
}
