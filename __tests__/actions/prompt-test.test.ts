/**
 * Tests for actions/prompt-test.ts - prompt testing functionality
 */

import { testPromptTemplate } from '@/actions/prompt-test'
import { prisma } from '@/lib/prisma'
import { getActiveLLMProvider } from '@/lib/services/service-helpers'
import { getServerSession } from 'next-auth'
import { callOpenAI } from '@/lib/wrapped/api-calls'
import { generateWrappedPrompt } from '@/lib/wrapped/prompt-template'

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    config: {
      findUnique: jest.fn(),
    },
    lLMUsage: {
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/services/service-helpers', () => ({
  getActiveLLMProvider: jest.fn(),
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/wrapped/prompt-template', () => ({
  generateWrappedPrompt: jest.fn(),
}))

jest.mock('@/lib/wrapped/api-calls', () => ({
  callOpenAI: jest.fn(),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockGenerateWrappedPrompt = generateWrappedPrompt as jest.MockedFunction<typeof generateWrappedPrompt>
const mockCallOpenAI = callOpenAI as jest.MockedFunction<typeof callOpenAI>
const mockGetActiveLLMProvider = getActiveLLMProvider as jest.MockedFunction<typeof getActiveLLMProvider>

describe('testPromptTemplate', () => {
  const mockSession = {
    user: {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
    },
  }

  const mockStatistics = {
    totalWatchTime: {
      total: 1000,
      movies: 600,
      shows: 400,
    },
    moviesWatched: 10,
    showsWatched: 5,
    episodesWatched: 50,
    topMovies: [
      { title: 'Movie 1', watchTime: 200, year: 2020 },
      { title: 'Movie 2', watchTime: 150, year: 2021 },
    ],
    topShows: [
      { title: 'Show 1', watchTime: 300, episodesWatched: 20, year: 2019 },
    ],
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetServerSession.mockResolvedValue(mockSession as any)
  })

  describe('authentication', () => {
    it('should return error when not authenticated', async () => {
      mockGetServerSession.mockResolvedValue(null)

      const result = await testPromptTemplate({
        userName: 'Test User',
        year: 2024,
        statistics: mockStatistics,
        sendToAI: false,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Authentication required')
    })

    it('should return error when session has no user ID', async () => {
      mockGetServerSession.mockResolvedValue({} as any)

      const result = await testPromptTemplate({
        userName: 'Test User',
        year: 2024,
        statistics: mockStatistics,
        sendToAI: false,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Authentication required')
    })
  })

  describe('prompt rendering only (sendToAI: false)', () => {
    it('should render prompt without sending to AI', async () => {
      const mockRenderedPrompt = 'Rendered prompt with {{userName}} replaced'
      mockGenerateWrappedPrompt.mockResolvedValue(mockRenderedPrompt)

      const result = await testPromptTemplate({
        userName: 'Test User',
        year: 2024,
        statistics: mockStatistics,
        sendToAI: false,
      })

      expect(result.success).toBe(true)
      expect(result.renderedPrompt).toBe(mockRenderedPrompt)
      expect(result.llmResponse).toBeUndefined()
      expect(mockGenerateWrappedPrompt).toHaveBeenCalledWith(
        'Test User',
        2024,
        mockStatistics,
        undefined
      )
      expect(mockCallOpenAI).not.toHaveBeenCalled()
    })

    it('should use custom template string when provided', async () => {
      const customTemplate = 'Custom template {{userName}}'
      const mockRenderedPrompt = 'Custom template Test User'
      mockGenerateWrappedPrompt.mockResolvedValue(mockRenderedPrompt)

      const result = await testPromptTemplate({
        userName: 'Test User',
        year: 2024,
        statistics: mockStatistics,
        sendToAI: false,
        templateString: customTemplate,
      })

      expect(result.success).toBe(true)
      expect(mockGenerateWrappedPrompt).toHaveBeenCalledWith(
        'Test User',
        2024,
        mockStatistics,
        customTemplate
      )
    })
  })

  describe('prompt rendering with AI (sendToAI: true)', () => {
    const mockLLMProviderService = {
      id: 'provider-1',
      name: 'Wrapped LLM',
      isActive: true,
      config: {
        provider: 'openai',
        apiKey: 'test-api-key',
        model: 'gpt-4',
      },
    }

    beforeEach(() => {
      mockPrisma.config.findUnique.mockResolvedValue({
        llmDisabled: false,
      } as any)
      mockGetActiveLLMProvider.mockResolvedValue(mockLLMProviderService as any)
    })

    it('should return error when LLM is disabled and not call OpenAI', async () => {
      mockPrisma.config.findUnique.mockResolvedValue({
        llmDisabled: true,
      } as any)

      const mockRenderedPrompt = 'Rendered prompt'
      mockGenerateWrappedPrompt.mockResolvedValue(mockRenderedPrompt)

      const result = await testPromptTemplate({
        userName: 'Test User',
        year: 2024,
        statistics: mockStatistics,
        sendToAI: true,
      })

      expect(result.success).toBe(false)
      expect(result.renderedPrompt).toBe(mockRenderedPrompt)
      expect(result.error).toContain('LLM calls are currently disabled')
      expect(result.error).toContain('enable LLM in admin settings')
      expect(mockCallOpenAI).not.toHaveBeenCalled()
      expect(mockGetActiveLLMProvider).not.toHaveBeenCalled()
    })

    it('should return error when no active LLM provider', async () => {
      mockGetActiveLLMProvider.mockResolvedValue(null)

      const mockRenderedPrompt = 'Rendered prompt'
      mockGenerateWrappedPrompt.mockResolvedValue(mockRenderedPrompt)

      const result = await testPromptTemplate({
        userName: 'Test User',
        year: 2024,
        statistics: mockStatistics,
        sendToAI: true,
      })

      expect(result.success).toBe(false)
      expect(result.renderedPrompt).toBe(mockRenderedPrompt)
      expect(result.error).toContain('No active LLM provider')
      expect(mockCallOpenAI).not.toHaveBeenCalled()
    })

    it('should call OpenAI and return response when LLM is enabled', async () => {
      const mockRenderedPrompt = 'Rendered prompt'
      const mockLLMResponse = {
        success: true,
        data: { sections: [] },
        rawResponse: 'Raw response',
        tokenUsage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cost: 0.001,
        },
      }

      mockGenerateWrappedPrompt.mockResolvedValue(mockRenderedPrompt)
      mockCallOpenAI.mockResolvedValue(mockLLMResponse as any)

      const result = await testPromptTemplate({
        userName: 'Test User',
        year: 2024,
        statistics: mockStatistics,
        sendToAI: true,
      })

      expect(result.success).toBe(true)
      expect(result.renderedPrompt).toBe(mockRenderedPrompt)
      expect(result.llmResponse).toBe('Raw response')
      expect(result.tokenUsage).toEqual(mockLLMResponse.tokenUsage)
      expect(mockCallOpenAI).toHaveBeenCalledWith(
        {
          provider: 'openai',
          apiKey: 'test-api-key',
          model: 'gpt-4',
        },
        mockRenderedPrompt,
        mockStatistics,
        2024,
        'user-1',
        'Test User'
      )
    })

    it('should use custom model when provided', async () => {
      const mockRenderedPrompt = 'Rendered prompt'
      const mockLLMResponse = {
        success: true,
        data: { sections: [] },
        rawResponse: 'Raw response',
        tokenUsage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cost: 0.001,
        },
      }

      mockGenerateWrappedPrompt.mockResolvedValue(mockRenderedPrompt)
      mockCallOpenAI.mockResolvedValue(mockLLMResponse as any)

      await testPromptTemplate({
        userName: 'Test User',
        year: 2024,
        statistics: mockStatistics,
        sendToAI: true,
        model: 'gpt-3.5-turbo',
      })

      expect(mockCallOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-3.5-turbo',
        }),
        expect.any(String),
        expect.any(Object),
        expect.any(Number),
        expect.any(String),
        expect.any(String)
      )
    })

    it('should record LLM usage to database', async () => {
      const mockRenderedPrompt = 'Rendered prompt'
      const mockLLMResponse = {
        success: true,
        data: { sections: [] },
        rawResponse: 'Raw response',
        tokenUsage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cost: 0.001,
        },
      }

      mockGenerateWrappedPrompt.mockResolvedValue(mockRenderedPrompt)
      mockCallOpenAI.mockResolvedValue(mockLLMResponse as any)
      mockPrisma.lLMUsage.create.mockResolvedValue({} as any)

      await testPromptTemplate({
        userName: 'Test User',
        year: 2024,
        statistics: mockStatistics,
        sendToAI: true,
      })

      expect(mockPrisma.lLMUsage.create).toHaveBeenCalledWith({
        data: {
          wrappedId: null,
          userId: 'user-1',
          provider: 'openai',
          model: 'gpt-4',
          prompt: mockRenderedPrompt,
          response: 'Raw response',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cost: 0.001,
        },
      })
    })

    it('should handle LLM usage logging failure gracefully', async () => {
      const mockRenderedPrompt = 'Rendered prompt'
      const mockLLMResponse = {
        success: true,
        data: { sections: [] },
        rawResponse: 'Raw response',
        tokenUsage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cost: 0.001,
        },
      }

      mockGenerateWrappedPrompt.mockResolvedValue(mockRenderedPrompt)
      mockCallOpenAI.mockResolvedValue(mockLLMResponse as any)
      mockPrisma.lLMUsage.create.mockRejectedValue(new Error('DB error'))

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

      const result = await testPromptTemplate({
        userName: 'Test User',
        year: 2024,
        statistics: mockStatistics,
        sendToAI: true,
      })

      expect(result.success).toBe(true)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[PROMPT_TEST]',
        expect.stringContaining('Failed to save LLM usage'),
        expect.objectContaining({
          err: expect.objectContaining({
            message: 'DB error'
          })
        })
      )
      consoleErrorSpy.mockRestore()
    })

    it('should handle LLM call failure', async () => {
      const mockRenderedPrompt = 'Rendered prompt'
      const mockLLMResponse = {
        success: false,
        error: 'API error',
      }

      mockGenerateWrappedPrompt.mockResolvedValue(mockRenderedPrompt)
      mockCallOpenAI.mockResolvedValue(mockLLMResponse as any)

      const result = await testPromptTemplate({
        userName: 'Test User',
        year: 2024,
        statistics: mockStatistics,
        sendToAI: true,
      })

      expect(result.success).toBe(false)
      expect(result.renderedPrompt).toBe(mockRenderedPrompt)
      expect(result.error).toBe('API error')
    })

    it('should use JSON.stringify when rawResponse is missing', async () => {
      const mockRenderedPrompt = 'Rendered prompt'
      const mockData = { sections: [{ id: 'hero' }] }
      const mockLLMResponse = {
        success: true,
        data: mockData,
        tokenUsage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cost: 0.001,
        },
      }

      mockGenerateWrappedPrompt.mockResolvedValue(mockRenderedPrompt)
      mockCallOpenAI.mockResolvedValue(mockLLMResponse as any)
      mockPrisma.lLMUsage.create.mockResolvedValue({} as any)

      const result = await testPromptTemplate({
        userName: 'Test User',
        year: 2024,
        statistics: mockStatistics,
        sendToAI: true,
      })

      expect(result.success).toBe(true)
      expect(result.llmResponse).toBe(JSON.stringify(mockData, null, 2))
      expect(mockPrisma.lLMUsage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            response: JSON.stringify(mockData, null, 2),
          }),
        })
      )
    })
  })

  describe('error handling', () => {
    it('should handle errors during prompt generation', async () => {
      mockGenerateWrappedPrompt.mockRejectedValue(new Error('Template error'))

      const result = await testPromptTemplate({
        userName: 'Test User',
        year: 2024,
        statistics: mockStatistics,
        sendToAI: false,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Template error')
    })

    it('should handle non-Error exceptions', async () => {
      mockGenerateWrappedPrompt.mockRejectedValue('String error')

      const result = await testPromptTemplate({
        userName: 'Test User',
        year: 2024,
        statistics: mockStatistics,
        sendToAI: false,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to test prompt')
    })
  })
})

