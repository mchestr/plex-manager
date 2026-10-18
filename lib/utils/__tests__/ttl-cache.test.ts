/**
 * Tests for lib/utils/ttl-cache.ts
 */

import { createLoadingCache, createTtlCache } from '@/lib/utils/ttl-cache'

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

  it('keeps an entry for the TTL given to set, when one is given', () => {
    const cache = createTtlCache<string, string>({ ttlMs: 10_000, maxEntries: 10 })
    cache.set('short', 'v', 1000)
    cache.set('default', 'v')

    clock.mockReturnValue(now + 1000)
    expect(cache.get('short')).toBeUndefined()
    expect(cache.get('default')).toBe('v')
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

  it('drops one entry on delete', () => {
    const cache = createTtlCache<string, number>({ ttlMs: 60_000, maxEntries: 10 })
    cache.set('a', 1)
    cache.set('b', 2)
    cache.delete('a')

    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe(2)
  })

  it('drops everything on clear', () => {
    const cache = createTtlCache<string, number>({ ttlMs: 60_000, maxEntries: 10 })
    cache.set('a', 1)
    cache.clear()

    expect(cache.get('a')).toBeUndefined()
  })
})

describe('createLoadingCache', () => {
  const now = 1_700_000_000_000
  let clock: jest.SpyInstance<number, []>

  beforeEach(() => {
    clock = jest.spyOn(Date, 'now').mockReturnValue(now)
  })

  afterEach(() => {
    clock.mockRestore()
  })

  /** A load whose promise the test settles by hand. */
  function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (error: Error) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }

  it('matches the documented example', async () => {
    const cache = createLoadingCache<string, number>({ ttlMs: 60_000, maxEntries: 100 })
    const load = jest.fn(async () => 42)

    await expect(Promise.all([cache.get('a', load), cache.get('a', load)])).resolves.toEqual([42, 42])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('shares a pending load between concurrent callers', async () => {
    const cache = createLoadingCache<string, string>({ ttlMs: 60_000, maxEntries: 10 })
    const pending = deferred<string>()
    const load = jest.fn(() => pending.promise)

    const first = cache.get('k', load)
    const second = cache.get('k', load)
    pending.resolve('v')

    await expect(Promise.all([first, second])).resolves.toEqual(['v', 'v'])
    await expect(cache.get('k', load)).resolves.toBe('v')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('drops one entry on delete, so the next call loads again', async () => {
    const cache = createLoadingCache<string, string>({ ttlMs: 60_000, maxEntries: 10 })
    await cache.get('k', async () => 'old')
    await cache.get('other', async () => 'kept')

    cache.delete('k')

    await expect(cache.get('k', async () => 'new')).resolves.toBe('new')
    await expect(cache.get('other', async () => 'reloaded')).resolves.toBe('kept')
  })

  it('drops a load that rejects, so the next call loads again', async () => {
    const cache = createLoadingCache<string, string>({ ttlMs: 60_000, maxEntries: 10 })
    const failing = jest.fn(async (): Promise<string> => {
      throw new Error('down')
    })

    await expect(Promise.all([cache.get('k', failing), cache.get('k', failing)])).rejects.toThrow('down')
    expect(failing).toHaveBeenCalledTimes(1)

    await expect(cache.get('k', async () => 'v')).resolves.toBe('v')
  })

  it('drops a value that keep refuses', async () => {
    const cache = createLoadingCache<string, string | null>({
      ttlMs: 60_000,
      maxEntries: 10,
      keep: (value) => value !== null,
    })
    const load = jest.fn(async () => null)

    await expect(cache.get('k', load)).resolves.toBeNull()
    await expect(cache.get('k', load)).resolves.toBeNull()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('reloads when the cached load is older than maxAgeMs', async () => {
    const cache = createLoadingCache<string, number>({ ttlMs: 60_000, maxEntries: 10 })
    let calls = 0
    const load = async () => ++calls
    await cache.get('k', load)

    clock.mockReturnValue(now + 999)
    await expect(cache.get('k', load, { maxAgeMs: 1000 })).resolves.toBe(1)

    clock.mockReturnValue(now + 1000)
    await expect(cache.get('k', load, { maxAgeMs: 1000 })).resolves.toBe(2)
    // The reload replaced the entry for every caller
    await expect(cache.get('k', load)).resolves.toBe(2)
  })

  it('expires a load after the TTL', async () => {
    const cache = createLoadingCache<string, number>({ ttlMs: 1000, maxEntries: 10 })
    let calls = 0
    const load = async () => ++calls
    await cache.get('k', load)

    clock.mockReturnValue(now + 1000)
    await expect(cache.get('k', load)).resolves.toBe(2)
  })

  it('keeps a newer load when an older one fails after being replaced', async () => {
    const cache = createLoadingCache<string, string>({ ttlMs: 60_000, maxEntries: 10 })
    const older = deferred<string>()
    const olderResult = cache.get('k', () => older.promise)

    clock.mockReturnValue(now + 5000)
    await expect(cache.get('k', async () => 'newer', { maxAgeMs: 1000 })).resolves.toBe('newer')
    older.reject(new Error('late failure'))
    await expect(olderResult).rejects.toThrow('late failure')

    await expect(cache.get('k', async () => 'unused')).resolves.toBe('newer')
  })
})
