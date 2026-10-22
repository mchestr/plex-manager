import { generateRequestId, runWithRequestContext } from '@/lib/utils/log-context'
import { sanitizeValue as sanitizeForLogging } from '@/lib/utils/log-redaction'
import { createLogger, getBaseLogger, sanitizeUrlForLogging } from '@/lib/utils/logger'

describe('generateRequestId', () => {
  it('should generate a request ID', () => {
    const id = generateRequestId()
    expect(id).toBeDefined()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('should generate unique request IDs', () => {
    const id1 = generateRequestId()
    const id2 = generateRequestId()
    expect(id1).not.toBe(id2)
  })

  it('should generate a UUID, or 32 hex digits without randomUUID, both valid request ids', () => {
    expect(generateRequestId()).toMatch(/^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[0-9a-f]{32})$/i)
  })

  it('should generate many unique IDs without collision', () => {
    const ids = Array.from({ length: 1000 }, () => generateRequestId())
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(1000)
  })
})

describe('runWithRequestContext', () => {
  it('should run synchronous function', () => {
    const result = runWithRequestContext('test-id', 'user-123', () => {
      return 'success'
    })
    expect(result).toBe('success')
  })

  it('should run async function', async () => {
    const result = await runWithRequestContext('test-id', 'user-123', async () => {
      return Promise.resolve('async-success')
    })
    expect(result).toBe('async-success')
  })

  it('should handle undefined userId', () => {
    const result = runWithRequestContext('test-id', undefined, () => {
      return 'success'
    })
    expect(result).toBe('success')
  })

  it('should propagate errors from sync function', () => {
    expect(() => {
      runWithRequestContext('test-id', 'user-123', () => {
        throw new Error('Test error')
      })
    }).toThrow('Test error')
  })

  it('should propagate errors from async function', async () => {
    await expect(
      runWithRequestContext('test-id', 'user-123', async () => {
        throw new Error('Async error')
      })
    ).rejects.toThrow('Async error')
  })

  it('should handle function returning null', () => {
    const result = runWithRequestContext('test-id', 'user-123', () => {
      return null
    })
    expect(result).toBeNull()
  })

  it('should handle function returning undefined', () => {
    const result = runWithRequestContext('test-id', 'user-123', () => {
      return undefined
    })
    expect(result).toBeUndefined()
  })

  it('should handle complex return types', () => {
    const result = runWithRequestContext('test-id', 'user-123', () => {
      return { data: [1, 2, 3], meta: { count: 3 } }
    })
    expect(result).toEqual({ data: [1, 2, 3], meta: { count: 3 } })
  })
})


describe('sanitizeUrlForLogging', () => {
  const originalEnv = process.env.NODE_ENV

  afterEach(() => {
    jest.replaceProperty(process.env, 'NODE_ENV', originalEnv)
  })

  it('should redact in development too (P4.16)', () => {
    jest.replaceProperty(process.env, 'NODE_ENV', 'development')
    const url = 'https://example.com/api?token=secret123&key=value'
    expect(sanitizeUrlForLogging(url)).toBe('https://example.com/api?token=[REDACTED]&key=[REDACTED]')
  })

  it('should redact token parameter in production', () => {
    jest.replaceProperty(process.env, 'NODE_ENV', 'production')
    const url = 'https://example.com/api?token=secret123'
    const result = sanitizeUrlForLogging(url)
    // URL encoding converts [REDACTED] to %5BREDACTED%5D
    expect(result).toMatch(/\[REDACTED\]|%5BREDACTED%5D/)
    expect(result).not.toContain('secret123')
  })

  it('should redact apiKey parameter in production', () => {
    jest.replaceProperty(process.env, 'NODE_ENV', 'production')
    const url = 'https://example.com/api?apiKey=secret123'
    const result = sanitizeUrlForLogging(url)
    // URL encoding converts [REDACTED] to %5BREDACTED%5D
    expect(result).toMatch(/\[REDACTED\]|%5BREDACTED%5D/)
    expect(result).not.toContain('secret123')
  })

  it('should redact multiple sensitive parameters', () => {
    jest.replaceProperty(process.env, 'NODE_ENV', 'production')
    const url = 'https://example.com/api?token=secret1&apiKey=secret2&password=secret3'
    const result = sanitizeUrlForLogging(url)
    // URL encoding converts [REDACTED] to %5BREDACTED%5D
    expect(result).toMatch(/\[REDACTED\]|%5BREDACTED%5D/)
    expect(result).not.toContain('secret1')
    expect(result).not.toContain('secret2')
    expect(result).not.toContain('secret3')
  })

  it('should preserve non-sensitive parameters', () => {
    jest.replaceProperty(process.env, 'NODE_ENV', 'production')
    const url = 'https://example.com/api?token=secret&foo=bar&baz=qux'
    const result = sanitizeUrlForLogging(url)
    expect(result).toContain('foo=bar')
    expect(result).toContain('baz=qux')
  })

  it('should handle URL without query params', () => {
    jest.replaceProperty(process.env, 'NODE_ENV', 'production')
    const url = 'https://example.com/api'
    expect(sanitizeUrlForLogging(url)).toBe(url)
  })

  it('should handle invalid URL gracefully', () => {
    jest.replaceProperty(process.env, 'NODE_ENV', 'production')
    const invalidUrl = 'not a valid url'
    const result = sanitizeUrlForLogging(invalidUrl)
    expect(result).toBeDefined()
    expect(typeof result).toBe('string')
  })

  it('should redact suspicious query params in invalid URLs', () => {
    jest.replaceProperty(process.env, 'NODE_ENV', 'production')
    const url = 'invalid-url?token=secret'
    const result = sanitizeUrlForLogging(url)
    expect(result).toBe('invalid-url?token=[REDACTED]')
  })

  it('should handle empty string', () => {
    jest.replaceProperty(process.env, 'NODE_ENV', 'production')
    expect(sanitizeUrlForLogging('')).toBe('')
  })

  it('should handle URL with fragment', () => {
    jest.replaceProperty(process.env, 'NODE_ENV', 'production')
    const url = 'https://example.com/api?token=secret#section'
    const result = sanitizeUrlForLogging(url)
    // URL encoding converts [REDACTED] to %5BREDACTED%5D
    expect(result).toMatch(/\[REDACTED\]|%5BREDACTED%5D/)
    expect(result).not.toContain('secret')
  })

  it('should handle URL with port', () => {
    jest.replaceProperty(process.env, 'NODE_ENV', 'production')
    const url = 'https://example.com:8080/api?token=secret'
    const result = sanitizeUrlForLogging(url)
    expect(result).toContain('8080')
    // URL encoding converts [REDACTED] to %5BREDACTED%5D
    expect(result).toMatch(/\[REDACTED\]|%5BREDACTED%5D/)
  })
})

describe('sanitizeForLogging', () => {
  const originalEnv = process.env.NODE_ENV

  afterEach(() => {
    jest.replaceProperty(process.env, 'NODE_ENV', originalEnv)
  })

  it('should return primitives as-is', () => {
    expect(sanitizeForLogging('string')).toBe('string')
    expect(sanitizeForLogging(123)).toBe(123)
    expect(sanitizeForLogging(true)).toBe(true)
    expect(sanitizeForLogging(null)).toBe(null)
    expect(sanitizeForLogging(undefined)).toBe(undefined)
  })

  it('should redact long random strings in production', () => {
    jest.replaceProperty(process.env, 'NODE_ENV', 'production')
    const longToken = 'a'.repeat(50) // 50 character alphanumeric string
    expect(sanitizeForLogging(longToken)).toBe('[REDACTED]')
  })

  it('should not redact normal strings', () => {
    jest.replaceProperty(process.env, 'NODE_ENV', 'production')
    const normalString = 'This is a normal string with spaces'
    expect(sanitizeForLogging(normalString)).toBe(normalString)
  })

  it('should redact email addresses in production', () => {
    jest.replaceProperty(process.env, 'NODE_ENV', 'production')
    expect(sanitizeForLogging('user@example.com')).toBe('[REDACTED_EMAIL]')
  })

  it('should redact email addresses in development too (P4.16)', () => {
    jest.replaceProperty(process.env, 'NODE_ENV', 'development')
    expect(sanitizeForLogging('user@example.com')).toBe('[REDACTED_EMAIL]')
  })

  it('should sanitize objects with sensitive fields', () => {
    jest.replaceProperty(process.env, 'NODE_ENV', 'production')
    const obj = {
      username: 'john',
      password: 'secret123',
      contact: 'john@example.com', // Use field name without 'email' keyword
    }
    const result = sanitizeForLogging(obj) as Record<string, unknown>
    expect(result.username).toBe('john')
    expect(result.password).toBe('[REDACTED]')
    expect(result.contact).toBe('[REDACTED_EMAIL]') // Email pattern is detected in value
  })

  it('should sanitize nested objects', () => {
    jest.replaceProperty(process.env, 'NODE_ENV', 'production')
    const obj = {
      user: {
        name: 'john',
        authToken: 'secret123', // Use field name that will be caught as sensitive
        apiKeyValue: 'key456', // Use field name that will be caught as sensitive
      },
    }
    const result = sanitizeForLogging(obj) as Record<string, any>
    expect(result.user.name).toBe('john')
    expect(result.user.authToken).toBe('[REDACTED]')
    expect(result.user.apiKeyValue).toBe('[REDACTED]')
  })

  it('should sanitize arrays', () => {
    jest.replaceProperty(process.env, 'NODE_ENV', 'production')
    const arr = [
      'normal',
      'user@example.com',
      { token: 'secret' },
    ]
    const result = sanitizeForLogging(arr) as any[]
    expect(result[0]).toBe('normal')
    expect(result[1]).toBe('[REDACTED_EMAIL]')
    expect(result[2].token).toBe('[REDACTED]')
  })

  it('should handle arrays of primitives', () => {
    const arr = [1, 2, 3, 'test', true]
    const result = sanitizeForLogging(arr)
    expect(result).toEqual([1, 2, 3, 'test', true])
  })

  it('should handle empty objects', () => {
    expect(sanitizeForLogging({})).toEqual({})
  })

  it('should handle empty arrays', () => {
    expect(sanitizeForLogging([])).toEqual([])
  })

  it('should handle case-insensitive sensitive field matching', () => {
    jest.replaceProperty(process.env, 'NODE_ENV', 'production')
    const obj = {
      Token: 'secret1',
      PASSWORD: 'secret2',
      ApiKey: 'secret3',
    }
    const result = sanitizeForLogging(obj) as Record<string, unknown>
    expect(result.Token).toBe('[REDACTED]')
    expect(result.PASSWORD).toBe('[REDACTED]')
    expect(result.ApiKey).toBe('[REDACTED]')
  })

  it('should handle partial field name matches', () => {
    jest.replaceProperty(process.env, 'NODE_ENV', 'production')
    const obj = {
      userToken: 'secret1',
      apiKeyValue: 'secret2',
      passwordHash: 'secret3',
    }
    const result = sanitizeForLogging(obj) as Record<string, unknown>
    expect(result.userToken).toBe('[REDACTED]')
    expect(result.apiKeyValue).toBe('[REDACTED]')
    expect(result.passwordHash).toBe('[REDACTED]')
  })

  it('should redact sensitive fields in development too (P4.16)', () => {
    jest.replaceProperty(process.env, 'NODE_ENV', 'development')
    const obj = {
      token: 'secret123',
      password: 'pass456',
    }
    const result = sanitizeForLogging(obj) as Record<string, unknown>
    expect(result.token).toBe('[REDACTED]')
    expect(result.password).toBe('[REDACTED]')
  })

  it('should print a circular reference as [Circular]', () => {
    const obj: Record<string, unknown> = { name: 'test' }
    obj.self = obj
    expect(sanitizeForLogging(obj)).toEqual({ name: 'test', self: '[Circular]' })
  })

  it('should handle objects with null prototype', () => {
    const obj = Object.create(null)
    obj.key = 'value'
    const result = sanitizeForLogging(obj) as Record<string, unknown>
    expect(result.key).toBe('value')
  })
})

describe('createLogger', () => {
  it('should create a logger instance', () => {
    const logger = createLogger('test-context')
    expect(logger).toBeDefined()
    expect(typeof logger.debug).toBe('function')
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
  })

  it('should create logger with different contexts', () => {
    const logger1 = createLogger('context-1')
    const logger2 = createLogger('context-2')
    expect(logger1).toBeDefined()
    expect(logger2).toBeDefined()
  })

  it('should not throw when logging', () => {
    const logger = createLogger('test')
    expect(() => logger.debug('debug message')).not.toThrow()
    expect(() => logger.info('info message')).not.toThrow()
    expect(() => logger.warn('warn message')).not.toThrow()
    expect(() => logger.error('error message')).not.toThrow()
  })

  it('should log with metadata', () => {
    const logger = createLogger('test')
    expect(() => logger.info('message', { key: 'value' })).not.toThrow()
  })

  it('should log errors with Error objects', () => {
    const logger = createLogger('test')
    const error = new Error('Test error')
    expect(() => logger.error('Error occurred', error)).not.toThrow()
  })

  it('should log errors with string errors', () => {
    const logger = createLogger('test')
    expect(() => logger.error('Error occurred', 'string error')).not.toThrow()
  })

  it('should handle empty context string', () => {
    const logger = createLogger('')
    expect(logger).toBeDefined()
    expect(() => logger.info('message')).not.toThrow()
  })

  it('should handle special characters in context', () => {
    const logger = createLogger('context-with-special-chars-!@#$%')
    expect(logger).toBeDefined()
    expect(() => logger.info('message')).not.toThrow()
  })

  it('should handle very long context strings', () => {
    const longContext = 'context-' + 'a'.repeat(1000)
    const logger = createLogger(longContext)
    expect(logger).toBeDefined()
  })

  it('should handle logging with empty metadata', () => {
    const logger = createLogger('test')
    expect(() => logger.info('message', {})).not.toThrow()
  })

  it('should handle logging with complex metadata', () => {
    const logger = createLogger('test')
    const metadata = {
      nested: { deep: { value: 'test' } },
      array: [1, 2, 3],
      date: new Date(),
      null: null,
      undefined: undefined,
    }
    expect(() => logger.info('message', metadata)).not.toThrow()
  })

})

describe('getBaseLogger', () => {
  it('should return base logger or null', () => {
    const baseLogger = getBaseLogger()
    // Can be null on client-side or edge runtime
    expect(baseLogger === null || typeof baseLogger === 'object').toBe(true)
  })
})

