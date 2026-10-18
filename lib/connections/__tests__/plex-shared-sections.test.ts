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
  parseSharedServersXml,
} from '@/lib/connections/plex-shared-sections'

const SHARED_SERVERS_XML = readFileSync(
  path.join(__dirname, 'fixtures', 'plex-tv-shared-servers.xml'),
  'utf8'
)

const IDENTITY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="0" claimed="1" machineIdentifier="abc123machine" version="1.41.0"></MediaContainer>`

const SERVER = { url: 'http://plex.local:32400', token: 'owner-token' }

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

  describe('parseSharedServersXml', () => {
    it('collects the shared section keys of each user in the recorded fixture', () => {
      const byUser = parseSharedServersXml(SHARED_SERVERS_XML)

      expect(byUser).not.toBeNull()
      expect(byUser?.get('1001')).toEqual(new Set(['1', '3']))
      expect(byUser?.get('1002')).toEqual(new Set(['2']))
    })

    it("returns 'all' for a user whose share covers every library", () => {
      const byUser = parseSharedServersXml(SHARED_SERVERS_XML)

      expect(byUser?.get('1003')).toBe('all')
    })

    it('skips invites that are not tied to a Plex account yet', () => {
      const byUser = parseSharedServersXml(SHARED_SERVERS_XML)

      expect(byUser?.has('0')).toBe(false)
      expect(byUser?.size).toBe(3)
    })

    it('reads a single SharedServer with a single Section', () => {
      const xml = `<MediaContainer size="1">
        <SharedServer userID="42" allLibraries="0"><Section key="7" shared="1"/></SharedServer>
      </MediaContainer>`

      expect(parseSharedServersXml(xml)?.get('42')).toEqual(new Set(['7']))
    })

    it('treats a server with no shares as an empty list', () => {
      const byUser = parseSharedServersXml('<MediaContainer size="0" identifier="x"/>')

      expect(byUser?.size).toBe(0)
    })

    it('rejects a document without a MediaContainer', () => {
      expect(parseSharedServersXml('<html><body>Gateway timeout</body></html>')).toBeNull()
    })
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

      const sectionKey = await getItemSectionKey(SERVER, '555')

      expect(sectionKey).toBe('3')
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
      expect(url).toBe('http://plex.local:32400/library/metadata/555')
      expect(url).not.toContain('owner-token')
      expect(init.headers.Accept).toBe('application/json')
      expect(init.headers['X-Plex-Token']).toBe('owner-token')
    })

    it('caches the section key for 24 hours', async () => {
      const now = Date.now()
      const clock = jest.spyOn(Date, 'now').mockReturnValue(now)
      ;(global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({ MediaContainer: { librarySectionID: '2' } })
      )

      await getItemSectionKey(SERVER, '555')
      clock.mockReturnValue(now + 23 * 60 * 60 * 1000)
      expect(await getItemSectionKey(SERVER, '555')).toBe('2')
      expect(global.fetch).toHaveBeenCalledTimes(1)

      clock.mockReturnValue(now + 24 * 60 * 60 * 1000 + 1)
      await getItemSectionKey(SERVER, '555')
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it.each([
      ['a Plex 404', () => Promise.resolve(jsonResponse({}, 404))],
      ['a timeout', () => Promise.reject(abortError())],
      ['a network error', () => Promise.reject(new TypeError('fetch failed'))],
      ['a body without librarySectionID', () => Promise.resolve(jsonResponse({ MediaContainer: { size: 0 } }))],
    ])('returns null on %s', async (_label, failure) => {
      ;(global.fetch as jest.Mock).mockImplementation(failure)

      expect(await getItemSectionKey(SERVER, '555')).toBeNull()
    })
  })
})
