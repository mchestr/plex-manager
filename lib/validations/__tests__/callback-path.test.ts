import { callbackPathSchema, safeCallbackPath } from '@/lib/validations/callback-path'

describe('safeCallbackPath', () => {
  it.each([
    ['/', '/'],
    ['/admin', '/admin'],
    ['/admin/users?page=2', '/admin/users?page=2'],
    ['/rewind/2026#share', '/rewind/2026#share'],
    ['/a/../admin', '/admin'],
    ['/%2F%2Fevil.example', '/%2F%2Fevil.example'],
  ])('keeps the same-origin path %s', (value, expected) => {
    expect(safeCallbackPath(value)).toBe(expected)
  })

  it.each([
    ['an absolute URL', 'https://evil.example/admin'],
    ['a protocol-relative URL', '//evil.example/admin'],
    ['a backslash host', '/\\evil.example'],
    ['a backslash later on', '/admin\\..\\..'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a data: URL', 'data:text/html,<script>alert(1)</script>'],
    ['a relative path', 'admin'],
    ['a tab that hides //', '/\t/evil.example'],
    ['a newline', '/admin\nSet-Cookie: x=1'],
    ['a space', '/ /evil.example'],
    ['dot segments that normalise to //', '/a/..//evil.example'],
    ['an empty string', ''],
    ['a path that is too long', `/${'a'.repeat(600)}`],
  ])('refuses %s', (_label, value) => {
    expect(safeCallbackPath(value)).toBeNull()
  })

  it.each([[undefined], [null], [['/admin']], [42]])('refuses the non-string %p', (value) => {
    expect(safeCallbackPath(value)).toBeNull()
  })
})

describe('callbackPathSchema', () => {
  it('accepts only a value safeCallbackPath keeps unchanged', () => {
    expect(callbackPathSchema.safeParse('/admin').success).toBe(true)
    expect(callbackPathSchema.safeParse('/a/../admin').success).toBe(false)
    expect(callbackPathSchema.safeParse('//evil.example').success).toBe(false)
  })
})
