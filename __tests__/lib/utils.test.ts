import {
  cn,
  parseServerUrl,
  aggregateLlmUsage,
} from '@/lib/utils'

describe('cn', () => {
  it('should merge class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('should handle conditional classes', () => {
    expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz')
  })

  it('should merge Tailwind classes correctly', () => {
    // Tailwind merge should deduplicate conflicting classes
    const result = cn('px-2 py-1', 'px-4')
    // The result should have px-4 (later class wins) and py-1
    expect(result).toContain('py-1')
    expect(result).toContain('px-4')
    expect(result).not.toContain('px-2')
  })

  it('should handle empty inputs', () => {
    expect(cn()).toBe('')
  })

  it('should handle undefined and null', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar')
  })

  it('should handle arrays of classes', () => {
    expect(cn(['foo', 'bar'], 'baz')).toBe('foo bar baz')
  })

  it('should handle objects with boolean values', () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz')
  })

  it('should handle complex nested structures', () => {
    expect(cn('base', ['nested', { conditional: true }], undefined, 'final')).toContain('base')
    expect(cn('base', ['nested', { conditional: true }], undefined, 'final')).toContain('nested')
    expect(cn('base', ['nested', { conditional: true }], undefined, 'final')).toContain('conditional')
    expect(cn('base', ['nested', { conditional: true }], undefined, 'final')).toContain('final')
  })

  it('should handle long strings without issues', () => {
    const longClass = 'a'.repeat(1000)
    expect(cn(longClass)).toBe(longClass)
  })
})

describe('getBaseUrl', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('should prefer NEXT_PUBLIC_APP_URL', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.com'
    process.env.NEXTAUTH_URL = 'https://fallback.com'
    jest.replaceProperty(process.env, 'NODE_ENV', 'production')

    const { getBaseUrl } = require('@/lib/env')
    expect(getBaseUrl()).toBe('https://example.com')
  })

  it('should fallback to NEXTAUTH_URL when NEXT_PUBLIC_APP_URL is not set', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    process.env.NEXTAUTH_URL = 'https://fallback.com'
    jest.replaceProperty(process.env, 'NODE_ENV', 'production')

    const { getBaseUrl } = require('@/lib/env')
    expect(getBaseUrl()).toBe('https://fallback.com')
  })

  it('should use localhost in development when no env vars are set', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.NEXTAUTH_URL
    jest.replaceProperty(process.env, 'NODE_ENV', 'development')

    const { getBaseUrl } = require('@/lib/env')
    expect(getBaseUrl()).toBe('http://localhost:3000')
  })

  it('should throw error in production when no env vars are set', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.NEXTAUTH_URL
    jest.replaceProperty(process.env, 'NODE_ENV', 'production')

    const { getBaseUrl } = require('@/lib/env')
    expect(() => getBaseUrl()).toThrow('Base URL is not configured')
  })

  it('should handle NEXT_PUBLIC_APP_URL with trailing slash', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.com/'
    jest.replaceProperty(process.env, 'NODE_ENV', 'production')

    const { getBaseUrl } = require('@/lib/env')
    expect(getBaseUrl()).toBe('https://example.com/')
  })

  it('should handle NEXTAUTH_URL with port', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    process.env.NEXTAUTH_URL = 'https://example.com:8080'
    jest.replaceProperty(process.env, 'NODE_ENV', 'production')

    const { getBaseUrl } = require('@/lib/env')
    expect(getBaseUrl()).toBe('https://example.com:8080')
  })

  it('should handle empty string environment variables as unset', () => {
    process.env.NEXT_PUBLIC_APP_URL = ''
    process.env.NEXTAUTH_URL = ''
    jest.replaceProperty(process.env, 'NODE_ENV', 'production')

    const { getBaseUrl } = require('@/lib/env')
    expect(() => getBaseUrl()).toThrow('Base URL is not configured')
  })

  it('should work in test environment with no env vars', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.NEXTAUTH_URL
    jest.replaceProperty(process.env, 'NODE_ENV', 'test')

    const { getBaseUrl } = require('@/lib/env')
    expect(() => getBaseUrl()).toThrow('Base URL is not configured')
  })
})

describe('parseServerUrl', () => {
  it('should parse HTTPS URL with port', () => {
    const result = parseServerUrl('https://example.com:32400')
    expect(result).toEqual({
      protocol: 'https',
      hostname: 'example.com',
      port: 32400,
    })
  })

  it('should parse HTTP URL with port', () => {
    const result = parseServerUrl('http://192.168.1.100:8181')
    expect(result).toEqual({
      protocol: 'http',
      hostname: '192.168.1.100',
      port: 8181,
    })
  })

  it('should parse HTTPS URL without port (default 443)', () => {
    const result = parseServerUrl('https://example.com')
    expect(result).toEqual({
      protocol: 'https',
      hostname: 'example.com',
      port: 443,
    })
  })

  it('should parse HTTP URL without port (default 80)', () => {
    const result = parseServerUrl('http://example.com')
    expect(result).toEqual({
      protocol: 'http',
      hostname: 'example.com',
      port: 80,
    })
  })

  it('should default to HTTPS when no protocol is specified', () => {
    const result = parseServerUrl('example.com:32400')
    expect(result).toEqual({
      protocol: 'https',
      hostname: 'example.com',
      port: 32400,
    })
  })

  it('should default to HTTPS and port 443 when only hostname is provided', () => {
    const result = parseServerUrl('example.com')
    expect(result).toEqual({
      protocol: 'https',
      hostname: 'example.com',
      port: 443,
    })
  })

  it('should handle URLs with whitespace', () => {
    const result = parseServerUrl('  https://example.com:8080  ')
    expect(result).toEqual({
      protocol: 'https',
      hostname: 'example.com',
      port: 8080,
    })
  })

  it('should handle IPv6 addresses', () => {
    const result = parseServerUrl('http://[::1]:8080')
    expect(result).toEqual({
      protocol: 'http',
      hostname: '[::1]', // URL object preserves brackets for IPv6
      port: 8080,
    })
  })

  it('should handle localhost', () => {
    const result = parseServerUrl('http://localhost:3000')
    expect(result).toEqual({
      protocol: 'http',
      hostname: 'localhost',
      port: 3000,
    })
  })

  it('should handle subdomains', () => {
    const result = parseServerUrl('https://api.example.com:443')
    expect(result).toEqual({
      protocol: 'https',
      hostname: 'api.example.com',
      port: 443,
    })
  })

  it('should throw error for invalid protocol', () => {
    expect(() => parseServerUrl('ftp://example.com')).toThrow('Protocol must be http or https')
  })

  it('should throw error for empty string', () => {
    expect(() => parseServerUrl('')).toThrow('Invalid URL format')
  })

  it('should throw error for invalid port (too high)', () => {
    expect(() => parseServerUrl('https://example.com:99999')).toThrow('Invalid URL format')
  })

  it('should throw error for invalid port (zero)', () => {
    expect(() => parseServerUrl('https://example.com:0')).toThrow(
      'Port must be a number between 1 and 65535'
    )
  })

  it('should throw error for invalid port (negative)', () => {
    expect(() => parseServerUrl('https://example.com:-1')).toThrow('Invalid URL format')
  })

  it('should throw error for invalid port (non-numeric)', () => {
    expect(() => parseServerUrl('https://example.com:abc')).toThrow('Invalid URL format')
  })

  it('should throw error for URL without hostname', () => {
    expect(() => parseServerUrl('https://:8080')).toThrow('Invalid URL format')
  })

  it('should throw error for malformed URL', () => {
    expect(() => parseServerUrl('not a url at all')).toThrow('Invalid URL format')
  })

  it('should handle URL with path (ignores path)', () => {
    const result = parseServerUrl('https://example.com:8080/path/to/resource')
    expect(result).toEqual({
      protocol: 'https',
      hostname: 'example.com',
      port: 8080,
    })
  })

  it('should handle URL with query params (ignores query)', () => {
    const result = parseServerUrl('https://example.com:8080?foo=bar')
    expect(result).toEqual({
      protocol: 'https',
      hostname: 'example.com',
      port: 8080,
    })
  })

  it('should handle mixed case protocol', () => {
    const result = parseServerUrl('HTTPS://example.com:8080')
    expect(result).toEqual({
      protocol: 'https',
      hostname: 'example.com',
      port: 8080,
    })
  })
})

describe('aggregateLlmUsage', () => {
  it('should return null for empty array', () => {
    expect(aggregateLlmUsage([])).toBeNull()
  })

  it('should aggregate single record', () => {
    const records = [
      {
        totalTokens: 100,
        promptTokens: 60,
        completionTokens: 40,
        cost: 0.05,
        provider: 'openai',
        model: 'gpt-4',
      },
    ]

    const result = aggregateLlmUsage(records)
    expect(result).toEqual({
      totalTokens: 100,
      promptTokens: 60,
      completionTokens: 40,
      cost: 0.05,
      provider: 'openai',
      model: 'gpt-4',
      count: 1,
    })
  })

  it('should aggregate multiple records', () => {
    const records = [
      {
        totalTokens: 100,
        promptTokens: 60,
        completionTokens: 40,
        cost: 0.05,
        provider: 'openai',
        model: 'gpt-4',
      },
      {
        totalTokens: 200,
        promptTokens: 120,
        completionTokens: 80,
        cost: 0.1,
        provider: 'openai',
        model: 'gpt-4',
      },
      {
        totalTokens: 150,
        promptTokens: 90,
        completionTokens: 60,
        cost: 0.075,
        provider: 'anthropic',
        model: 'claude-3',
      },
    ]

    const result = aggregateLlmUsage(records)
    expect(result).toEqual({
      totalTokens: 450,
      promptTokens: 270,
      completionTokens: 180,
      cost: expect.closeTo(0.225, 5), // Handle floating point precision
      provider: 'anthropic', // Last record's provider
      model: 'claude-3', // Last record's model
      count: 3,
    })
  })

  it('should handle records with zero values', () => {
    const records = [
      {
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        cost: 0,
        provider: 'openai',
        model: 'gpt-4',
      },
      {
        totalTokens: 100,
        promptTokens: 60,
        completionTokens: 40,
        cost: 0.05,
        provider: 'openai',
        model: 'gpt-4',
      },
    ]

    const result = aggregateLlmUsage(records)
    expect(result).toEqual({
      totalTokens: 100,
      promptTokens: 60,
      completionTokens: 40,
      cost: 0.05,
      provider: 'openai',
      model: 'gpt-4',
      count: 2,
    })
  })

  it('should handle records with null provider and model', () => {
    const records = [
      {
        totalTokens: 100,
        promptTokens: 60,
        completionTokens: 40,
        cost: 0.05,
        provider: null,
        model: null,
      },
    ]

    const result = aggregateLlmUsage(records)
    expect(result).toEqual({
      totalTokens: 100,
      promptTokens: 60,
      completionTokens: 40,
      cost: 0.05,
      provider: null,
      model: null,
      count: 1,
    })
  })

  it('should use last record provider and model when mixed', () => {
    const records = [
      {
        totalTokens: 100,
        promptTokens: 60,
        completionTokens: 40,
        cost: 0.05,
        provider: 'openai',
        model: 'gpt-4',
      },
      {
        totalTokens: 200,
        promptTokens: 120,
        completionTokens: 80,
        cost: 0.1,
        provider: null,
        model: null,
      },
    ]

    const result = aggregateLlmUsage(records)
    expect(result).toEqual({
      totalTokens: 300,
      promptTokens: 180,
      completionTokens: 120,
      cost: expect.closeTo(0.15, 5), // Handle floating point precision
      provider: null,
      model: null,
      count: 2,
    })
  })

  it('should handle large numbers', () => {
    const records = [
      {
        totalTokens: 1000000,
        promptTokens: 600000,
        completionTokens: 400000,
        cost: 50.0,
        provider: 'openai',
        model: 'gpt-4',
      },
      {
        totalTokens: 2000000,
        promptTokens: 1200000,
        completionTokens: 800000,
        cost: 100.0,
        provider: 'openai',
        model: 'gpt-4',
      },
    ]

    const result = aggregateLlmUsage(records)
    expect(result).toEqual({
      totalTokens: 3000000,
      promptTokens: 1800000,
      completionTokens: 1200000,
      cost: 150.0,
      provider: 'openai',
      model: 'gpt-4',
      count: 2,
    })
  })

  it('should handle fractional costs accurately', () => {
    const records = [
      {
        totalTokens: 100,
        promptTokens: 60,
        completionTokens: 40,
        cost: 0.001,
        provider: 'openai',
        model: 'gpt-4',
      },
      {
        totalTokens: 100,
        promptTokens: 60,
        completionTokens: 40,
        cost: 0.002,
        provider: 'openai',
        model: 'gpt-4',
      },
    ]

    const result = aggregateLlmUsage(records)
    expect(result?.cost).toBeCloseTo(0.003, 5)
  })

  it('should handle many records', () => {
    const records = Array.from({ length: 1000 }, (_, i) => ({
      totalTokens: 100,
      promptTokens: 60,
      completionTokens: 40,
      cost: 0.05,
      provider: i === 999 ? 'final-provider' : 'openai',
      model: i === 999 ? 'final-model' : 'gpt-4',
    }))

    const result = aggregateLlmUsage(records)
    expect(result).toEqual({
      totalTokens: 100000,
      promptTokens: 60000,
      completionTokens: 40000,
      cost: expect.closeTo(50.0, 2), // Handle floating point precision with many additions
      provider: 'final-provider',
      model: 'final-model',
      count: 1000,
    })
  })
})
