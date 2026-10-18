/**
 * Tests for lib/wrapped/api-calls.ts - LLM API call implementations
 */

// Mock next-auth and admin modules before other imports
jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/admin', () => ({
  requireAdmin: jest.fn(),
}))

jest.mock('@/lib/utils', () => ({
  getBaseUrl: jest.fn(() => 'https://example.com'),
}))

import { callOpenAI } from '@/lib/wrapped/api-calls'
import { buildValidOutput } from '@/lib/wrapped/__tests__/fixtures'

const validContent = () => JSON.stringify(buildValidOutput())

function mockFetchResponse(
  content: string,
  finishReason = 'stop',
  extra: { model?: string; cachedTokens?: number } = {}
) {
  ;(global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      ...(extra.model && { model: extra.model }),
      choices: [{ message: { content }, finish_reason: finishReason }],
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 500,
        total_tokens: 1500,
        ...(extra.cachedTokens !== undefined && {
          prompt_tokens_details: { cached_tokens: extra.cachedTokens },
        }),
      },
    }),
  })
}

function sentBody() {
  const fetchCall = (global.fetch as jest.Mock).mock.calls[0]
  return JSON.parse(fetchCall[1].body)
}

describe('LLM API Calls', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  describe('callOpenAI', () => {
    it('should successfully call OpenAI API and validate the response', async () => {
      mockFetchResponse(validContent())

      const result = await callOpenAI(
        { provider: 'openai', apiKey: 'test-key', model: 'gpt-4' },
        'test prompt'
      )

      expect(result.success).toBe(true)
      expect(result.output?.archetype.id).toBe('midnight-marathoner')
      expect(result.tokenUsage?.promptTokens).toBe(1000)
      expect(result.tokenUsage?.completionTokens).toBe(500)
      expect(result.tokenUsage?.totalTokens).toBe(1500)
      expect(result.rawResponse).toBe(validContent())
    })

    it('should fail loudly when the response violates the schema', async () => {
      mockFetchResponse(JSON.stringify({ sections: [], summary: 'old format' }))

      const result = await callOpenAI(
        { provider: 'openai', apiKey: 'test-key', model: 'gpt-4' },
        'test prompt'
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('schema validation')
      expect(result.rawResponse).toBeDefined()
    })

    it('should handle API errors', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        statusText: 'Unauthorized',
        json: async () => ({ error: { message: 'Invalid API key' } }),
      })

      const result = await callOpenAI(
        { provider: 'openai', apiKey: 'invalid-key', model: 'gpt-4' },
        'test prompt'
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid API key')
    })

    it('should handle truncated responses', async () => {
      mockFetchResponse(validContent().slice(0, -10), 'length')

      const result = await callOpenAI(
        { provider: 'openai', apiKey: 'test-key', model: 'gpt-4' },
        'test prompt'
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('truncated')
    })

    it('should handle incomplete JSON responses', async () => {
      mockFetchResponse('{"archetype": {')

      const result = await callOpenAI(
        { provider: 'openai', apiKey: 'test-key', model: 'gpt-4' },
        'test prompt'
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('truncated')
    })

    it('should handle missing content in response', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: {}, finish_reason: 'stop' }],
          usage: {},
        }),
      })

      const result = await callOpenAI(
        { provider: 'openai', apiKey: 'test-key', model: 'gpt-4' },
        'test prompt'
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('No content')
    })

    it('should return error when model is not provided', async () => {
      const result = await callOpenAI(
        {
          provider: 'openai',
          apiKey: 'test-key',
        } as never, // testing runtime behavior without a model
        'test prompt'
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Model is required')
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('should send correct request format', async () => {
      mockFetchResponse(validContent())

      await callOpenAI(
        { provider: 'openai', apiKey: 'test-key', model: 'gpt-4' },
        'test prompt'
      )

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0]
      const body = JSON.parse(fetchCall[1].body)

      expect(body.model).toBe('gpt-4')
      // Temperature and max_tokens are only included if provided
      expect(body.temperature).toBeUndefined()
      expect(body.max_tokens).toBeUndefined()
      expect(body.messages).toHaveLength(2)
      expect(body.messages[0].role).toBe('system')
      expect(body.messages[1].role).toBe('user')
      expect(body.messages[1].content).toBe('test prompt')
      // gpt-4 does not support structured outputs → plain JSON mode
      expect(body.response_format).toEqual({ type: 'json_object' })
    })

    it('should request strict structured outputs for supporting models', async () => {
      mockFetchResponse(validContent())

      await callOpenAI(
        { provider: 'openai', apiKey: 'test-key', model: 'gpt-5-mini' },
        'test prompt'
      )

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0]
      const body = JSON.parse(fetchCall[1].body)

      expect(body.response_format.type).toBe('json_schema')
      expect(body.response_format.json_schema.name).toBe('plex_wrapped')
      expect(body.response_format.json_schema.strict).toBe(true)
      expect(body.response_format.json_schema.schema).toBeDefined()
    })

    it('should use configured temperature and maxTokens', async () => {
      mockFetchResponse(validContent())

      await callOpenAI(
        {
          provider: 'openai',
          apiKey: 'test-key',
          model: 'gpt-4',
          temperature: 0.9,
          maxTokens: 8000,
        },
        'test prompt'
      )

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0]
      const body = JSON.parse(fetchCall[1].body)

      expect(body.temperature).toBe(0.9)
      expect(body.max_tokens).toBe(8000)
    })

    it('should use max_completion_tokens for newer models', async () => {
      mockFetchResponse(validContent())

      await callOpenAI(
        {
          provider: 'openai',
          apiKey: 'test-key',
          model: 'gpt-5',
          maxTokens: 5000,
        },
        'test prompt'
      )

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0]
      const body = JSON.parse(fetchCall[1].body)

      expect(body.max_completion_tokens).toBe(5000)
      expect(body.max_tokens).toBeUndefined()
    })
  })

  describe('model-dependent request fields', () => {
    it('sends gpt-6.1-sol max_completion_tokens and a json_schema, but no temperature', async () => {
      mockFetchResponse(validContent())

      await callOpenAI(
        { provider: 'openai', apiKey: 'test-key', model: 'gpt-6.1-sol', temperature: 0.8, maxTokens: 6000 },
        'test prompt'
      )

      const body = sentBody()
      expect(body.max_completion_tokens).toBe(6000)
      expect(body.max_tokens).toBeUndefined()
      expect(body.response_format.type).toBe('json_schema')
      expect(body).not.toHaveProperty('temperature')
    })

    it('keeps temperature and max_tokens for gpt-4o', async () => {
      mockFetchResponse(validContent())

      await callOpenAI(
        { provider: 'openai', apiKey: 'test-key', model: 'gpt-4o', temperature: 0.8, maxTokens: 6000 },
        'test prompt'
      )

      const body = sentBody()
      expect(body.temperature).toBe(0.8)
      expect(body.max_tokens).toBe(6000)
      expect(body.max_completion_tokens).toBeUndefined()
      expect(body.response_format.type).toBe('json_schema')
    })

    it.each([
      ['gpt-6-luna', 'json_schema'],
      ['gpt-6-astra', 'json_schema'],
      ['o4-mini', 'json_schema'],
      ['gpt-4', 'json_object'],
      ['o1', 'json_object'],
    ])('%s gets response_format %s', async (model, type) => {
      mockFetchResponse(validContent())

      await callOpenAI({ provider: 'openai', apiKey: 'test-key', model }, 'test prompt')

      expect(sentBody().response_format.type).toBe(type)
    })

    it('sends no temperature to o-series models', async () => {
      mockFetchResponse(validContent())

      await callOpenAI(
        { provider: 'openai', apiKey: 'test-key', model: 'o4-mini', temperature: 0.7, maxTokens: 4000 },
        'test prompt'
      )

      const body = sentBody()
      expect(body).not.toHaveProperty('temperature')
      expect(body.max_completion_tokens).toBe(4000)
    })
  })

  describe('usage', () => {
    it('reports and prices the model the API served', async () => {
      mockFetchResponse(validContent(), 'stop', { model: 'gpt-6-luna-2026-09-22' })

      const result = await callOpenAI(
        { provider: 'openai', apiKey: 'test-key', model: 'gpt-6-luna' },
        'test prompt'
      )

      expect(result.model).toBe('gpt-6-luna-2026-09-22')
      // 1000 input at $0.10/1M + 500 output at $0.50/1M
      expect(result.tokenUsage?.cost).toBeCloseTo(0.00035, 10)
    })

    it('falls back to the configured model when the API names none', async () => {
      mockFetchResponse(validContent())

      const result = await callOpenAI(
        { provider: 'openai', apiKey: 'test-key', model: 'gpt-5.4-mini' },
        'test prompt'
      )

      expect(result.model).toBe('gpt-5.4-mini')
    })

    it('prices cached prompt tokens at the cached rate', async () => {
      mockFetchResponse(validContent(), 'stop', { model: 'gpt-6-sol', cachedTokens: 400 })

      const result = await callOpenAI(
        { provider: 'openai', apiKey: 'test-key', model: 'gpt-6-sol' },
        'test prompt'
      )

      // 600 uncached at $2/1M + 400 cached at $0.20/1M + 500 output at $10/1M
      expect(result.tokenUsage?.cost).toBeCloseTo(0.0012 + 0.00008 + 0.005, 10)
    })
  })
})
