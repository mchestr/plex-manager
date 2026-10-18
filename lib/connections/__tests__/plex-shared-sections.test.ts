/**
 * Tests for lib/connections/plex-shared-sections.ts: the plex.tv share list
 * and item section lookups behind the poster proxy's library check (SEC-21).
 */

import { readFileSync } from 'fs'
import path from 'path'

import {
  clearPlexSharedSectionCaches,
  getItemSectionKey,
  getSharedSectionKeys,
} from '@/lib/connections/plex-shared-sections'

const SHARED_SERVERS_XML = readFileSync(
  path.join(__dirname, 'fixtures', 'plex-tv-shared-servers.xml'),
  'utf8'
)

const IDENTITY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="0" claimed="1" machineIdentifier="abc123machine" version="1.41.0"></MediaContainer>`

const SERVER = { url: 'http://plex.local:32400', token: 'owner-token', adminPlexUserId: 'owner-1' }

function textResponse(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: () => Promise.resolve(body),
  }
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  }
}

function abortError() {
  const error = new Error('This operation was aborted')
  error.name = 'AbortError'
  return error
}

/** A response whose body never arrives: reading it only ends when the request is aborted. */
function stalledBody(init: RequestInit) {
  const stall = () =>
    new Promise((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(abortError()))
    })
  return { ok: true, status: 200, statusText: 'OK', text: stall, json: stall }
}

/** Resolves after a real delay, so concurrent callers overlap. */
function later<T>(value: T, ms = 10): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

/** Routes fetch by URL: identity on the server, shared_servers on plex.tv. */
function mockPlexTv(sharedServers: () => Promise<unknown>) {
  ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url.includes('/identity')) return Promise.resolve(textResponse(IDENTITY_XML))
    if (url.includes('plex.tv/api/servers/')) return sharedServers()
    return Promise.reject(new Error(`unexpected fetch ${url}`))
  })
}

function sharedServersCalls() {
  return (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
    String(url).includes('/shared_servers')
  )
}

describe('plex-shared-sections', () => {
  const originalClientId = process.env.PLEX_CLIENT_IDENTIFIER

  beforeEach(() => {
    jest.clearAllMocks()
    clearPlexSharedSectionCaches()
    global.fetch = jest.fn()
    process.env.PLEX_CLIENT_IDENTIFIER = 'test-client-id'
    // Failure paths log a warning by design; keep the test output quiet
    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
    process.env.PLEX_CLIENT_IDENTIFIER = originalClientId
  })

  describe('getSharedSectionKeys', () => {
    it('asks plex.tv for the share list with the owner token', async () => {
      mockPlexTv(() => Promise.resolve(textResponse(SHARED_SERVERS_XML)))

      const sections = await getSharedSectionKeys(SERVER, '1001')

      expect(sections).toEqual(new Set(['1', '3']))
      const [[url, init]] = sharedServersCalls()
      expect(url).toBe('https://plex.tv/api/servers/abc123machine/shared_servers')
      expect(init.headers['X-Plex-Token']).toBe('owner-token')
      expect(init.headers['X-Plex-Client-Identifier']).toBe('test-client-id')
    })

    it("returns 'all' for the server owner without asking plex.tv", async () => {
      expect(await getSharedSectionKeys(SERVER, 'owner-1')).toBe('all')
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('returns an empty set for a user without a share', async () => {
      mockPlexTv(() => Promise.resolve(textResponse(SHARED_SERVERS_XML)))

      const sections = await getSharedSectionKeys(SERVER, '9999')

      expect(sections).toEqual(new Set())
    })

    it('answers every user from one plex.tv call for 10 minutes', async () => {
      const now = Date.now()
      const clock = jest.spyOn(Date, 'now').mockReturnValue(now)
      mockPlexTv(() => Promise.resolve(textResponse(SHARED_SERVERS_XML)))

      await getSharedSectionKeys(SERVER, '1001')
      expect(await getSharedSectionKeys(SERVER, '1003')).toBe('all')
      expect(sharedServersCalls()).toHaveLength(1)

      clock.mockReturnValue(now + 10 * 60 * 1000 + 1)
      await getSharedSectionKeys(SERVER, '1001')
      expect(sharedServersCalls()).toHaveLength(2)
    })

    it('makes one plex.tv load for concurrent callers on a cold cache', async () => {
      ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/identity')) return later(textResponse(IDENTITY_XML))
        return later(textResponse(SHARED_SERVERS_XML))
      })

      const results = await Promise.all(
        ['1001', '1002', '1003', '1001', '9999'].map((id) => getSharedSectionKeys(SERVER, id))
      )

      expect(results).toEqual([
        new Set(['1', '3']),
        new Set(['2']),
        'all',
        new Set(['1', '3']),
        new Set(),
      ])
      expect(global.fetch).toHaveBeenCalledTimes(2) // identity + shared_servers
    })

    it('fails every concurrent caller of a failed load, then loads again', async () => {
      mockPlexTv(() => later(textResponse('Bad gateway', 502)))

      const results = await Promise.all([
        getSharedSectionKeys(SERVER, '1001'),
        getSharedSectionKeys(SERVER, '1002'),
      ])
      expect(results).toEqual([null, null])
      expect(sharedServersCalls()).toHaveLength(1)

      mockPlexTv(() => Promise.resolve(textResponse(SHARED_SERVERS_XML)))
      expect(await getSharedSectionKeys(SERVER, '1001')).toEqual(new Set(['1', '3']))
    })

    it('spends one timeout across the identity and shared_servers calls', async () => {
      const now = Date.now()
      const clock = jest.spyOn(Date, 'now').mockReturnValue(now)
      const timers = jest.spyOn(global, 'setTimeout')
      ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/identity')) {
          clock.mockReturnValue(now + 1000)
          return Promise.resolve(textResponse(IDENTITY_XML))
        }
        return Promise.resolve(textResponse(SHARED_SERVERS_XML))
      })

      await getSharedSectionKeys(SERVER, '1001', { timeoutMs: 3000 })

      const delays = timers.mock.calls.map(([, ms]) => ms)
      expect(delays).toContain(3000) // identity
      expect(delays).toContain(2000) // shared_servers: what is left
    })

    it('times out a shared_servers body that stalls', async () => {
      ;(global.fetch as jest.Mock).mockImplementation((url: string, init: RequestInit) => {
        if (url.includes('/identity')) return Promise.resolve(textResponse(IDENTITY_XML))
        return Promise.resolve(stalledBody(init))
      })

      const started = Date.now()
      expect(await getSharedSectionKeys(SERVER, '1001', { timeoutMs: 50 })).toBeNull()
      expect(Date.now() - started).toBeLessThan(1000)
    })

    it.each([
      ['a non-2xx answer', () => Promise.resolve(textResponse('Unauthorized', 401))],
      ['a timeout', () => Promise.reject(abortError())],
      ['a network error', () => Promise.reject(new TypeError('fetch failed'))],
      ['an unexpected body', () => Promise.resolve(textResponse('<html>oops</html>'))],
    ])('returns null on %s and does not cache the failure', async (_label, failure) => {
      mockPlexTv(failure)

      expect(await getSharedSectionKeys(SERVER, '1001')).toBeNull()

      mockPlexTv(() => Promise.resolve(textResponse(SHARED_SERVERS_XML)))
      expect(await getSharedSectionKeys(SERVER, '1001')).toEqual(new Set(['1', '3']))
    })

    it('returns null when the server identity cannot be read', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValue(new TypeError('connect ECONNREFUSED'))

      expect(await getSharedSectionKeys(SERVER, '1001')).toBeNull()
      expect(sharedServersCalls()).toHaveLength(0)
    })

    it('returns null when PLEX_CLIENT_IDENTIFIER is not configured', async () => {
      delete process.env.PLEX_CLIENT_IDENTIFIER
      mockPlexTv(() => Promise.resolve(textResponse(SHARED_SERVERS_XML)))

      expect(await getSharedSectionKeys(SERVER, '1001')).toBeNull()
    })
  })

  describe('getItemSectionKey', () => {
    it("reads the item's librarySectionID from the server", async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({
          MediaContainer: {
            size: 1,
            librarySectionID: 3,
            librarySectionTitle: 'Kids',
            Metadata: [{ ratingKey: '555', librarySectionID: 3 }],
          },
        })
      )

      const lookup = await getItemSectionKey(SERVER, '555')

      expect(lookup).toEqual({ status: 'found', sectionKey: '3' })
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
      expect(url).toBe('http://plex.local:32400/library/metadata/555')
      expect(url).not.toContain('owner-token')
      expect(init.headers.Accept).toBe('application/json')
      expect(init.headers['X-Plex-Token']).toBe('owner-token')
    })

    it("falls back to the first item's librarySectionID", async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({ MediaContainer: { size: 1, Metadata: [{ ratingKey: '555', librarySectionID: 4 }] } })
      )

      expect(await getItemSectionKey(SERVER, '555')).toEqual({ status: 'found', sectionKey: '4' })
    })

    it('reports a Plex 404 as a missing item', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue(jsonResponse({}, 404))

      expect(await getItemSectionKey(SERVER, '555')).toEqual({ status: 'missing' })
    })

    it('times out a metadata body that stalls', async () => {
      ;(global.fetch as jest.Mock).mockImplementation((_url: string, init: RequestInit) =>
        Promise.resolve(stalledBody(init))
      )

      const started = Date.now()
      expect(await getItemSectionKey(SERVER, '555', { timeoutMs: 50 })).toEqual({ status: 'unknown' })
      expect(Date.now() - started).toBeLessThan(1000)
    })

    it('caches the section key for 24 hours', async () => {
      const now = Date.now()
      const clock = jest.spyOn(Date, 'now').mockReturnValue(now)
      ;(global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({ MediaContainer: { librarySectionID: '2' } })
      )

      await getItemSectionKey(SERVER, '555')
      clock.mockReturnValue(now + 23 * 60 * 60 * 1000)
      expect(await getItemSectionKey(SERVER, '555')).toEqual({ status: 'found', sectionKey: '2' })
      expect(global.fetch).toHaveBeenCalledTimes(1)

      clock.mockReturnValue(now + 24 * 60 * 60 * 1000 + 1)
      await getItemSectionKey(SERVER, '555')
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it.each([
      ['a Plex 401', () => Promise.resolve(jsonResponse({}, 401))],
      ['a Plex 500', () => Promise.resolve(jsonResponse({}, 500))],
      ['a timeout', () => Promise.reject(abortError())],
      ['a network error', () => Promise.reject(new TypeError('fetch failed'))],
      ['a body without librarySectionID', () => Promise.resolve(jsonResponse({ MediaContainer: { size: 0 } }))],
    ])('reports %s as unknown and does not cache it', async (_label, failure) => {
      ;(global.fetch as jest.Mock).mockImplementation(failure)

      expect(await getItemSectionKey(SERVER, '555')).toEqual({ status: 'unknown' })
      await getItemSectionKey(SERVER, '555')
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })
  })
})
