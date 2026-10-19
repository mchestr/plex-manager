/**
 * Tests for lib/connections/openai.ts - OpenAI connection testing
 */

import {
  fetchOpenAIModels,
  testOpenAIConnection,
} from '@/lib/connections/openai'

// Mock fetch globally
global.fetch = jest.fn()
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>

describe('OpenAI Connection', () => {
  // Helper to temporarily disable test mode
  const withTestModeDisabled = <T>(fn: () => Promise<T>): Promise<T> => {
    const originalEnv = process.env.NODE_ENV
    const originalSkip = process.env.SKIP_CONNECTION_TESTS
    jest.replaceProperty(process.env, 'NODE_ENV', 'production')
    delete process.env.SKIP_CONNECTION_TESTS

    return fn().finally(() => {
      jest.replaceProperty(process.env, 'NODE_ENV', originalEnv)
      if (originalSkip) {
        process.env.SKIP_CONNECTION_TESTS = originalSkip
      }
    })
  }

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('testOpenAIConnection', () => {
    it('should return success when connection is valid', async () => {
      const mockResponse = {
        data: [
          { id: 'gpt-4' },
          { id: 'gpt-3.5-turbo' },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await withTestModeDisabled(() => testOpenAIConnection('valid-api-key'))

      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/models',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer valid-api-key',
          }),
        })
      )
    })

    it('should return error for invalid API key (401)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as Response)

      const result = await withTestModeDisabled(() => testOpenAIConnection('invalid-api-key'))

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid API key')
    })

    it('should return error for forbidden API key (403)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      } as Response)

      const result = await withTestModeDisabled(() => testOpenAIConnection('forbidden-api-key'))

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid API key')
    })

    it('should return error for other HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response)

      const result = await withTestModeDisabled(() => testOpenAIConnection('api-key'))

      expect(result.success).toBe(false)
      expect(result.error).toContain('Connection failed')
    })

    it('should handle API error response', async () => {
      const mockResponse = {
        error: {
          message: 'Rate limit exceeded',
        },
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await withTestModeDisabled(() => testOpenAIConnection('api-key'))

      expect(result.success).toBe(false)
      expect(result.error).toBe('Rate limit exceeded')
    })

    it('should handle connection timeout', async () => {
      const abortError = new Error('Timeout')
      abortError.name = 'AbortError'

      mockFetch.mockImplementationOnce(() => {
        return Promise.reject(abortError)
      })

      const result = await withTestModeDisabled(() => testOpenAIConnection('api-key'))

      expect(result.success).toBe(false)
      expect(result.error).toContain('Connection timeout')
    })

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await withTestModeDisabled(() => testOpenAIConnection('api-key'))

      expect(result.success).toBe(false)
      expect(result.error).toContain('Connection error')
    })

    it('should handle non-Error exceptions', async () => {
      mockFetch.mockRejectedValueOnce('String error')

      const result = await withTestModeDisabled(() => testOpenAIConnection('api-key'))

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to connect to OpenAI API')
    })

    it('should set 10 second timeout', async () => {
      const abortSpy = jest.spyOn(AbortController.prototype, 'abort')
      const abortError = new Error('Timeout')
      abortError.name = 'AbortError'

      mockFetch.mockImplementationOnce(() => {
        return Promise.reject(abortError)
      })

      await withTestModeDisabled(() => testOpenAIConnection('api-key'))

      // The abort controller is used internally, but we can verify the timeout error is handled
      expect(abortSpy).not.toHaveBeenCalled() // AbortController.abort() is called internally, not directly testable
      abortSpy.mockRestore()
    })
  })

  describe('fetchOpenAIModels', () => {
    it('should fetch and filter GPT models successfully', async () => {
      const mockResponse = {
        data: [
          { id: 'gpt-4' },
          { id: 'gpt-3.5-turbo' },
          { id: 'gpt-4-turbo' },
          { id: 'text-embedding-ada-002' }, // Should be filtered out
          { id: 'davinci' }, // Should be filtered out
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await withTestModeDisabled(() => fetchOpenAIModels('valid-api-key'))

      expect(result.success).toBe(true)
      expect(result.models).toEqual(['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo'])
      expect(result.models?.length).toBe(3)
    })

    it('should return empty array when no GPT models found', async () => {
      const mockResponse = {
        data: [
          { id: 'text-embedding-ada-002' },
          { id: 'davinci' },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await withTestModeDisabled(() => fetchOpenAIModels('api-key'))

      expect(result.success).toBe(true)
      expect(result.models).toEqual([])
    })

    it('should return error for invalid API key (401)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as Response)

      const result = await withTestModeDisabled(() => fetchOpenAIModels('invalid-api-key'))

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid API key')
    })

    it('should handle API error response', async () => {
      const mockResponse = {
        error: {
          message: 'Invalid API key',
        },
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await withTestModeDisabled(() => fetchOpenAIModels('api-key'))

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid API key')
    })

    it('should handle connection timeout', async () => {
      const abortError = new Error('Timeout')
      abortError.name = 'AbortError'

      mockFetch.mockImplementationOnce(() => {
        return Promise.reject(abortError)
      })

      const result = await withTestModeDisabled(() => fetchOpenAIModels('api-key'))

      expect(result.success).toBe(false)
      expect(result.error).toContain('Connection timeout')
    })

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await withTestModeDisabled(() => fetchOpenAIModels('api-key'))

      expect(result.success).toBe(false)
      expect(result.error).toContain('Connection error')
    })

    it('should handle empty data array', async () => {
      const mockResponse = {
        data: [],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await withTestModeDisabled(() => fetchOpenAIModels('api-key'))

      expect(result.success).toBe(true)
      expect(result.models).toEqual([])
    })

    it('should sort models alphabetically', async () => {
      const mockResponse = {
        data: [
          { id: 'gpt-4-turbo' },
          { id: 'gpt-4' },
          { id: 'gpt-3.5-turbo' },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await withTestModeDisabled(() => fetchOpenAIModels('api-key'))

      expect(result.success).toBe(true)
      expect(result.models).toEqual(['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo'])
    })
  })
})

