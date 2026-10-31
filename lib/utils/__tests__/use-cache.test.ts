/**
 * Tests for lib/utils/use-cache.ts
 */

import { cacheLife, cacheTag } from 'next/cache'
import {
  createCacheLifeOutsideUseCacheError,
  createCacheTagOutsideUseCacheError,
} from 'next/dist/server/use-cache/use-cache-messages'

import { cachedOrDirect } from '@/lib/utils/use-cache'

const direct = jest.fn(async () => 'direct')

beforeEach(() => direct.mockClear())

describe('cachedOrDirect', () => {
  it('returns the cached reader inside a request', async () => {
    await expect(cachedOrDirect(async () => 'cached', direct)).resolves.toBe('cached')
    expect(direct).not.toHaveBeenCalled()
  })

  it.each([
    ['a compiled entry outside App Router', new Error('"use cache" cannot be used outside of App Router. Expected a WorkStore.')],
    // The instrumentation bundle (queue worker, bot) leaves the directive uncompiled
    ['cacheTag() outside a compiled entry', createCacheTagOutsideUseCacheError(undefined)],
    ['cacheLife() outside a compiled entry', createCacheLifeOutsideUseCacheError(undefined)],
  ])('reads directly after %s', async (_, error) => {
    await expect(cachedOrDirect(async () => Promise.reject(error), direct)).resolves.toBe('direct')
  })

  it('reads directly when cacheTag() and cacheLife() run without Cache Components', async () => {
    const tagged = async () => {
      cacheTag('app-settings')
      return 'cached'
    }
    const lived = async () => {
      cacheLife('minutes')
      return 'cached'
    }
    await expect(cachedOrDirect(tagged, direct)).resolves.toBe('direct')
    await expect(cachedOrDirect(lived, direct)).resolves.toBe('direct')
  })

  it('rethrows any other error', async () => {
    await expect(cachedOrDirect(async () => Promise.reject(new Error('database down')), direct)).rejects.toThrow('database down')
    expect(direct).not.toHaveBeenCalled()
  })
})
