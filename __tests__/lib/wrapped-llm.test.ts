/**
 * Tests for lib/wrapped/llm.ts - LLM integration logic
 */

import { generateWrappedWithLLM } from '@/lib/wrapped/llm'
import { prisma } from '@/lib/prisma'
import { generateWrappedPrompt } from '@/lib/wrapped/prompt-template'
import { callOpenAI } from '@/lib/wrapped/api-calls'
import { generateMockWrappedData } from '@/lib/wrapped/mock-data'
import { WrappedStatistics } from '@/types/wrapped'

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    config: {
      findUnique: jest.fn(),
    },
    lLMProvider: {
      findFirst: jest.fn(),
    },
    lLMUsage: {
      create: jest.fn(),
    },
  },
}))

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

    const result = await generateWrappedWithLLM(
      'Test User',
      2024,
      'user-1',
      'wrapped-1',
      mockStatistics
    )

    expect(result.success).toBe(true)
    expect(result.data).toEqual(mockData)
    expect(result.tokenUsage?.cost).toBe(0)
    expect(generateMockWrappedData).toHaveBeenCalledWith(
      'Test User',
      2024,
      'user-1',
      mockStatistics
    )
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

    const mockLLMResponse = {
      success: true,
      data: {
        sections: [],
        summary: 'Test summary',
      },
      rawResponse: JSON.stringify({ sections: [], summary: 'Test summary' }),
      tokenUsage: {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
        cost: 0.06,
      },
    }

    ;(callOpenAI as jest.Mock).mockResolvedValue(mockLLMResponse)
    ;(prisma.lLMUsage.create as jest.Mock).mockResolvedValue({})

    const result = await generateWrappedWithLLM(
      'Test User',
      2024,
      'user-1',
      'wrapped-1',
      mockStatistics
    )

    expect(result.success).toBe(true)
    expect(result.data).toEqual(mockLLMResponse.data)
    expect(callOpenAI).toHaveBeenCalledWith(
      {
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
      },
      'test prompt',
      mockStatistics,
      2024,
      'user-1',
      'Test User'
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


  it('should return error when no active LLM provider is configured', async () => {
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({
      id: 'config',
      llmDisabled: false,
    })

    ;(prisma.lLMProvider.findFirst as jest.Mock).mockResolvedValue(null)

    const result = await generateWrappedWithLLM(
      'Test User',
      2024,
      'user-1',
      'wrapped-1',
      mockStatistics
    )

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

    const result = await generateWrappedWithLLM(
      'Test User',
      2024,
      'user-1',
      'wrapped-1',
      mockStatistics
    )

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

    const result = await generateWrappedWithLLM(
      'Test User',
      2024,
      'user-1',
      'wrapped-1',
      mockStatistics
    )

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

    const mockLLMResponse = {
      success: true,
      data: {
        sections: [],
        summary: 'Test summary',
      },
      rawResponse: JSON.stringify({ sections: [], summary: 'Test summary' }),
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

    const result = await generateWrappedWithLLM(
      'Test User',
      2024,
      'user-1',
      'wrapped-1',
      mockStatistics
    )

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

    const result = await generateWrappedWithLLM('Test User', 2024, 'user-1', 'wrapped-1', mockStatistics)

    expect(result.success).toBe(false)
    expect(result.error).toContain('No model configured')
    expect(callOpenAI).not.toHaveBeenCalled()
  })

  it('should handle errors gracefully', async () => {
    ;(prisma.config.findUnique as jest.Mock).mockRejectedValue(
      new Error('Database error')
    )

    const result = await generateWrappedWithLLM(
      'Test User',
      2024,
      'user-1',
      'wrapped-1',
      mockStatistics
    )

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })
})

