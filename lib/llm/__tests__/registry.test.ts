/**
 * @jest-environment node
 *
 * Tests for lib/llm/registry.ts, and the request the OpenAI provider builds
 * for the v2 schema (RWP-15 pitfall).
 */

import { mockReset } from 'jest-mock-extended'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import type { LLMProvider } from '@/lib/generated/prisma/client'
import { generateStructured } from '@/lib/llm/generate-structured'
import { OPENAI_COMPATIBLE_PRESETS } from '@/lib/llm/provider-presets'
import { getLanguageModel, LLMConfigError, resolveModel } from '@/lib/llm/registry'
import { recordUsage } from '@/lib/llm/usage'
import { buildValidOutput } from '@/lib/wrapped/__tests__/fixtures'
import { wrappedLLMOutputSchema } from '@/lib/wrapped/llm-output-schema'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/llm/usage', () => ({ recordUsage: jest.fn() }))

beforeEach(() => mockReset(prismaMock))

function row(overrides: Partial<LLMProvider> = {}): LLMProvider {
  return {
    id: 'row-1',
    provider: 'openai',
    purpose: 'wrapped',
    apiKey: 'sk-test',
    model: 'gpt-6-luna',
    temperature: null,
    maxTokens: null,
    baseUrl: null,
    effort: null,
    isActive: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  }
}

/** The provider and model id the SDK model reports. */
function describeModel(model: unknown) {
  const { provider, modelId } = model as { provider: string; modelId: string }
  return { provider, modelId }
}

describe('resolveModel', () => {
  it.each([
    ['openai', 'gpt-6-luna', 'openai.responses'],
    ['anthropic', 'claude-sonnet-5-5', 'anthropic.messages'],
    ['google', 'gemini-4-argon', 'google.generative-ai'],
  ] as const)('builds a %s model', (provider, model, sdkProvider) => {
    const resolved = resolveModel(row({ id: `row-${provider}`, provider, model }))

    expect(describeModel(resolved.model)).toEqual({ provider: sdkProvider, modelId: model })
    expect(resolved.info).toMatchObject({ provider, id: model, known: true })
  })

  it('builds an openai-compatible chat model on the base URL', () => {
    const resolved = resolveModel(
      row({ id: 'row-ollama', provider: 'openai-compatible', model: 'qwen3.6:27b', apiKey: '', baseUrl: OPENAI_COMPATIBLE_PRESETS.ollama.baseUrl })
    )

    expect(describeModel(resolved.model)).toEqual({ provider: 'openai-compatible.chat', modelId: 'qwen3.6:27b' })
    expect(resolved.info).toMatchObject({ known: false, pricing: null })
  })

  it('throws for openai-compatible without a base URL', () => {
    expect(() => resolveModel(row({ id: 'row-no-url', provider: 'openai-compatible', model: 'llama' }))).toThrow(LLMConfigError)
  })

  it('throws for an unknown provider or a missing model', () => {
    expect(() => resolveModel(row({ id: 'row-x', provider: 'mistral' }))).toThrow('Unsupported LLM provider: mistral')
    expect(() => resolveModel(row({ id: 'row-y', model: '' }))).toThrow('No model is configured')
  })

  it('uses an override model on the same provider', () => {
    expect(describeModel(resolveModel(row(), 'gpt-4o').model).modelId).toBe('gpt-4o')
  })

  it('offers the four presets', () => {
    expect(Object.values(OPENAI_COMPATIBLE_PRESETS).map((p) => p.baseUrl)).toEqual([
      'http://localhost:11434/v1',
      'http://localhost:1234/v1',
      'http://localhost:8000/v1',
      'https://openrouter.ai/api/v1',
    ])
  })
})

describe('getLanguageModel', () => {
  it('reads the active row for the purpose', async () => {
    prismaMock.lLMProvider.findFirst.mockResolvedValue(row({ purpose: 'chat' }))

    const resolved = await getLanguageModel('chat', { model: 'gpt-6-sol' })

    expect(prismaMock.lLMProvider.findFirst).toHaveBeenCalledWith({ where: { isActive: true, purpose: 'chat' } })
    expect(resolved?.info.id).toBe('gpt-6-sol')
    expect(resolved?.row.purpose).toBe('chat')
  })

  it('returns null when no row is active', async () => {
    prismaMock.lLMProvider.findFirst.mockResolvedValue(null)
    expect(await getLanguageModel('wrapped')).toBeNull()
  })
})

describe('the OpenAI request for the v2 schema', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('is a strict Responses API json_schema with every key required and no extra properties', async () => {
    const output = buildValidOutput()
    // A Responses API reply as recorded from gpt-6-luna, trimmed to the fields the provider reads
    const recorded = {
      id: 'resp_1',
      object: 'response',
      created_at: 1760000000,
      status: 'completed',
      model: 'gpt-6-luna-2026-09-22',
      output: [
        {
          type: 'message',
          id: 'msg_1',
          status: 'completed',
          role: 'assistant',
          content: [{ type: 'output_text', text: JSON.stringify(output), annotations: [] }],
        },
      ],
      incomplete_details: null,
      usage: {
        input_tokens: 3000,
        input_tokens_details: { cached_tokens: 1024 },
        output_tokens: 900,
        output_tokens_details: { reasoning_tokens: 300 },
        total_tokens: 3900,
      },
    }
    const fetchMock = jest.fn(async () => new Response(JSON.stringify(recorded), { headers: { 'content-type': 'application/json' } }))
    global.fetch = fetchMock as unknown as typeof fetch
    prismaMock.lLMProvider.findFirst.mockResolvedValue(row({ id: 'row-request', temperature: 0.7, maxTokens: 6000 }))

    const result = await generateStructured({
      purpose: 'wrapped',
      schema: wrappedLLMOutputSchema,
      system: 'system',
      prompt: 'prompt',
      effort: 'low',
      cacheKey: 'rewind-v2',
      attribution: { userId: 'user-1' },
    })

    expect(result.ok).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/responses')
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      model: 'gpt-6-luna',
      max_output_tokens: 6000,
      reasoning: { effort: 'low' },
      prompt_cache_key: 'rewind-v2',
      text: { format: { type: 'json_schema', strict: true } },
    })
    expect(body).not.toHaveProperty('temperature')
    const schema = body.text.format.schema
    expect(schema.additionalProperties).toBe(false)
    expect(schema.required).toEqual(['archetype', 'narratives', 'insights', 'summary'])
    expect(schema.properties.narratives.required).toContain('percentile')
    // What the provider sends of the Zod constraints (RWP-15): strict mode on
    // OpenAI has accepted these since v2 shipped
    expect(schema.properties.summary).toEqual({ type: 'string', minLength: 1 })
    expect(recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'gpt-6-luna-2026-09-22',
        usage: expect.objectContaining({ inputTokens: 3000, cachedInputTokens: 1024, reasoningTokens: 300 }),
      })
    )
  })
})
