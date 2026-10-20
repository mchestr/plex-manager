/**
 * Tests for lib/llm/models.ts - model lookup, effort mapping and cost
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

import { MODEL_CATALOG } from '@/lib/llm/model-catalog'
import {
  budgetModelFor,
  costUsd,
  estimateCostUsd,
  listKnownModels,
  lookupModel,
  normalizeModelId,
  priceAt,
  resolveEffort,
  type TokenUsage,
} from '@/lib/llm/models'
import { createLogger } from '@/lib/utils/logger'

const MILLION = 1_000_000

function usage(partial: Partial<TokenUsage>): TokenUsage {
  return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, ...partial }
}

beforeEach(() => mockWarn.mockClear())

describe('normalizeModelId and lookupModel', () => {
  it('logs through the LLM_MODELS logger', () => {
    expect(createLogger).toHaveBeenCalledWith('LLM_MODELS')
  })

  it('normalises openai/gpt-6-sol-2026-09-22 to gpt-6-sol', () => {
    expect(normalizeModelId('openai/gpt-6-sol-2026-09-22')).toBe('gpt-6-sol')
    expect(normalizeModelId(' OpenAI/GPT-6.1-Sol-2026-09-29 ')).toBe('gpt-6.1-sol')
    expect(lookupModel('openai', 'openai/gpt-6-sol-2026-09-22')).toMatchObject({ id: 'gpt-6-sol', known: true })
  })

  it('strips a compact date suffix', () => {
    expect(lookupModel('anthropic', 'claude-sonnet-5-5-20260901').id).toBe('claude-sonnet-5-5')
  })

  it('matches exactly, with no prefix families', () => {
    expect(lookupModel('openai', 'gpt-6-sol-mega').known).toBe(false)
    expect(lookupModel('openai', 'gpt-5.2-mini').known).toBe(false)
    // A model is known only under its own provider
    expect(lookupModel('openai-compatible', 'gpt-6-sol').known).toBe(false)
  })

  it('gives an unknown model no price and conservative capabilities', () => {
    const local = lookupModel('openai-compatible', 'qwen3.6:27b')
    expect(local).toMatchObject({ id: 'qwen3.6:27b', pricing: null, known: false })
    expect(local.capabilities).toMatchObject({ samplingParams: false, effortLevels: null, structuredOutputs: false })
    expect(lookupModel('anthropic', 'claude-next').capabilities.structuredOutputs).toBe(true)
  })

  it('covers the design 8.2 matrix and the P0.13 rows', () => {
    for (const [provider, id] of [
      ['anthropic', 'claude-sonnet-5-5'],
      ['anthropic', 'claude-haiku-5-5'],
      ['anthropic', 'claude-opus-5-5'],
      ['openai', 'gpt-6.1-sol'],
      ['openai', 'gpt-6-sol'],
      ['openai', 'gpt-6-luna'],
      ['openai', 'gpt-6-astra'],
      ['google', 'gemini-4-argon'],
      ['openai', 'gpt-5.4-mini'],
      ['openai', 'gpt-4o'],
    ] as const) {
      expect(lookupModel(provider, id).known).toBe(true)
    }
  })

  it('lists known models by provider', () => {
    expect(listKnownModels('anthropic').map((m) => m.id)).toContain('claude-sonnet-5-5')
    expect(listKnownModels('anthropic').every((m) => m.provider === 'anthropic')).toBe(true)
    expect(listKnownModels()).toHaveLength(MODEL_CATALOG.length)
  })
})

describe('catalogue entries', () => {
  it('every price has an asOf date', () => {
    for (const info of MODEL_CATALOG) {
      expect(info.pricing).not.toBeNull()
      for (const entry of info.pricing ?? []) {
        expect(entry.asOf).toBe('2026-10-17')
      }
    }
  })

  it('has one entry per provider and id', () => {
    const keys = MODEL_CATALOG.map((m) => `${m.provider}:${m.id}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('takes no sampling parameters on Claude 5.x or the reasoning models', () => {
    expect(lookupModel('anthropic', 'claude-sonnet-5-5').capabilities.samplingParams).toBe(false)
    expect(lookupModel('openai', 'gpt-6-luna').capabilities.samplingParams).toBe(false)
    expect(lookupModel('openai', 'gpt-4o').capabilities.samplingParams).toBe(true)
  })

  it('marks the 2026-10-23 retirements', () => {
    expect(lookupModel('openai', 'o4-mini').retiresOn).toBe('2026-10-23')
    expect(lookupModel('openai', 'gpt-4').retiresOn).toBe('2026-10-23')
  })
})

describe('resolveEffort', () => {
  it('keeps an accepted level and raises an unsupported one', () => {
    expect(resolveEffort(lookupModel('anthropic', 'claude-sonnet-5-5'), 'low')).toBe('low')
    expect(resolveEffort(lookupModel('openai', 'gpt-6.1-sol'), 'none')).toBe('low')
    expect(resolveEffort(lookupModel('openai', 'gpt-5.5-pro'), 'max')).toBe('high')
  })

  it('returns null for a model with no effort control', () => {
    expect(resolveEffort(lookupModel('openai', 'gpt-4o'), 'low')).toBeNull()
    expect(resolveEffort(lookupModel('openai-compatible', 'llama'), 'low')).toBeNull()
  })
})

describe('costUsd', () => {
  it('prices uncached input, cached input and output including reasoning', () => {
    const info = lookupModel('openai', 'gpt-6-sol')
    // 1M uncached at $2, 1M cached at $0.20, 1M output (400K of it reasoning) at $10
    const cost = costUsd(info, usage({ inputTokens: 2 * MILLION, cachedInputTokens: MILLION, outputTokens: MILLION, reasoningTokens: 400_000 }))
    expect(cost).toBeCloseTo(12.2, 10)
  })

  it.each([
    ['gpt-6-astra', 10, 1, 50],
    ['gpt-6.1-sol', 2, 0.1, 10],
    ['gpt-6-sol', 2, 0.2, 10],
    ['gpt-6-luna', 0.1, 0.01, 0.5],
  ])('carries over the GPT-6 price of %s', (model, input, cached, output) => {
    const cost = costUsd(lookupModel('openai', model), usage({ inputTokens: 2 * MILLION, cachedInputTokens: MILLION, outputTokens: MILLION }))
    expect(cost).toBeCloseTo(input + cached + output, 10)
  })

  it('prices Anthropic cache writes', () => {
    const info = lookupModel('anthropic', 'claude-sonnet-5-5')
    const cost = costUsd(info, usage({ inputTokens: 2 * MILLION, cacheWriteTokens: MILLION, outputTokens: 0 }))
    expect(cost).toBeCloseTo(2 + 2.5, 10)
  })

  it('costs an unknown model 0 with exactly one warning', () => {
    const cost = costUsd(lookupModel('openai-compatible', 'qwen3.6:27b'), usage({ inputTokens: MILLION, outputTokens: MILLION }))
    expect(cost).toBe(0)
    expect(mockWarn).toHaveBeenCalledTimes(1)
    expect(mockWarn).toHaveBeenCalledWith('Unknown model price', { provider: 'openai-compatible', model: 'qwen3.6:27b' })
  })

  it('does not warn for a known model', () => {
    costUsd(lookupModel('openai', 'gpt-4o'), usage({ inputTokens: 1000 }))
    expect(mockWarn).not.toHaveBeenCalled()
  })

  it('changes the Gemini 4 Argon price on 2026-12-01', () => {
    const info = lookupModel('google', 'gemini-4-argon')
    const tokens = usage({ inputTokens: MILLION, outputTokens: MILLION })
    expect(costUsd(info, tokens, new Date('2026-11-30T23:59:59Z'))).toBeCloseTo(12, 10)
    expect(costUsd(info, tokens, new Date('2026-12-01T00:00:00Z'))).toBeCloseTo(24, 10)
    expect(priceAt(info, new Date('2026-12-02'))?.cacheRead).toBe(0.2)
  })
})

describe('estimateCostUsd', () => {
  it('matches the documented example', () => {
    const estimate = estimateCostUsd({ provider: 'openai', model: 'gpt-6-luna', prompt: 'x'.repeat(4000), completionTokens: 2000 })
    expect(estimate).toMatchObject({ promptTokens: 1000, estimatedCompletionTokens: 2000, totalTokens: 3000 })
    expect(estimate.cost).toBeCloseTo(0.0011, 10)
  })

  it('counts the system prompt and defaults to 6000 completion tokens', () => {
    const estimate = estimateCostUsd({ provider: 'openai', model: 'gpt-4o', prompt: 'abcd', systemPrompt: 'abcd' })
    expect(estimate.promptTokens).toBe(3)
    expect(estimate.estimatedCompletionTokens).toBe(6000)
  })
})

describe('budgetModelFor', () => {
  it("names each first-party provider's repair and economy model, and none for the rest", () => {
    expect(budgetModelFor('anthropic')).toBe('claude-haiku-5-5')
    expect(budgetModelFor('openai')).toBe('gpt-6-luna')
    expect(budgetModelFor('google')).toBeNull()
    expect(budgetModelFor('openai-compatible')).toBeNull()
    expect(lookupModel('anthropic', budgetModelFor('anthropic')!).known).toBe(true)
  })
})
