/**
 * @jest-environment node
 *
 * Tests for lib/wrapped/llm.ts - v2 generation on the AI facade, with the
 * AI SDK's mock language model standing in for the provider.
 */

import { MockLanguageModelV4 } from 'ai/test'
import { mockReset } from 'jest-mock-extended'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { buildConfig } from '@/__tests__/helpers/factories'
import type { LLMProvider } from '@/lib/generated/prisma/client'
import { lookupModel } from '@/lib/llm/models'
import { getLanguageModel, LLMConfigError } from '@/lib/llm/registry'
import { buildValidOutput } from '@/lib/wrapped/__tests__/fixtures'
import { generateWrappedWithLLM } from '@/lib/wrapped/llm'
import { generateMockWrappedData } from '@/lib/wrapped/mock-data'
import { generateWrappedPrompt } from '@/lib/wrapped/prompt-template'
import { WrappedStatistics } from '@/types/wrapped'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

jest.mock('@/lib/llm/registry', () => ({
  ...jest.requireActual('@/lib/llm/registry'),
  getLanguageModel: jest.fn(),
}))

jest.mock('@/lib/wrapped/prompt-template', () => ({
  generateWrappedPrompt: jest.fn(),
  generateSystemPrompt: jest.fn(() => 'system prompt'),
}))

jest.mock('@/lib/wrapped/mock-data', () => ({
  generateMockWrappedData: jest.fn(),
}))

const mockGetLanguageModel = getLanguageModel as jest.MockedFunction<typeof getLanguageModel>

const mockStatistics: WrappedStatistics = {
  totalWatchTime: { total: 1000, movies: 500, shows: 500 },
  moviesWatched: 10,
  showsWatched: 5,
  episodesWatched: 50,
  topMovies: [],
  topShows: [],
  watchTimeByMonth: [],
}

const baseArgs = {
  promptName: 'Test User',
  displayName: 'Test User',
  year: 2024,
  userId: 'user-1',
  wrappedId: 'wrapped-1',
  statistics: mockStatistics,
}

type GenerateResult = Awaited<ReturnType<MockLanguageModelV4['doGenerate']>>

function reply(text: string, unified: GenerateResult['finishReason']['unified'] = 'stop'): GenerateResult {
  return {
    content: [{ type: 'text', text }],
    finishReason: { unified, raw: unified },
    usage: {
      inputTokens: { total: 1000, noCache: 1000, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 500, text: 400, reasoning: 100 },
    },
    warnings: [],
    response: { id: 'resp-1', modelId: 'gpt-6-luna-2026-09-22', timestamp: new Date(0) },
  }
}

function useModel(model: MockLanguageModelV4, overrides: Partial<LLMProvider> = {}) {
  const row: LLMProvider = {
    id: 'provider-1',
    provider: 'openai',
    purpose: 'wrapped',
    apiKey: 'test-key',
    model: 'gpt-6-luna',
    temperature: 0.8,
    maxTokens: null,
    baseUrl: null,
    effort: null,
    isActive: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  }
  mockGetLanguageModel.mockResolvedValue({ model, info: lookupModel('openai', row.model), row })
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ llmDisabled: false }))
  ;(generateWrappedPrompt as jest.Mock).mockResolvedValue('test prompt')
})

describe('generateWrappedWithLLM', () => {
  it('returns mock data when LLM is disabled and never calls a model', async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ llmDisabled: true }))
    const mockData = { sections: [], summary: 'Mock summary' }
    ;(generateMockWrappedData as jest.Mock).mockReturnValue(mockData)

    const result = await generateWrappedWithLLM(baseArgs)

    expect(result.success).toBe(true)
    expect(result.data).toEqual(mockData)
    expect(result.tokenUsage?.cost).toBe(0)
    expect(generateMockWrappedData).toHaveBeenCalledWith({
      promptName: 'Test User',
      displayName: 'Test User',
      year: 2024,
      userId: 'user-1',
      statistics: mockStatistics,
    })
    expect(mockGetLanguageModel).not.toHaveBeenCalled()
    expect(generateWrappedPrompt).not.toHaveBeenCalled()
    expect(prismaMock.lLMUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ provider: 'mock', model: 'mock', cost: 0, totalTokens: 0 }),
      })
    )
  })

  it('generates through the facade with the v2 schema, low effort and the rewind-v2 cache key', async () => {
    const mockOutput = buildValidOutput()
    const model = new MockLanguageModelV4({ doGenerate: reply(JSON.stringify(mockOutput)) })
    useModel(model)

    const result = await generateWrappedWithLLM(baseArgs)

    expect(result.success).toBe(true)
    expect(result.data?.version).toBe(2)
    expect(result.data?.archetype?.name).toBe('The Midnight Marathoner')
    expect(result.data?.summary).toBe(mockOutput.summary)
    const call = model.doGenerateCalls[0]
    expect(call.providerOptions?.openai).toEqual({ reasoningEffort: 'low', promptCacheKey: 'rewind-v2' })
    expect(call.temperature).toBeUndefined()
    expect(call.prompt[0]).toMatchObject({ role: 'system', content: 'system prompt' })
    expect(call.abortSignal).toBeDefined()
    // 1000 input at $0.10 and 500 output at $0.50 per 1M
    expect(result.tokenUsage).toEqual({ promptTokens: 1000, completionTokens: 500, totalTokens: 1500, cost: 0.00035 })
    expect(prismaMock.lLMUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          wrappedId: 'wrapped-1',
          provider: 'openai',
          model: 'gpt-6-luna-2026-09-22',
          prompt: 'test prompt',
          reasoningTokens: 100,
          outcome: 'ok',
        }),
      })
    )
  })

  it('sends only the prompt name to the model and stores the display name', async () => {
    useModel(new MockLanguageModelV4({ doGenerate: reply(JSON.stringify(buildValidOutput())) }))

    const result = await generateWrappedWithLLM({ ...baseArgs, promptName: 'there', displayName: 'member@example.com' })

    expect(result.success).toBe(true)
    expect(generateWrappedPrompt).toHaveBeenCalledWith('there', 2024, mockStatistics)
    expect(result.data?.userName).toBe('member@example.com')
  })

  it('gives the mock the prompt name for its copy and the display name to store', async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ llmDisabled: true }))
    const { generateMockWrappedData: realMock } =
      jest.requireActual<typeof import('@/lib/wrapped/mock-data')>('@/lib/wrapped/mock-data')
    ;(generateMockWrappedData as jest.Mock).mockImplementation(realMock)

    const result = await generateWrappedWithLLM({ ...baseArgs, promptName: 'there', displayName: 'Stored Name' })

    expect(result.data?.userName).toBe('Stored Name')
    expect(result.data?.archetype?.dedication).toContain('Hey there')
    expect(JSON.stringify(result.data?.sections)).not.toContain('Stored Name')
  })

  it('passes the caller signal through to the model', async () => {
    const model = new MockLanguageModelV4({ doGenerate: reply(JSON.stringify(buildValidOutput())) })
    useModel(model)
    const controller = new AbortController()

    await generateWrappedWithLLM({ ...baseArgs, signal: controller.signal })

    expect(model.doGenerateCalls[0].abortSignal?.aborted).toBe(false)
  })

  it('returns an error when no active LLM provider is configured', async () => {
    mockGetLanguageModel.mockResolvedValue(null)

    const result = await generateWrappedWithLLM(baseArgs)

    expect(result).toMatchObject({ success: false, errorCode: 'NOT_CONFIGURED' })
    expect(result.error).toContain('No active LLM provider')
  })

  it('returns an error for a row that cannot build a model', async () => {
    mockGetLanguageModel.mockRejectedValue(new LLMConfigError('Unsupported LLM provider: unsupported'))

    const result = await generateWrappedWithLLM(baseArgs)

    expect(result).toMatchObject({ success: false, errorCode: 'NOT_CONFIGURED', error: 'Unsupported LLM provider: unsupported' })
  })

  it('fails as TRUNCATED and records the billed attempt with outcome length', async () => {
    useModel(new MockLanguageModelV4({ doGenerate: reply('{"archetype":{"id":"cur', 'length') }), { maxTokens: 50 })

    const result = await generateWrappedWithLLM(baseArgs)

    expect(result).toMatchObject({ success: false, errorCode: 'TRUNCATED' })
    expect(result.error).toContain('ran out of output tokens')
    expect(prismaMock.lLMUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ outcome: 'length', model: 'gpt-6-luna-2026-09-22' }) })
    )
  })

  it('fails as SCHEMA on output that does not match the v2 schema', async () => {
    useModel(new MockLanguageModelV4({ doGenerate: reply('{"archetype":{"id":"nope"}}') }))

    const result = await generateWrappedWithLLM(baseArgs)

    expect(result).toMatchObject({ success: false, errorCode: 'SCHEMA' })
    expect(prismaMock.lLMUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ outcome: 'schema' }) })
    )
  })

  it('still succeeds if the usage row cannot be written', async () => {
    useModel(new MockLanguageModelV4({ doGenerate: reply(JSON.stringify(buildValidOutput())) }))
    prismaMock.lLMUsage.create.mockRejectedValue(new Error('Database error'))
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

    const result = await generateWrappedWithLLM(baseArgs)

    expect(result.success).toBe(true)
    consoleErrorSpy.mockRestore()
  })

  it('handles errors gracefully', async () => {
    prismaMock.config.findUnique.mockRejectedValue(new Error('Database error'))

    const result = await generateWrappedWithLLM(baseArgs)

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })
})
