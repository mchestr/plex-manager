/**
 * @jest-environment node
 */

import { lookupModel } from '@/lib/llm/models'
import { estimateSeasonCost } from '@/lib/wrapped/admin/estimate'

describe('JSDoc Documentation Examples', () => {
  it('estimateSeasonCost: only the full edition calls the model', () => {
    expect(
      estimateSeasonCost({
        candidates: [{ edition: 'full', unchanged: false }, { edition: 'postcard', unchanged: false }],
        model: lookupModel('openai', 'gpt-6-luna'),
        templateOnly: false,
        budgetLeftUsd: 10,
      }).llmMembers
    ).toBe(1)
  })
})
