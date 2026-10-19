/**
 * @jest-environment node
 *
 * Tests for lib/llm/chat.ts on the AI SDK's mock language model.
 */

import type { ModelMessage } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'

import type { LLMProvider } from '@/lib/generated/prisma/client'
import { chatWithTools, type ChatTool } from '@/lib/llm/chat'
import { lookupModel, type LLMProviderId } from '@/lib/llm/models'
import { getLanguageModel, LLMConfigError } from '@/lib/llm/registry'
import { recordUsage } from '@/lib/llm/usage'

jest.mock('@/lib/llm/registry', () => {
  class MockLLMConfigError extends Error {}
  return { getLanguageModel: jest.fn(), LLMConfigError: MockLLMConfigError }
})
jest.mock('@/lib/llm/usage', () => ({ recordUsage: jest.fn() }))

const mockGetLanguageModel = getLanguageModel as jest.MockedFunction<typeof getLanguageModel>

type GenerateResult = Awaited<ReturnType<MockLanguageModelV4['doGenerate']>>

const USAGE: GenerateResult['usage'] = {
  inputTokens: { total: 1000, noCache: 1000, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 100, text: 60, reasoning: 40 },
}

function generated(content: GenerateResult['content'], unified: GenerateResult['finishReason']['unified'] = 'stop'): GenerateResult {
  return {
    content,
    finishReason: { unified, raw: unified },
    usage: USAGE,
    warnings: [],
    response: { id: 'resp-1', modelId: 'claude-sonnet-5-5', timestamp: new Date(0) },
  }
}

function useModel(model: MockLanguageModelV4, provider: LLMProviderId, id: string, overrides: Partial<LLMProvider> = {}) {
  const row: LLMProvider = {
    id: 'row-1',
    provider,
    purpose: 'chat',
    apiKey: 'key',
    model: id,
    temperature: 0.7,
    maxTokens: 1000,
    baseUrl: null,
    effort: null,
    isActive: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  }
  mockGetLanguageModel.mockResolvedValue({ model, info: lookupModel(provider, id), row })
}

// A registry tool carries Discord metadata the provider must never see
const REGISTERED = [
  {
    type: 'function',
    function: {
      name: 'get_sonarr_status',
      description: 'Sonarr status',
      parameters: { type: 'object', properties: { verbose: { type: 'boolean' } } },
    },
    discordSafe: true,
    discordFields: ['version'],
  },
] as const
const TOOLS: ChatTool[] = REGISTERED.map((registered) => ({ ...registered, function: { ...registered.function } }))

const attribution = { userId: 'user-1', chatConversationId: 'conv-1' }

beforeEach(() => jest.clearAllMocks())

describe('chatWithTools', () => {
  it('round-trips a tool call: returns it, then sends the result back on the next turn', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: jest
        .fn()
        .mockResolvedValueOnce(
          generated(
            [{ type: 'tool-call', toolCallId: 'call-1', toolName: 'get_sonarr_status', input: '{"verbose":true}' }],
            'tool-calls'
          )
        )
        .mockResolvedValueOnce(generated([{ type: 'text', text: 'Sonarr is up' }])),
    })
    useModel(model, 'openai', 'gpt-6-sol')
    const history: ModelMessage[] = [{ role: 'user', content: 'Is Sonarr up?' }]

    const first = await chatWithTools({ system: 'You help.', messages: history, tools: TOOLS, attribution })

    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.toolCalls).toEqual([
      { id: 'call-1', type: 'function', function: { name: 'get_sonarr_status', arguments: '{"verbose":true}' } },
    ])
    const sentTools = model.doGenerateCalls[0].tools
    expect(sentTools).toEqual([
      expect.objectContaining({
        type: 'function',
        name: 'get_sonarr_status',
        description: 'Sonarr status',
        inputSchema: TOOLS[0].function.parameters,
      }),
    ])
    expect(JSON.stringify(sentTools)).not.toContain('discord')

    history.push(...first.responseMessages, {
      role: 'tool',
      content: [
        { type: 'tool-result', toolCallId: 'call-1', toolName: 'get_sonarr_status', output: { type: 'text', value: '{"version":"4"}' } },
      ],
    })
    const second = await chatWithTools({ system: 'You help.', messages: history, tools: TOOLS, attribution })

    expect(second).toMatchObject({ ok: true, content: 'Sonarr is up', toolCalls: [] })
    const prompt = model.doGenerateCalls[1].prompt
    expect(prompt[0]).toEqual({ role: 'system', content: 'You help.' })
    expect(prompt.at(-2)).toMatchObject({ role: 'assistant', content: [expect.objectContaining({ type: 'tool-call', toolCallId: 'call-1' })] })
    expect(prompt.at(-1)).toMatchObject({ role: 'tool', content: [expect.objectContaining({ type: 'tool-result', toolCallId: 'call-1' })] })
    expect(recordUsage).toHaveBeenCalledTimes(2)
  })

  it('works on an Anthropic row: effort from the row, no temperature, usage priced and attributed', async () => {
    const model = new MockLanguageModelV4({ doGenerate: generated([{ type: 'text', text: 'Hello' }]) })
    useModel(model, 'anthropic', 'claude-sonnet-5-5', { effort: 'low' })

    const result = await chatWithTools({ system: 's', messages: [{ role: 'user', content: 'Hi' }], tools: TOOLS, attribution })

    expect(result).toMatchObject({ ok: true, content: 'Hello', modelId: 'claude-sonnet-5-5' })
    const call = model.doGenerateCalls[0]
    expect(call.temperature).toBeUndefined()
    expect(call.maxOutputTokens).toBe(1000)
    expect(call.providerOptions).toEqual({ anthropic: { effort: 'low' } })
    expect(recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        attribution,
        provider: 'anthropic',
        modelId: 'claude-sonnet-5-5',
        // 1000 input at $2 and 100 output at $10 per 1M
        cost: expect.closeTo(0.002 + 0.001, 10),
        outcome: 'ok',
      })
    )
  })

  it('keeps temperature for a model that takes it', async () => {
    const model = new MockLanguageModelV4({ doGenerate: generated([{ type: 'text', text: 'ok' }]) })
    useModel(model, 'openai', 'gpt-4o')

    await chatWithTools({ system: 's', messages: [{ role: 'user', content: 'Hi' }], tools: TOOLS, attribution })

    expect(model.doGenerateCalls[0].temperature).toBe(0.7)
  })

  it('reports a missing or broken provider row as a configuration error', async () => {
    mockGetLanguageModel.mockResolvedValueOnce(null)
    expect(await chatWithTools({ system: 's', messages: [], tools: TOOLS, attribution })).toMatchObject({
      ok: false,
      configurationError: true,
    })

    mockGetLanguageModel.mockRejectedValueOnce(new LLMConfigError('An OpenAI-compatible provider needs a base URL'))
    expect(await chatWithTools({ system: 's', messages: [], tools: TOOLS, attribution })).toEqual({
      ok: false,
      error: 'An OpenAI-compatible provider needs a base URL',
      configurationError: true,
    })
  })

  it('refuses tools on a model without tool support', async () => {
    const model = new MockLanguageModelV4({ doGenerate: generated([]) })
    mockGetLanguageModel.mockResolvedValue({
      model,
      info: { ...lookupModel('openai', 'gpt-4o'), capabilities: { ...lookupModel('openai', 'gpt-4o').capabilities, tools: false } },
      row: { effort: null, temperature: null, maxTokens: null } as LLMProvider,
    })

    const result = await chatWithTools({ system: 's', messages: [], tools: TOOLS, attribution })

    expect(result).toMatchObject({ ok: false, configurationError: true })
    expect(model.doGenerateCalls).toHaveLength(0)
  })

  it('keeps provider errors generic, with only the status', async () => {
    const { APICallError } = jest.requireActual<typeof import('ai')>('ai')
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new APICallError({
          message: 'upstream detail with secret',
          url: 'https://api.openai.com/v1/responses',
          requestBodyValues: {},
          statusCode: 400,
          isRetryable: false,
        })
      },
    })
    useModel(model, 'openai', 'gpt-6-sol')

    const result = await chatWithTools({ system: 's', messages: [{ role: 'user', content: 'Hi' }], tools: TOOLS, attribution })

    expect(result).toEqual({ ok: false, error: 'The LLM provider returned HTTP 400' })
    expect(recordUsage).not.toHaveBeenCalled()
  })
})
