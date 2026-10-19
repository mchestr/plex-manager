import { llmProviderSchema, setupLLMProviderSchema } from '@/lib/validations/llm-provider'
import { createBaseUrlSchema } from '@/lib/validations/shared-schemas'

describe('llmProviderSchema', () => {
  it.each(['openai', 'anthropic', 'google'] as const)('accepts %s with a key and a model', (provider) => {
    expect(llmProviderSchema.safeParse({ provider, apiKey: 'key-123', model: 'm' }).success).toBe(true)
  })

  it.each(['openai', 'anthropic', 'google'] as const)('requires a key for %s', (provider) => {
    const result = llmProviderSchema.safeParse({ provider, apiKey: '', model: 'm' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('API key is required')
  })

  it('requires a model', () => {
    expect(llmProviderSchema.safeParse({ provider: 'openai', apiKey: 'k', model: '' }).success).toBe(false)
  })

  it('openai-compatible requires baseUrl and makes the key optional', () => {
    expect(llmProviderSchema.safeParse({ provider: 'openai-compatible', model: 'qwen3.6:27b' }).success).toBe(false)
    const parsed = llmProviderSchema.parse({
      provider: 'openai-compatible',
      model: 'qwen3.6:27b',
      baseUrl: 'http://localhost:11434/v1/',
    })
    expect(parsed).toEqual({ provider: 'openai-compatible', model: 'qwen3.6:27b', baseUrl: 'http://localhost:11434/v1' })
  })

  it('accepts effort, temperature and maxTokens on every variant', () => {
    const extras = { effort: 'low', temperature: 0.5, maxTokens: 2000 }
    expect(llmProviderSchema.safeParse({ provider: 'anthropic', apiKey: 'k', model: 'm', ...extras }).success).toBe(true)
    expect(
      llmProviderSchema.safeParse({ provider: 'openai-compatible', baseUrl: 'http://h/v1', model: 'm', ...extras }).success
    ).toBe(true)
    expect(llmProviderSchema.safeParse({ provider: 'openai', apiKey: 'k', model: 'm', effort: 'turbo' }).success).toBe(false)
    expect(llmProviderSchema.safeParse({ provider: 'openai', apiKey: 'k', model: 'm', temperature: 3 }).success).toBe(false)
  })

  it('rejects an unknown provider', () => {
    expect(llmProviderSchema.safeParse({ provider: 'cohere', apiKey: 'k', model: 'm' }).success).toBe(false)
  })
})

describe('createBaseUrlSchema', () => {
  const schema = createBaseUrlSchema()

  it.each([
    'file:///etc/passwd',
    'javascript:alert(1)',
    'ftp://host/v1',
    'http://user:pass@host/v1',
    'http://user@host/v1',
    'http://host/v1?x=1',
    'http://host/v1?',
    'http://host/v1#frag',
    'not a url',
    '',
  ])('rejects %s', (url) => {
    expect(schema.safeParse(url).success).toBe(false)
  })

  it('keeps the /v1 path and drops a trailing slash', () => {
    expect(schema.parse('https://openrouter.ai/api/v1/')).toBe('https://openrouter.ai/api/v1')
    expect(schema.parse('http://localhost:11434/v1')).toBe('http://localhost:11434/v1')
  })

  it('verifies the documented example', () => {
    expect(createBaseUrlSchema().parse('http://localhost:11434/v1/')).toBe('http://localhost:11434/v1')
    expect(createBaseUrlSchema().safeParse('http://user:pass@host/v1').success).toBe(false)
  })
})

describe('setupLLMProviderSchema', () => {
  it('stays OpenAI-only with an optional model and no base URL', () => {
    expect(setupLLMProviderSchema.parse({ provider: 'openai', apiKey: 'sk-abc123' }).model).toBeUndefined()
    expect(setupLLMProviderSchema.safeParse({ provider: 'anthropic', apiKey: 'k' }).success).toBe(false)
    expect(setupLLMProviderSchema.parse({ provider: 'openai', apiKey: 'k', baseUrl: 'http://evil/v1' })).not.toHaveProperty(
      'baseUrl'
    )
  })

  it('names the missing provider and key', () => {
    expect(setupLLMProviderSchema.safeParse({ apiKey: 'k' }).error?.issues[0]?.message).toBe('Please select a provider')
    expect(setupLLMProviderSchema.safeParse({ provider: 'openai', apiKey: '' }).error?.issues[0]?.message).toBe(
      'API key is required'
    )
  })
})
