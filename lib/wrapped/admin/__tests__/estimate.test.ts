/**
 * @jest-environment node
 */

import { costUsd, lookupModel } from '@/lib/llm/models'
import { estimateSeasonCost, type SeasonCostCandidate } from '@/lib/wrapped/admin/estimate'

const LUNA = lookupModel('openai', 'gpt-6-luna')
const PER_MEMBER = costUsd(LUNA, { inputTokens: 4_400, cachedInputTokens: 0, outputTokens: 1_500, reasoningTokens: 0 })

const full = (n: number, unchanged = false): SeasonCostCandidate[] => Array.from({ length: n }, () => ({ edition: 'full', unchanged }))

describe('estimateSeasonCost', () => {
  it('prices full-edition members whose facts changed at about 4,400 input and 1,500 output tokens', () => {
    const estimate = estimateSeasonCost({ candidates: full(10), model: LUNA, templateOnly: false, budgetLeftUsd: 100 })

    expect(PER_MEMBER).toBeGreaterThan(0)
    expect(estimate).toEqual({ members: 10, llmMembers: 10, perMemberUsd: PER_MEMBER, costUsd: 10 * PER_MEMBER, pastCap: 0 })
  })

  it('leaves out pocket and postcard editions and unchanged facts, and counts a member with no edition as full', () => {
    const candidates: SeasonCostCandidate[] = [
      { edition: 'pocket', unchanged: false },
      { edition: 'postcard', unchanged: false },
      { edition: 'full', unchanged: true },
      { edition: null, unchanged: false },
    ]
    const estimate = estimateSeasonCost({ candidates, model: LUNA, templateOnly: false, budgetLeftUsd: 100 })

    expect(estimate).toMatchObject({ members: 4, llmMembers: 1, costUsd: PER_MEMBER })
  })

  it('stops at the budget and counts the members past the cap', () => {
    const estimate = estimateSeasonCost({ candidates: full(10), model: LUNA, templateOnly: false, budgetLeftUsd: 3.5 * PER_MEMBER })

    expect(estimate).toMatchObject({ llmMembers: 10, costUsd: 3 * PER_MEMBER, pastCap: 7 })
  })

  it('costs nothing in template-only mode, without a model, or for an unpriced model', () => {
    expect(estimateSeasonCost({ candidates: full(3), model: LUNA, templateOnly: true, budgetLeftUsd: 10 })).toMatchObject({ llmMembers: 0, costUsd: 0 })
    expect(estimateSeasonCost({ candidates: full(3), model: null, templateOnly: false, budgetLeftUsd: 10 })).toMatchObject({ llmMembers: 0, costUsd: 0 })
    const unpriced = lookupModel('openai-compatible', 'qwen3.6:27b')
    expect(estimateSeasonCost({ candidates: full(3), model: unpriced, templateOnly: false, budgetLeftUsd: 0 })).toMatchObject({
      llmMembers: 3,
      costUsd: 0,
      pastCap: 0,
    })
  })
})
