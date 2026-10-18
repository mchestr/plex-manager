/**
 * Tests for lib/utils/ttl-cache.ts
 */

import { createTtlCache } from '@/lib/utils/ttl-cache'

describe('createTtlCache', () => {
  const now = 1_700_000_000_000
  let clock: jest.SpyInstance<number, []>

  beforeEach(() => {
    clock = jest.spyOn(Date, 'now').mockReturnValue(now)
  })

  afterEach(() => {
    clock.mockRestore()
  })

  it('matches the documented example', () => {
    const cache = createTtlCache<string, number>({ ttlMs: 60_000, maxEntries: 100 })
    cache.set('a', 1)

    expect(cache.get('a')).toBe(1)
    expect(cache.get('b')).toBeUndefined()
  })

  it('expires an entry once its TTL has passed', () => {
    const cache = createTtlCache<string, string>({ ttlMs: 1000, maxEntries: 10 })
    cache.set('k', 'v')

    clock.mockReturnValue(now + 999)
    expect(cache.get('k')).toBe('v')

    clock.mockReturnValue(now + 1000)
    expect(cache.get('k')).toBeUndefined()
  })

  it('restarts the TTL when a key is set again', () => {
    const cache = createTtlCache<string, string>({ ttlMs: 1000, maxEntries: 10 })
    cache.set('k', 'old')
    clock.mockReturnValue(now + 800)
    cache.set('k', 'new')

    clock.mockReturnValue(now + 1500)
    expect(cache.get('k')).toBe('new')
  })

  it('evicts the oldest entry when full', () => {
    const cache = createTtlCache<string, number>({ ttlMs: 60_000, maxEntries: 2 })
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('a', 10) // re-set moves "a" to the newest position
    cache.set('c', 3)

    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('a')).toBe(10)
    expect(cache.get('c')).toBe(3)
  })

  it('drops everything on clear', () => {
    const cache = createTtlCache<string, number>({ ttlMs: 60_000, maxEntries: 10 })
    cache.set('a', 1)
    cache.clear()

    expect(cache.get('a')).toBeUndefined()
  })
})
