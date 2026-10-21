/**
 * What a dry run will cost before it runs (P7.10), from the price table
 * (`lookupModel()` through `estimateCostUsd`); it calls no provider.
 *
 * The copy call is priced at the real system prompt (with the run's style
 * guide), a full issue's user prompt and the call's output limit; the upper
 * bound adds one repair call on the provider's budget model. "Templates only"
 * and a server with no Rewind provider cost nothing.
 *
 * @module lib/rewind/dry-run/estimate
 */

import "server-only"

import { budgetModelFor, estimateCostUsd } from "@/lib/llm/models"
import { isLLMProviderId } from "@/lib/llm/provider-presets"
import { prisma } from "@/lib/prisma"
import { MAX_OUTPUT_TOKENS } from "@/lib/wrapped/pipeline/copy-llm"
import { systemPrompt } from "@/lib/wrapped/prompt/rewind-2026"
import { findRewindStyleGuide } from "@/lib/wrapped/prompt/store"

import type { DryRunInput } from "./input"

/** A rough allowance for a full issue's user prompt (fact sheet, slots and titles), in characters. */
const FULL_ISSUE_USER_PROMPT_CHARS = 9000

export type DryRunEstimate =
  | { llm: false; costUsd: 0; maxCostUsd: 0 }
  | { llm: true; provider: string; model: string; costUsd: number; maxCostUsd: number }

/** The estimate for the run; see the module comment. */
export async function estimateDryRun(input: Pick<DryRunInput, "model" | "styleGuide" | "copyPolicy">): Promise<DryRunEstimate> {
  const none = { llm: false, costUsd: 0, maxCostUsd: 0 } as const
  if (input.copyPolicy === "no-llm") return none
  const row = await prisma.lLMProvider.findFirst({ where: { isActive: true, purpose: "wrapped" }, select: { provider: true, model: true } })
  const provider = row?.provider
  const model = input.model ?? row?.model
  if (!provider || !isLLMProviderId(provider) || !model) return none

  const styleGuide = input.styleGuide === undefined ? await findRewindStyleGuide() : input.styleGuide
  const call = (id: string) =>
    estimateCostUsd({
      provider,
      model: id,
      systemPrompt: systemPrompt(styleGuide),
      prompt: "x".repeat(FULL_ISSUE_USER_PROMPT_CHARS),
      completionTokens: MAX_OUTPUT_TOKENS,
    }).cost
  const copy = call(model)
  return { llm: true, provider, model, costUsd: copy, maxCostUsd: copy + call(budgetModelFor(provider) ?? model) }
}
