/**
 * Tests for lib/llm/openai-params.ts - shared OpenAI model capabilities
 */

import {
  buildOpenAIParams,
  type ChatToolSupport,
  DEFAULT_OPENAI_MODEL,
  normalizeOpenAIModelId,
  openAIModelCaps,
} from '@/lib/llm/openai-params'

type Row = [
  model: string,
  tokenParam: 'max_tokens' | 'max_completion_tokens',
  acceptsTemperature: boolean,
  structuredOutputs: boolean,
  chatTools: ChatToolSupport,
]

const TABLE: Row[] = [
  ['gpt-6-astra', 'max_completion_tokens', false, true, 'responses-only'],
  ['gpt-6.1-sol', 'max_completion_tokens', false, true, 'responses-only'],
  ['gpt-6-sol', 'max_completion_tokens', false, true, 'reasoning-none'],
  ['gpt-6-luna', 'max_completion_tokens', false, true, 'reasoning-none'],
  ['o4-mini', 'max_completion_tokens', false, true, 'yes'],
  ['o3', 'max_completion_tokens', false, true, 'yes'],
  ['gpt-5.4-mini', 'max_completion_tokens', false, true, 'yes'],
  ['gpt-5.5', 'max_completion_tokens', false, true, 'yes'],
  ['gpt-4.1-mini', 'max_tokens', true, true, 'yes'],
  ['gpt-4o', 'max_tokens', true, true, 'yes'],
  ['gpt-4o-mini-2024-07-18', 'max_tokens', true, true, 'yes'],
  ['gpt-4-turbo', 'max_tokens', true, false, 'yes'],
  ['gpt-3.5-turbo', 'max_tokens', true, false, 'yes'],
  ['gpt-5.2-mini', 'max_completion_tokens', false, true, 'yes'],
  ['openai/gpt-6-sol-2026-09-22', 'max_completion_tokens', false, true, 'reasoning-none'],
]

describe('openAIModelCaps', () => {
  it.each(TABLE)(
    '%s → %s, temperature %s, structured outputs %s, tools %s',
    (model, tokenParam, acceptsTemperature, structuredOutputs, chatTools) => {
      expect(openAIModelCaps(model)).toEqual({
        tokenParam,
        acceptsTemperature,
        structuredOutputs,
        chatTools,
      })
    }
  )

  it('treats legacy chat models as non-reasoning without structured outputs', () => {
    expect(openAIModelCaps('gpt-4')).toEqual({
      tokenParam: 'max_tokens',
      acceptsTemperature: true,
      structuredOutputs: false,
      chatTools: 'yes',
    })
    expect(openAIModelCaps('o1').structuredOutputs).toBe(false)
    expect(openAIModelCaps('o1').tokenParam).toBe('max_completion_tokens')
  })

  it('ignores case, the openai/ prefix and a dated snapshot suffix', () => {
    expect(normalizeOpenAIModelId('openai/GPT-6-Sol-2026-09-22')).toBe('gpt-6-sol')
    expect(normalizeOpenAIModelId(' OpenAI/GPT-6.1-Sol-2026-09-29 ')).toBe('gpt-6.1-sol')
    expect(openAIModelCaps('GPT-6-ASTRA').chatTools).toBe('responses-only')
    expect(openAIModelCaps('gpt-4o-mini-2024-07-18').tokenParam).toBe('max_tokens')
  })
})

describe('buildOpenAIParams', () => {
  it.each(TABLE)('%s uses %s and sends temperature only when accepted', (model, tokenParam, acceptsTemperature) => {
    const params = buildOpenAIParams(model, { temperature: 0.8, maxTokens: 6000 })

    expect(params[tokenParam]).toBe(6000)
    expect(Object.keys(params)).toHaveLength(acceptsTemperature ? 2 : 1)
    if (acceptsTemperature) {
      expect(params.temperature).toBe(0.8)
    } else {
      expect(params).not.toHaveProperty('temperature')
    }
  })

  it.each(TABLE)('%s with tools follows the tool rule', (model, _tokenParam, _temp, _structured, chatTools) => {
    const params = buildOpenAIParams(model, { hasTools: true })

    if (chatTools === 'reasoning-none') {
      expect(params).toEqual({ reasoning_effort: 'none' })
    } else {
      expect(params).not.toHaveProperty('reasoning_effort')
    }
  })

  it('leaves out options that are not set', () => {
    expect(buildOpenAIParams('gpt-4o', {})).toEqual({})
    expect(buildOpenAIParams('gpt-6-luna', { hasTools: false })).toEqual({})
  })

  it('matches the documented examples', () => {
    expect(buildOpenAIParams('gpt-4o', { temperature: 0.8, maxTokens: 6000 })).toEqual({
      max_tokens: 6000,
      temperature: 0.8,
    })
    expect(buildOpenAIParams('gpt-6-sol', { temperature: 0.8, maxTokens: 1000, hasTools: true })).toEqual({
      max_completion_tokens: 1000,
      reasoning_effort: 'none',
    })
  })
})

describe('DEFAULT_OPENAI_MODEL', () => {
  it('is a current model that handles structured outputs and Chat Completions tools', () => {
    expect(DEFAULT_OPENAI_MODEL).toBe('gpt-5.4-mini')
    const caps = openAIModelCaps(DEFAULT_OPENAI_MODEL)
    expect(caps.structuredOutputs).toBe(true)
    expect(caps.chatTools).toBe('yes')
  })
})
