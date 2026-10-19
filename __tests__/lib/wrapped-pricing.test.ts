/**
 * Tests for lib/llm/pricing.ts - cost calculation logic
 */

const mockWarn = jest.fn()

jest.mock('@/lib/utils/logger', () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: (...args: unknown[]) => mockWarn(...args),
    error: jest.fn(),
  })),
}))

import { calculateCost, estimateCost, MODEL_PRICING } from '@/lib/llm/pricing'
import { createLogger } from '@/lib/utils/logger'

describe('Pricing Calculation', () => {
  beforeEach(() => {
    mockWarn.mockClear()
  })

  it('logs through the LLM_PRICING logger', () => {
    expect(createLogger).toHaveBeenCalledWith('LLM_PRICING')
  })

  describe('calculateCost', () => {
    it('should calculate cost for OpenAI GPT-4 model', () => {
      const cost = calculateCost('gpt-4', 1000000, 500000)
      // GPT-4: $30 per 1M input tokens, $60 per 1M output tokens
      // 1M input * $30/1M + 0.5M output * $60/1M = $30 + $30 = $60
      expect(cost).toBe(60)
    })

    it('should calculate cost for OpenAI GPT-3.5-turbo model', () => {
      const cost = calculateCost('gpt-3.5-turbo', 1000000, 1000000)
      // GPT-3.5-turbo: $0.5 per 1M input tokens, $1.5 per 1M output tokens
      // 1M input * $0.5/1M + 1M output * $1.5/1M = $0.5 + $1.5 = $2
      expect(cost).toBe(2)
    })

    it('should calculate cost for OpenAI GPT-4o model', () => {
      const cost = calculateCost('gpt-4o', 500000, 250000)
      // GPT-4o: $2.5 per 1M input tokens, $10 per 1M output tokens
      // 0.5M input * $2.5/1M + 0.25M output * $10/1M = $1.25 + $2.5 = $3.75
      expect(cost).toBe(3.75)
    })

    it('should calculate cost for OpenAI GPT-4o-mini model', () => {
      const cost = calculateCost('gpt-4o-mini', 2000000, 1000000)
      // GPT-4o-mini: $0.15 per 1M input tokens, $0.6 per 1M output tokens
      // 2M input * $0.15/1M + 1M output * $0.6/1M = $0.3 + $0.6 = $0.9
      expect(cost).toBeCloseTo(0.9, 2)
    })

    it('should cost an unknown model 0 and warn', () => {
      const cost = calculateCost('unknown-model', 1000000, 500000)
      expect(cost).toBe(0)
      expect(mockWarn).toHaveBeenCalledWith('Unknown model price', { model: 'unknown-model' })
    })

    it('should handle zero tokens', () => {
      const cost = calculateCost('gpt-4', 0, 0)
      expect(cost).toBe(0)
    })

    it('should cost a null model 0 and warn', () => {
      const cost = calculateCost(null, 1000000, 500000)
      expect(cost).toBe(0)
      expect(mockWarn).toHaveBeenCalledWith('Unknown model price', { model: null })
    })

    it('should cost an undefined model 0 and warn', () => {
      const cost = calculateCost(undefined, 1000000, 500000)
      expect(cost).toBe(0)
      expect(mockWarn).toHaveBeenCalledWith('Unknown model price', { model: undefined })
    })

    it('should not warn for a known model', () => {
      calculateCost('gpt-4o', 1000, 1000)
      expect(mockWarn).not.toHaveBeenCalled()
    })

    it('should calculate cost for batch tier models', () => {
      // Check if batch tier model exists, otherwise skip or use fallback
      const cost = calculateCost('gpt-4-0613-batch', 1000000, 500000)
      // GPT-4-0613-batch: $15 per 1M input tokens, $30 per 1M output tokens
      // 1M input * $15/1M + 0.5M output * $30/1M = $15 + $15 = $30
      expect(cost).toBe(30)
    })

    it('should calculate cost for priority tier models', () => {
      const cost = calculateCost('gpt-4o-priority', 1000000, 500000)
      // GPT-4o-priority: $4.25 per 1M input tokens, $17 per 1M output tokens
      // 1M input * $4.25/1M + 0.5M output * $17/1M = $4.25 + $8.5 = $12.75
      expect(cost).toBe(12.75)
    })

    it('should calculate cost for O-series models', () => {
      const cost = calculateCost('o1', 1000000, 500000)
      // o1: $15 per 1M input tokens, $60 per 1M output tokens
      // 1M input * $15/1M + 0.5M output * $60/1M = $15 + $30 = $45
      expect(cost).toBe(45)
    })

    it('should handle fractional token counts', () => {
      const cost = calculateCost('gpt-4', 1234567, 987654)
      // Should handle non-round numbers
      expect(cost).toBeCloseTo(1234567 / 1000000 * 30 + 987654 / 1000000 * 60, 2)
    })

    it('should price cached prompt tokens at the cached input rate', () => {
      // gpt-4o: $2.5 input, $1.25 cached, $10 output per 1M
      // 0.6M uncached * $2.5 + 0.4M cached * $1.25 + 0.5M output * $10 = $1.5 + $0.5 + $5 = $7
      const cost = calculateCost('gpt-4o', 1000000, 500000, 400000)
      expect(cost).toBeCloseTo(7, 10)
    })

    it('should price cached tokens at the input rate when a model has no cached price', () => {
      // gpt-4: no cachedInput, so caching does not change the cost
      expect(calculateCost('gpt-4', 1000000, 500000, 400000)).toBe(calculateCost('gpt-4', 1000000, 500000))
    })

    it('should default cached tokens to 0', () => {
      expect(calculateCost('gpt-6-sol', 1000000, 0)).toBe(2)
    })

    it.each([
      // model, input, output, cached input per 1M
      ['gpt-6-astra', 10, 50, 1],
      ['gpt-6.1-sol', 2, 10, 0.1],
      ['gpt-6-sol', 2, 10, 0.2],
      ['gpt-6-luna', 0.1, 0.5, 0.01],
    ])('should price %s at $%s in, $%s out and $%s cached', (model, input, output, cached) => {
      expect(MODEL_PRICING[model]).toEqual({ input, output, cachedInput: cached })
      // 1M uncached + 1M cached input and 1M output
      expect(calculateCost(model, 2000000, 1000000, 1000000)).toBeCloseTo(input + cached + output, 10)
    })

    it('should price a dated or openai/-prefixed GPT-6 ID like its base model', () => {
      expect(calculateCost('gpt-6-luna-2026-09-22', 1000000, 1000000)).toBeCloseTo(0.6, 10)
      expect(calculateCost('openai/gpt-6-astra', 1000000, 0)).toBe(10)
      expect(mockWarn).not.toHaveBeenCalled()
    })
  })

  describe('estimateCost', () => {
    it('should estimate with the model price and the given completion budget', () => {
      const estimate = estimateCost('x'.repeat(4000), 'gpt-6-luna', 2000)
      expect(estimate.promptTokens).toBe(1000)
      expect(estimate.estimatedCompletionTokens).toBe(2000)
      // 1000 input at $0.10/1M + 2000 output at $0.50/1M
      expect(estimate.cost).toBeCloseTo(0.0011, 10)
    })
  })

  describe('MODEL_PRICING', () => {
    it('should have pricing for common models', () => {
      expect(MODEL_PRICING['gpt-4']).toBeDefined()
      expect(MODEL_PRICING['gpt-3.5-turbo']).toBeDefined()
      expect(MODEL_PRICING['gpt-4o']).toBeDefined()
      expect(MODEL_PRICING['gpt-4o-mini']).toBeDefined()
    })

    it('should have input and output pricing for all models', () => {
      Object.values(MODEL_PRICING).forEach((pricing) => {
        expect(pricing.input).toBeDefined()
        expect(pricing.output).toBeDefined()
        expect(typeof pricing.input).toBe('number')
        expect(typeof pricing.output).toBe('number')
        expect(pricing.input).toBeGreaterThanOrEqual(0)
        expect(pricing.output).toBeGreaterThanOrEqual(0)
      })
    })

    it('should have reasonable pricing values', () => {
      Object.values(MODEL_PRICING).forEach((pricing) => {
        // Prices should be reasonable (not negative, not extremely high)
        expect(pricing.input).toBeGreaterThanOrEqual(0)
        expect(pricing.output).toBeGreaterThanOrEqual(0)
        expect(pricing.input).toBeLessThan(1000) // Sanity check
        expect(pricing.output).toBeLessThan(1000) // Sanity check
      })
    })
  })
})

