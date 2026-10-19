/**
 * Tests for lib/wrapped/llm.ts - LLM integration logic
 */

import { generateWrappedWithLLM } from '@/lib/wrapped/llm'
import { prisma } from '@/lib/prisma'
import { generateWrappedPrompt } from '@/lib/wrapped/prompt-template'
import { callOpenAI } from '@/lib/wrapped/api-calls'
import { generateMockWrappedData } from '@/lib/wrapped/mock-data'
import { buildValidOutput } from '@/lib/wrapped/__tests__/fixtures'
import { WrappedStatistics } from '@/types/wrapped'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

// Mock dependencies
jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

jest.mock('@/actions/prompts', () => ({
  getActivePromptTemplate: jest.fn(),
}))

jest.mock('@/lib/wrapped/prompt-template', () => ({
  generateWrappedPrompt: jest.fn(),
}))

jest.mock('@/lib/wrapped/api-calls', () => ({
  callOpenAI: jest.fn(),
}))

jest.mock('@/lib/wrapped/mock-data', () => ({
  generateMockWrappedData: jest.fn(),
}))

const mockStatistics: WrappedStatistics = {
  totalWatchTime: {
    total: 1000,
    movies: 500,
    shows: 500,
  },
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

describe('generateWrappedWithLLM', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return mock data when LLM is disabled and NOT call OpenAI API', async () => {
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({
      id: 'config',
      llmDisabled: true,
    })

    const mockData = {
      sections: [],
      summary: 'Mock summary',
    }
    ;(generateMockWrappedData as jest.Mock).mockReturnValue(mockData)
    ;(prisma.lLMUsage.create as jest.Mock).mockResolvedValue({})

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
    // Verify OpenAI API is NOT called
    expect(callOpenAI).not.toHaveBeenCalled()
    expect(generateWrappedPrompt).not.toHaveBeenCalled()
    expect(prisma.lLMProvider.findFirst).not.toHaveBeenCalled()
    expect(prisma.lLMUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: 'mock',
          model: 'mock',
          cost: 0,
          totalTokens: 0,
        }),
      })
    )
  })

  it('should call OpenAI when OpenAI provider is configured', async () => {
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({
      id: 'config',
      llmDisabled: false,
    })

    ;(prisma.lLMProvider.findFirst as jest.Mock).mockResolvedValue({
      id: 'provider-1',
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4',
      isActive: true,
    })

    ;(generateWrappedPrompt as jest.Mock).mockResolvedValue('test prompt')

    const mockOutput = buildValidOutput()
    const mockLLMResponse = {
      success: true,
      output: mockOutput,
      rawResponse: JSON.stringify(mockOutput),
      tokenUsage: {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
        cost: 0.06,
      },
    }

    ;(callOpenAI as jest.Mock).mockResolvedValue(mockLLMResponse)
    ;(prisma.lLMUsage.create as jest.Mock).mockResolvedValue({})

    const result = await generateWrappedWithLLM(baseArgs)

    expect(result.success).toBe(true)
    expect(result.data?.version).toBe(2)
    expect(result.data?.archetype?.name).toBe('The Midnight Marathoner')
    expect(result.data?.summary).toBe(mockOutput.summary)
    expect(callOpenAI).toHaveBeenCalledWith(
      {
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
        temperature: undefined,
        maxTokens: undefined,
      },
      'test prompt'
    )
    expect(prisma.lLMUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: 'openai',
          model: 'gpt-4',
          promptTokens: 1000,
          completionTokens: 500,
          totalTokens: 1500,
          cost: 0.06,
        }),
      })
    )
  })

  it('should send only the prompt name to the model and store the display name', async () => {
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({ id: 'config', llmDisabled: false })
    ;(prisma.lLMProvider.findFirst as jest.Mock).mockResolvedValue({
      id: 'provider-1',
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-6-luna',
      isActive: true,
    })
    ;(generateWrappedPrompt as jest.Mock).mockResolvedValue('test prompt')
    const mockOutput = buildValidOutput()
    ;(callOpenAI as jest.Mock).mockResolvedValue({
      success: true,
      output: mockOutput,
      rawResponse: JSON.stringify(mockOutput),
      model: 'gpt-6-luna-2026-09-22',
      tokenUsage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500, cost: 0.00035 },
    })
    ;(prisma.lLMUsage.create as jest.Mock).mockResolvedValue({})

    const result = await generateWrappedWithLLM({
      ...baseArgs,
      promptName: 'there',
      displayName: 'member@example.com',
    })

    expect(result.success).toBe(true)
    expect(generateWrappedPrompt).toHaveBeenCalledWith('there', 2024, mockStatistics)
    expect(result.data?.userName).toBe('member@example.com')
    // The usage row records the model the API served, not a fallback
    expect(prisma.lLMUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ model: 'gpt-6-luna-2026-09-22', cost: 0.00035 }),
      })
    )
  })

  it('should give the mock the prompt name for its copy and the display name to store', async () => {
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({ id: 'config', llmDisabled: true })
    const { generateMockWrappedData: realMock } =
      jest.requireActual<typeof import('@/lib/wrapped/mock-data')>('@/lib/wrapped/mock-data')
    ;(generateMockWrappedData as jest.Mock).mockImplementation(realMock)
    ;(prisma.lLMUsage.create as jest.Mock).mockResolvedValue({})

    const result = await generateWrappedWithLLM({
      ...baseArgs,
      promptName: 'there',
      displayName: 'Stored Name',
    })

    expect(result.data?.userName).toBe('Stored Name')
    expect(result.data?.archetype?.dedication).toContain('Hey there')
    expect(JSON.stringify(result.data?.sections)).not.toContain('Stored Name')
  })

  it('should return error when no active LLM provider is configured', async () => {
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({
      id: 'config',
      llmDisabled: false,
    })

    ;(prisma.lLMProvider.findFirst as jest.Mock).mockResolvedValue(null)

    const result = await generateWrappedWithLLM(baseArgs)

    expect(result.success).toBe(false)
    expect(result.error).toContain('No active LLM provider')
  })

  it('should return error when LLM call fails', async () => {
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({
      id: 'config',
      llmDisabled: false,
    })

    ;(prisma.lLMProvider.findFirst as jest.Mock).mockResolvedValue({
      id: 'provider-1',
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4',
      isActive: true,
    })

    ;(generateWrappedPrompt as jest.Mock).mockResolvedValue('test prompt')

    ;(callOpenAI as jest.Mock).mockResolvedValue({
      success: false,
      error: 'API error',
    })

    const result = await generateWrappedWithLLM(baseArgs)

    expect(result.success).toBe(false)
    expect(result.error).toBe('API error')
    expect(prisma.lLMUsage.create).not.toHaveBeenCalled()
  })

  it('should handle unsupported provider', async () => {
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({
      id: 'config',
      llmDisabled: false,
    })

    ;(prisma.lLMProvider.findFirst as jest.Mock).mockResolvedValue({
      id: 'provider-1',
      provider: 'unsupported',
      apiKey: 'test-key',
      model: 'test-model',
      isActive: true,
    })

    ;(generateWrappedPrompt as jest.Mock).mockResolvedValue('test prompt')

    const result = await generateWrappedWithLLM(baseArgs)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unsupported LLM provider')
  })

  it('should not fail if token usage logging fails', async () => {
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({
      id: 'config',
      llmDisabled: false,
    })

    ;(prisma.lLMProvider.findFirst as jest.Mock).mockResolvedValue({
      id: 'provider-1',
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4',
      isActive: true,
    })

    ;(generateWrappedPrompt as jest.Mock).mockResolvedValue('test prompt')

    const mockOutput = buildValidOutput()
    const mockLLMResponse = {
      success: true,
      output: mockOutput,
      rawResponse: JSON.stringify(mockOutput),
      tokenUsage: {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
        cost: 0.06,
      },
    }

    ;(callOpenAI as jest.Mock).mockResolvedValue(mockLLMResponse)
    ;(prisma.lLMUsage.create as jest.Mock).mockRejectedValue(
      new Error('Database error')
    )

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

    const result = await generateWrappedWithLLM(baseArgs)

    expect(result.success).toBe(true) // Should still succeed even if logging fails
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('should return error when model is not specified', async () => {
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({
      id: 'config',
      llmDisabled: false,
    })

    ;(prisma.lLMProvider.findFirst as jest.Mock).mockResolvedValue({
      id: 'provider-1',
      provider: 'openai',
      apiKey: 'test-key',
      model: null,
      isActive: true,
    })

    ;(generateWrappedPrompt as jest.Mock).mockResolvedValue('test prompt')

    const result = await generateWrappedWithLLM(baseArgs)

    expect(result.success).toBe(false)
    expect(result.error).toContain('No model configured')
    expect(callOpenAI).not.toHaveBeenCalled()
  })

  it('should handle errors gracefully', async () => {
    ;(prisma.config.findUnique as jest.Mock).mockRejectedValue(
      new Error('Database error')
    )

    const result = await generateWrappedWithLLM(baseArgs)

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })
})

