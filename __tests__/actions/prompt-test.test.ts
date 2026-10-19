/**
 * Tests for actions/prompt-test.ts - prompt testing functionality
 */

import { testPromptTemplate } from '@/actions/prompt-test'
import { getServerSession } from 'next-auth'
import { generateStructured } from '@/lib/llm/generate-structured'
import { generateWrappedPrompt } from '@/lib/wrapped/prompt-template'
import type { WrappedStatistics } from '@/types/wrapped'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

// Mock dependencies
jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/wrapped/prompt-template', () => ({
  generateWrappedPrompt: jest.fn(),
  generateSystemPrompt: jest.fn(() => 'system prompt'),
}))

jest.mock('@/lib/llm/generate-structured', () => ({
  generateStructured: jest.fn(),
}))

const mockPrisma = prismaMock
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockGenerateWrappedPrompt = generateWrappedPrompt as jest.MockedFunction<typeof generateWrappedPrompt>
const mockGenerateStructured = generateStructured as jest.MockedFunction<typeof generateStructured>

describe('testPromptTemplate', () => {
  const mockSession = {
    user: {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      isAdmin: true,
    },
  }

  const mockStatistics: WrappedStatistics = {
    totalWatchTime: {
      total: 1000,
      movies: 600,
      shows: 400,
    },
    moviesWatched: 10,
    showsWatched: 5,
    episodesWatched: 50,
    topMovies: [
      { title: 'Movie 1', watchTime: 200, playCount: 1, year: 2020 },
      { title: 'Movie 2', watchTime: 150, playCount: 1, year: 2021 },
    ],
    topShows: [
      { title: 'Show 1', watchTime: 300, playCount: 20, episodesWatched: 20, year: 2019 },
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
      expect(mockGenerateStructured).not.toHaveBeenCalled()
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
    const usage = { inputTokens: 100, cachedInputTokens: 0, outputTokens: 50, reasoningTokens: 10 }

    function succeed(rawText = 'Raw response') {
      mockGenerateStructured.mockResolvedValue({
        ok: true,
        value: {
          output: { archetype: { id: 'curator' } },
          usage,
          cost: 0.001,
          modelId: 'gpt-6-luna-2026-09-22',
          finishReason: 'stop',
          rawText,
        },
      } as never)
    }

    beforeEach(() => {
      mockPrisma.config.findUnique.mockResolvedValue({
        llmDisabled: false,
      } as any)
      mockGenerateWrappedPrompt.mockResolvedValue('Rendered prompt')
    })

    it('should return error when LLM is disabled and not call the model', async () => {
      mockPrisma.config.findUnique.mockResolvedValue({
        llmDisabled: true,
      } as any)

      const result = await testPromptTemplate({
        userName: 'Test User',
        year: 2024,
        statistics: mockStatistics,
        sendToAI: true,
      })

      expect(result.success).toBe(false)
      expect(result.renderedPrompt).toBe('Rendered prompt')
      expect(result.error).toContain('LLM calls are currently disabled')
      expect(result.error).toContain('enable LLM in admin settings')
      expect(mockGenerateStructured).not.toHaveBeenCalled()
    })

    it('should call the facade with the v2 schema and the admin as the usage owner', async () => {
      succeed()

      const result = await testPromptTemplate({
        userName: 'Test User',
        year: 2024,
        statistics: mockStatistics,
        sendToAI: true,
      })

      expect(result.success).toBe(true)
      expect(result.renderedPrompt).toBe('Rendered prompt')
      expect(result.llmResponse).toBe('Raw response')
      expect(result.tokenUsage).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150, cost: 0.001 })
      expect(mockGenerateStructured).toHaveBeenCalledWith(
        expect.objectContaining({
          purpose: 'wrapped',
          system: 'system prompt',
          prompt: 'Rendered prompt',
          effort: 'low',
          cacheKey: 'rewind-v2',
          attribution: { userId: 'user-1' },
          recordText: true,
        })
      )
    })

    it('should pass the playground model, temperature and token overrides', async () => {
      succeed()

      await testPromptTemplate({
        userName: 'Test User',
        year: 2024,
        statistics: mockStatistics,
        sendToAI: true,
        model: 'gpt-6-luna',
        temperature: 0.4,
        maxTokens: 50,
      })

      expect(mockGenerateStructured).toHaveBeenCalledWith(
        expect.objectContaining({ modelOverride: 'gpt-6-luna', temperature: 0.4, maxOutputTokens: 50 })
      )
    })

    it('should send "there" instead of an email-like Plex username', async () => {
      mockGenerateWrappedPrompt.mockResolvedValue('Rendered prompt for there')
      mockGenerateStructured.mockResolvedValue({ ok: false, error: { code: 'PROVIDER', message: 'API error' } })

      const result = await testPromptTemplate({
        userName: 'invited.member@example.com',
        year: 2024,
        statistics: mockStatistics,
        sendToAI: true,
      })

      expect(mockGenerateWrappedPrompt).toHaveBeenCalledWith('there', 2024, mockStatistics, undefined)
      expect(mockGenerateStructured).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'Rendered prompt for there' }))
      expect(JSON.stringify(mockGenerateWrappedPrompt.mock.calls)).not.toContain('@example.com')
      expect(result.renderedPrompt).toBe('Rendered prompt for there')
    })

    it('should send the trimmed member name when it is not an email', async () => {
      mockGenerateStructured.mockResolvedValue({ ok: false, error: { code: 'PROVIDER', message: 'API error' } })

      await testPromptTemplate({
        userName: '  Mike  ',
        year: 2024,
        statistics: mockStatistics,
        sendToAI: true,
      })

      expect(mockGenerateWrappedPrompt).toHaveBeenCalledWith('Mike', 2024, mockStatistics, undefined)
    })

    it('should return the facade error message', async () => {
      mockGenerateStructured.mockResolvedValue({
        ok: false,
        error: { code: 'NOT_CONFIGURED', message: 'No active LLM provider is configured for this purpose' },
      })

      const result = await testPromptTemplate({
        userName: 'Test User',
        year: 2024,
        statistics: mockStatistics,
        sendToAI: true,
      })

      expect(result.success).toBe(false)
      expect(result.renderedPrompt).toBe('Rendered prompt')
      expect(result.error).toContain('No active LLM provider')
    })

    it('should use JSON.stringify when the raw text is empty', async () => {
      succeed('')

      const result = await testPromptTemplate({
        userName: 'Test User',
        year: 2024,
        statistics: mockStatistics,
        sendToAI: true,
      })

      expect(result.success).toBe(true)
      expect(result.llmResponse).toBe(JSON.stringify({ archetype: { id: 'curator' } }, null, 2))
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

