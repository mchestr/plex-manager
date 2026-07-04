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

import { callOpenAI, supportsStructuredOutputs } from '@/lib/wrapped/api-calls'
import { buildValidOutput } from '@/lib/wrapped/__tests__/fixtures'

const validContent = () => JSON.stringify(buildValidOutput())

function mockFetchResponse(content: string, finishReason = 'stop') {
  ;(global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      choices: [{ message: { content }, finish_reason: finishReason }],
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 500,
        total_tokens: 1500,
      },
    }),
  })
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

  describe('supportsStructuredOutputs', () => {
    it.each([
      ['gpt-4o', true],
      ['gpt-4o-mini-2024-07-18', true],
      ['gpt-4.1', true],
      ['gpt-5', true],
      ['gpt-5.2-mini', true],
      ['o3', true],
      ['o4-mini', true],
      ['gpt-4', false],
      ['gpt-4-turbo', false],
      ['gpt-3.5-turbo', false],
      ['o1', false],
    ])('%s → %s', (model, expected) => {
      expect(supportsStructuredOutputs(model)).toBe(expected)
    })
  })
})
