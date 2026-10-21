/**
 * What a season run would cost (P7.8, design 8.2), for the console's confirm
 * dialogs. Pure: the caller loads the members and the model.
 *
 * Only full-edition members whose facts changed call the model: pocket and
 * postcard editions are template copy, and unchanged facts reuse the stored
 * copy. A member with no edition yet counts as full. Each call is about
 * 4,400 input and 1,500 output tokens at the model's `lookupModel()` price.
 * Past the season budget, members get template copy, so the estimate stops
 * at the cap and says how many members that is.
 *
 * @module lib/wrapped/admin/estimate
 */

import { costUsd, type ModelInfo } from "@/lib/llm/models"

/** Tokens of one member's copy call (design 8.2). */
const COPY_CALL_TOKENS = { input: 4_400, output: 1_500 } as const

export interface SeasonCostCandidate {
  edition: string | null
  /** The stored Rewind already covers this batch's data, so its facts and copy are reused. */
  unchanged: boolean
}

export interface SeasonCostEstimate {
  members: number
  /** Members whose run calls the model. */
  llmMembers: number
  perMemberUsd: number
  /** The estimate, at most what is left of the budget. */
  costUsd: number
  /** Members who would get template copy because the budget runs out. */
  pastCap: number
}

/**
 * @example
 * ```ts
 * estimateSeasonCost({
 *   candidates: [{ edition: "full", unchanged: false }, { edition: "postcard", unchanged: false }],
 *   model: lookupModel("openai", "gpt-6-luna"),
 *   templateOnly: false,
 *   budgetLeftUsd: 10,
 * }).llmMembers // 1
 * ```
 */
export function estimateSeasonCost(input: {
  candidates: readonly SeasonCostCandidate[]
  model: ModelInfo | null
  templateOnly: boolean
  budgetLeftUsd: number
  at?: Date
}): SeasonCostEstimate {
  const members = input.candidates.length
  const callers = input.candidates.filter((c) => (c.edition ?? "full") === "full" && !c.unchanged).length
  const llmMembers = input.templateOnly || !input.model ? 0 : callers
  const perMemberUsd =
    llmMembers > 0 && input.model?.pricing
      ? costUsd(
          input.model,
          { inputTokens: COPY_CALL_TOKENS.input, cachedInputTokens: 0, outputTokens: COPY_CALL_TOKENS.output, reasoningTokens: 0 },
          input.at
        )
      : 0
  const budget = Math.max(0, input.budgetLeftUsd)
  const affordable = perMemberUsd > 0 ? Math.min(llmMembers, Math.floor(budget / perMemberUsd)) : llmMembers
  return {
    members,
    llmMembers,
    perMemberUsd,
    costUsd: affordable * perMemberUsd,
    pastCap: llmMembers - affordable,
  }
}
