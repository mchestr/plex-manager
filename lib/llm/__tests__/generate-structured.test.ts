/**
 * @jest-environment node
 *
 * Tests for lib/llm/generate-structured.ts on the AI SDK's mock language model.
 */

import { APICallError } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { z } from 'zod'

import type { LLMProvider } from '@/lib/generated/prisma/client'
import { generateStructured } from '@/lib/llm/generate-structured'
import { lookupModel, type LLMProviderId } from '@/lib/llm/models'
import { getLanguageModel, LLMConfigError } from '@/lib/llm/registry'
import { recordUsage } from '@/lib/llm/usage'

jest.mock('@/lib/llm/registry', () => {
  class MockLLMConfigError extends Error {}
  return { getLanguageModel: jest.fn(), LLMConfigError: MockLLMConfigError }
})
jest.mock('@/lib/llm/usage', () => ({ recordUsage: jest.fn() }))

const mockGetLanguageModel = getLanguageModel as jest.MockedFunction<typeof getLanguageModel>
const mockRecordUsage = recordUsage as jest.MockedFunction<typeof recordUsage>

const schema = z.object({ title: z.string().min(1), score: z.number() })

type GenerateResult = Awaited<ReturnType<MockLanguageModelV4['doGenerate']>>

const USAGE: GenerateResult['usage'] = {
  inputTokens: { total: 1000, noCache: 600, cacheRead: 400, cacheWrite: 0 },
  outputTokens: { total: 500, text: 300, reasoning: 200 },
}

function reply(text: string, unified: GenerateResult['finishReason']['unified'] = 'stop', raw: string = unified): GenerateResult {
  return {
    content: text ? [{ type: 'text', text }] : [],
    finishReason: { unified, raw },
    usage: USAGE,
    warnings: [],
    response: { id: 'resp-1', modelId: 'gpt-6-luna-2026-09-22', timestamp: new Date(0) },
  }
}

function row(provider: LLMProviderId, model: string, overrides: Partial<LLMProvider> = {}): LLMProvider {
  return {
    id: 'row-1',
    provider,
    purpose: 'wrapped',
    apiKey: 'key',
    model,
    temperature: 0.8,
    maxTokens: 1800,
    baseUrl: null,
    effort: null,
    isActive: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  }
}

function useModel(model: MockLanguageModelV4, provider: LLMProviderId = 'openai', id = 'gpt-6-luna', overrides?: Partial<LLMProvider>) {
  mockGetLanguageModel.mockResolvedValue({ model, info: lookupModel(provider, id), row: row(provider, id, overrides) })
}

const base = {
  purpose: 'wrapped' as const,
  schema,
  system: 'You write titles.',
  prompt: 'Write one.',
  effort: 'low' as const,
  cacheKey: 'rewind-v2',
  attribution: { userId: 'user-1', wrappedId: 'wrapped-1' },
}

beforeEach(() => jest.clearAllMocks())

describe('generateStructured', () => {
  it('returns the parsed output and records one row with the served model, cached and reasoning tokens', async () => {
    useModel(new MockLanguageModelV4({ doGenerate: reply('{"title":"Hi","score":3}') }))

    const result = await generateStructured(base)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.output).toEqual({ title: 'Hi', score: 3 })
    expect(result.value.modelId).toBe('gpt-6-luna-2026-09-22')
    expect(result.value.usage).toMatchObject({ inputTokens: 1000, cachedInputTokens: 400, outputTokens: 500, reasoningTokens: 200 })
    // 600 uncached at $0.10, 400 cached at $0.01, 500 output at $0.50 per 1M
    expect(result.value.cost).toBeCloseTo((600 * 0.1 + 400 * 0.01 + 500 * 0.5) / 1e6, 12)
    expect(mockRecordUsage).toHaveBeenCalledTimes(1)
    expect(mockRecordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openai',
        modelId: 'gpt-6-luna-2026-09-22',
        outcome: 'ok',
        attribution: base.attribution,
        prompt: null,
        response: null,
      })
    )
  })

  it('returns TRUNCATED on length and still records the billed attempt', async () => {
    useModel(new MockLanguageModelV4({ doGenerate: reply('{"title":"Hi","sc', 'length', 'max_output_tokens') }))

    const result = await generateStructured(base)

    expect(result).toMatchObject({ ok: false, error: { code: 'TRUNCATED', modelId: 'gpt-6-luna-2026-09-22' } })
    expect(mockRecordUsage).toHaveBeenCalledTimes(1)
    expect(mockRecordUsage.mock.calls[0][0]).toMatchObject({ outcome: 'length', usage: { reasoningTokens: 200 } })
  })

  it('returns SCHEMA with the raw text on invalid output, recorded as a billed failure', async () => {
    useModel(new MockLanguageModelV4({ doGenerate: reply('{"title":"","score":"high"}') }))

    const result = await generateStructured({ ...base, recordText: true })

    expect(result).toMatchObject({ ok: false, error: { code: 'SCHEMA', rawText: '{"title":"","score":"high"}' } })
    expect(mockRecordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'schema', prompt: 'Write one.', response: '{"title":"","score":"high"}' })
    )
  })

  it('maps a refusal and a content filter to their own codes', async () => {
    useModel(new MockLanguageModelV4({ doGenerate: reply('', 'content-filter', 'refusal') }), 'anthropic', 'claude-sonnet-5-5')
    expect(await generateStructured(base)).toMatchObject({ ok: false, error: { code: 'REFUSAL' } })
    expect(mockRecordUsage.mock.calls[0][0].outcome).toBe('refusal')

    useModel(new MockLanguageModelV4({ doGenerate: reply('', 'content-filter', 'content_filter') }))
    expect(await generateStructured(base)).toMatchObject({ ok: false, error: { code: 'CONTENT_FILTER' } })
    expect(mockRecordUsage.mock.calls[1][0].outcome).toBe('content-filter')
  })

  it('drops temperature for claude-sonnet-5-5 and sets Anthropic effort and system cache control', async () => {
    const model = new MockLanguageModelV4({ doGenerate: reply('{"title":"Hi","score":3}') })
    useModel(model, 'anthropic', 'claude-sonnet-5-5')

    await generateStructured(base)

    const call = model.doGenerateCalls[0]
    expect(call.temperature).toBeUndefined()
    expect(call.maxOutputTokens).toBe(1800)
    expect(call.providerOptions?.anthropic).toEqual({ effort: 'low' })
    expect(call.prompt[0]).toMatchObject({
      role: 'system',
      content: 'You write titles.',
      providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
    })
    expect(call.responseFormat).toMatchObject({ type: 'json' })
  })

  it('keeps temperature for gpt-4o and sets the OpenAI prompt cache key without an effort', async () => {
    const model = new MockLanguageModelV4({ doGenerate: reply('{"title":"Hi","score":3}') })
    useModel(model, 'openai', 'gpt-4o')

    await generateStructured({ ...base, maxOutputTokens: 50 })

    const call = model.doGenerateCalls[0]
    expect(call.temperature).toBe(0.8)
    expect(call.maxOutputTokens).toBe(50)
    expect(call.providerOptions?.openai).toEqual({ promptCacheKey: 'rewind-v2' })
  })

  it('maps effort onto each provider option', async () => {
    const model = new MockLanguageModelV4({ doGenerate: reply('{"title":"Hi","score":3}') })
    useModel(model, 'openai', 'gpt-6.1-sol')
    await generateStructured({ ...base, effort: 'none' })
    expect(model.doGenerateCalls[0].providerOptions?.openai).toEqual({ reasoningEffort: 'low', promptCacheKey: 'rewind-v2' })

    useModel(model, 'google', 'gemini-4-argon')
    await generateStructured(base)
    expect(model.doGenerateCalls[1].providerOptions?.google).toEqual({ thinkingConfig: { thinkingLevel: 'low' } })
    expect(model.doGenerateCalls[1].temperature).toBe(0.8)
  })

  it("uses the admin's effort from the provider row over the caller's default", async () => {
    const model = new MockLanguageModelV4({ doGenerate: reply('{"title":"Hi","score":3}') })
    useModel(model, 'anthropic', 'claude-sonnet-5-5', { effort: 'high' })

    await generateStructured(base)

    expect(model.doGenerateCalls[0].providerOptions?.anthropic).toEqual({ effort: 'high' })
  })

  it('stops on abort and records nothing', async () => {
    const controller = new AbortController()
    let started: () => void = () => {}
    const inFlight = new Promise<void>((resolve) => (started = resolve))
    const model = new MockLanguageModelV4({
      doGenerate: ({ abortSignal }) =>
        new Promise((_, reject) => {
          abortSignal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
          started()
        }),
    })
    useModel(model)

    const pending = generateStructured({ ...base, signal: controller.signal })
    await inFlight
    controller.abort()

    expect(await pending).toMatchObject({ ok: false, error: { code: 'ABORTED' } })
    expect(mockRecordUsage).not.toHaveBeenCalled()
  })

  it('retries a 429 and records one row for the 200', async () => {
    let calls = 0
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        calls++
        if (calls === 1) {
          throw new APICallError({
            message: 'Rate limited',
            url: 'https://api.openai.com/v1/responses',
            requestBodyValues: {},
            statusCode: 429,
            responseHeaders: { 'retry-after-ms': '1' },
            isRetryable: true,
          })
        }
        return reply('{"title":"Hi","score":3}')
      },
    })
    useModel(model)

    const result = await generateStructured(base)

    expect(result.ok).toBe(true)
    expect(calls).toBe(2)
    expect(mockRecordUsage).toHaveBeenCalledTimes(1)
  })

  it('returns PROVIDER with the status and no upstream body when the provider keeps failing', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new APICallError({
          message: 'Incorrect API key provided: sk-secret',
          url: 'https://api.openai.com/v1/responses',
          requestBodyValues: {},
          statusCode: 401,
          isRetryable: false,
        })
      },
    })
    useModel(model)

    const result = await generateStructured(base)

    expect(result).toEqual({ ok: false, error: { code: 'PROVIDER', message: 'The LLM provider returned an error (HTTP 401)' } })
    expect(mockRecordUsage).not.toHaveBeenCalled()
  })

  it('returns NOT_CONFIGURED with no active row or an unusable one', async () => {
    mockGetLanguageModel.mockResolvedValue(null)
    expect(await generateStructured(base)).toMatchObject({ ok: false, error: { code: 'NOT_CONFIGURED' } })

    mockGetLanguageModel.mockRejectedValue(new LLMConfigError('An OpenAI-compatible provider needs a base URL'))
    expect(await generateStructured(base)).toMatchObject({
      ok: false,
      error: { code: 'NOT_CONFIGURED', message: 'An OpenAI-compatible provider needs a base URL' },
    })
  })
})
