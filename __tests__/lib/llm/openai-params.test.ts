/**
 * Tests for lib/llm/openai-params.ts - Chat Completions fields for the assistant
 */

import {
  buildOpenAIParams,
  type ChatToolSupport,
  DEFAULT_OPENAI_MODEL,
  openAIModelCaps,
} from '@/lib/llm/openai-params'
import { lookupModel } from '@/lib/llm/models'

type Row = [
  model: string,
  tokenParam: 'max_tokens' | 'max_completion_tokens',
  acceptsTemperature: boolean,
  chatTools: ChatToolSupport,
]

const TABLE: Row[] = [
  ['gpt-6-astra', 'max_completion_tokens', false, 'responses-only'],
  ['gpt-6.1-sol', 'max_completion_tokens', false, 'responses-only'],
  ['gpt-6-sol', 'max_completion_tokens', false, 'reasoning-none'],
  ['gpt-6-luna', 'max_completion_tokens', false, 'reasoning-none'],
  ['o4-mini', 'max_completion_tokens', false, 'yes'],
  ['o3', 'max_completion_tokens', false, 'yes'],
  ['gpt-5.4-mini', 'max_completion_tokens', false, 'yes'],
  ['gpt-5.5', 'max_completion_tokens', false, 'yes'],
  ['gpt-4.1-mini', 'max_tokens', true, 'yes'],
  ['gpt-4o', 'max_tokens', true, 'yes'],
  ['gpt-4o-mini-2024-07-18', 'max_tokens', true, 'yes'],
  ['gpt-4', 'max_tokens', true, 'yes'],
  ['openai/gpt-6-sol-2026-09-22', 'max_completion_tokens', false, 'reasoning-none'],
]

describe('openAIModelCaps', () => {
  it.each(TABLE)('%s → %s, temperature %s, tools %s', (model, tokenParam, acceptsTemperature, chatTools) => {
    expect(openAIModelCaps(model)).toEqual({ tokenParam, acceptsTemperature, chatTools })
  })

  it('treats an unknown model as a reasoning model with no temperature', () => {
    expect(openAIModelCaps('gpt-7-nova')).toEqual({
      tokenParam: 'max_completion_tokens',
      acceptsTemperature: false,
      chatTools: 'yes',
    })
  })

  it('ignores case, the openai/ prefix and a dated snapshot suffix', () => {
    expect(openAIModelCaps('GPT-6-ASTRA').chatTools).toBe('responses-only')
    expect(openAIModelCaps(' OpenAI/GPT-6.1-Sol-2026-09-29 ').chatTools).toBe('responses-only')
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

  it.each(TABLE)('%s with tools follows the tool rule', (model, _tokenParam, _temp, chatTools) => {
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
  it('is a current catalogue model that handles structured outputs and Chat Completions tools', () => {
    expect(DEFAULT_OPENAI_MODEL).toBe('gpt-5.4-mini')
    const info = lookupModel('openai', DEFAULT_OPENAI_MODEL)
    expect(info.known).toBe(true)
    expect(info.retiresOn).toBeNull()
    expect(info.capabilities.structuredOutputs).toBe(true)
    expect(openAIModelCaps(DEFAULT_OPENAI_MODEL).chatTools).toBe('yes')
  })
})
