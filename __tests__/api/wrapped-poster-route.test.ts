/**
 * Tests for app/api/wrapped/poster/[ratingKey]/route.ts - poster proxy route
 *
 * Covers SEC-21: private caching for sessions, public + noindex only for
 * share tokens, per-viewer access checks that answer 404, and fast 404s with
 * a negative cache.
 */

import { GET } from '@/app/api/wrapped/poster/[ratingKey]/route'
import {
  getItemSectionKey,
  getSharedSectionKeys,
} from '@/lib/connections/plex-shared-sections'
import { prisma } from '@/lib/prisma'
import { limitRequest } from '@/lib/security/rate-limit'
import { fetchWithTimeout } from '@/lib/utils/fetch-with-timeout'
import { clearPosterAccessCaches } from '@/lib/wrapped/poster-access'
import { getServerSession } from 'next-auth'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    plexWrapped: {
      findUnique: jest.fn(),
    },
    plexServer: {
      findFirst: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/security/rate-limit', () => ({
  limitRequest: jest.fn().mockResolvedValue(null),
}))

jest.mock('@/lib/utils/fetch-with-timeout', () => ({
  fetchWithTimeout: jest.fn(),
}))

jest.mock('@/lib/connections/plex-shared-sections', () => ({
  getSharedSectionKeys: jest.fn(),
  getItemSectionKey: jest.fn(),
}))

jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server')
  class MockNextResponse {
    body: unknown
    status: number
    headers: Headers

    constructor(body?: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body
      this.status = init?.status || 200
      this.headers = new Headers(init?.headers || {})
    }

    static json(data: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      return {
        json: () => Promise.resolve(data),
        status: init?.status || 200,
        headers: new Headers(init?.headers || {}),
      }
    }
  }
  return {
    ...actual,
    NextRequest: class MockNextRequest {
      nextUrl: URL
      method: string
      headers: Headers

      constructor(input: string | URL, init?: { headers?: Record<string, string>; method?: string }) {
        const url = typeof input === 'string' ? new URL(input) : input
        this.nextUrl = url
        this.method = init?.method || 'GET'
        this.headers = new Headers(init?.headers || {})
      }
    },
    NextResponse: MockNextResponse,
  }
})

const PLEX_SERVER = {
  url: 'http://plex.local:32400',
  token: 'server-token',
  adminPlexUserId: 'owner-plex-id',
}

const ADMIN_SESSION = { user: { id: 'admin-1', isAdmin: true } }
const MEMBER_SESSION = { user: { id: 'member-1', isAdmin: false } }

const SESSION_CACHE = 'private, max-age=86400'
const NOT_FOUND_CACHE = 'private, max-age=60'

function wrappedJson(movieKeys: string[], showKeys: string[] = []) {
  return JSON.stringify({
    statistics: {
      topMovies: movieKeys.map((ratingKey, i) => ({ title: `Movie ${i}`, ratingKey })),
      topShows: showKeys.map((ratingKey, i) => ({ title: `Show ${i}`, ratingKey })),
    },
  })
}

/** The member's own user row: Plex ID plus one Rewind with movie 111 and show 222. */
function mockMember(plexUserId: string | null = 'member-plex-id') {
  ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({
    plexUserId,
    plexWrapped: [{ data: wrappedJson(['111'], ['222']) }],
  })
}

async function callRoute(url: string, ratingKey: string) {
  const { NextRequest } = await import('next/server')
  const request = new NextRequest(url)
  return GET(request as never, { params: Promise.resolve({ ratingKey }) })
}

function posterUrl(ratingKey: string, share?: string) {
  const base = `http://localhost/api/wrapped/poster/${ratingKey}`
  return share ? `${base}?share=${share}` : base
}

function mockUpstreamImage() {
  ;(fetchWithTimeout as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'image/jpeg' }),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  })
}

function abortError() {
  const error = new Error('This operation was aborted')
  error.name = 'AbortError'
  return error
}

describe('GET /api/wrapped/poster/[ratingKey]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    clearPosterAccessCaches()
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(PLEX_SERVER)
    ;(getSharedSectionKeys as jest.Mock).mockResolvedValue(new Set<string>())
    ;(getItemSectionKey as jest.Mock).mockResolvedValue(null)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('request validation', () => {
    it('rejects a non-numeric rating key', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(ADMIN_SESSION)

      const response = await callRoute(posterUrl('abc'), '../secrets')

      expect(response.status).toBe(400)
      expect(fetchWithTimeout).not.toHaveBeenCalled()
    })

    it('short-circuits on the poster rate limit before any lookup', async () => {
      const limited = { status: 429 }
      ;(limitRequest as jest.Mock).mockResolvedValueOnce(limited)

      const response = await callRoute(posterUrl('123'), '123')

      expect(response).toBe(limited)
      expect(limitRequest).toHaveBeenCalledWith('poster', expect.anything())
      expect(getServerSession).not.toHaveBeenCalled()
      expect(fetchWithTimeout).not.toHaveBeenCalled()
    })

    it('rejects unauthenticated requests without a share token', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(null)

      const response = await callRoute(posterUrl('123'), '123')

      expect(response.status).toBe(401)
      expect(fetchWithTimeout).not.toHaveBeenCalled()
    })

    it('returns 404 when no Plex server is configured', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(ADMIN_SESSION)
      ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(null)

      const response = await callRoute(posterUrl('123'), '123')

      expect(response.status).toBe(404)
      expect(response.headers.get('Cache-Control')).toBe(NOT_FOUND_CACHE)
    })
  })

  describe('session access', () => {
    it('serves an admin any key with private caching', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(ADMIN_SESSION)
      mockUpstreamImage()

      const response = await callRoute(posterUrl('123'), '123')

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('image/jpeg')
      expect(response.headers.get('Cache-Control')).toBe(SESSION_CACHE)
      expect(response.headers.get('X-Robots-Tag')).toBeNull()
      expect(prisma.user.findUnique).not.toHaveBeenCalled()
      expect(getSharedSectionKeys).not.toHaveBeenCalled()

      // The Plex token goes upstream as a header, never into the URL
      const [url, init] = (fetchWithTimeout as jest.Mock).mock.calls[0]
      expect(url).toContain('/photo/:/transcode')
      expect(url).toContain(encodeURIComponent('/library/metadata/123/thumb'))
      expect(url).not.toContain('server-token')
      expect(init.headers['X-Plex-Token']).toBe('server-token')
      expect(init.timeoutMs).toBe(3000)
    })

    it('serves the server owner any key without asking plex.tv', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(MEMBER_SESSION)
      mockMember('owner-plex-id')
      mockUpstreamImage()

      const response = await callRoute(posterUrl('999'), '999')

      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toBe(SESSION_CACHE)
      expect(getSharedSectionKeys).not.toHaveBeenCalled()
    })

    it.each([
      ['a top movie', '111'],
      ['a top show', '222'],
    ])('serves a member %s from their own Rewind without asking plex.tv', async (_label, key) => {
      ;(getServerSession as jest.Mock).mockResolvedValue(MEMBER_SESSION)
      mockMember()
      mockUpstreamImage()

      const response = await callRoute(posterUrl(key), key)

      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toBe(SESSION_CACHE)
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'member-1' } })
      )
      expect(getSharedSectionKeys).not.toHaveBeenCalled()
      expect(getItemSectionKey).not.toHaveBeenCalled()
    })

    it('serves a member a key from a library section shared with them', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(MEMBER_SESSION)
      mockMember()
      ;(getSharedSectionKeys as jest.Mock).mockResolvedValue(new Set(['1', '3']))
      ;(getItemSectionKey as jest.Mock).mockResolvedValue('3')
      mockUpstreamImage()

      const response = await callRoute(posterUrl('555'), '555')

      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toBe(SESSION_CACHE)
      expect(getSharedSectionKeys).toHaveBeenCalledWith(
        expect.objectContaining({ url: PLEX_SERVER.url, token: PLEX_SERVER.token }),
        'member-plex-id'
      )
      expect(getItemSectionKey).toHaveBeenCalledWith(
        expect.objectContaining({ url: PLEX_SERVER.url }),
        '555'
      )
    })

    it('serves a member with an all-libraries share any key', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(MEMBER_SESSION)
      mockMember()
      ;(getSharedSectionKeys as jest.Mock).mockResolvedValue('all')
      mockUpstreamImage()

      const response = await callRoute(posterUrl('555'), '555')

      expect(response.status).toBe(200)
      expect(getItemSectionKey).not.toHaveBeenCalled()
    })

    it('answers 404 for a key in a section that is not shared with the member', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(MEMBER_SESSION)
      mockMember()
      ;(getSharedSectionKeys as jest.Mock).mockResolvedValue(new Set(['1']))
      ;(getItemSectionKey as jest.Mock).mockResolvedValue('2')

      const response = await callRoute(posterUrl('555'), '555')

      expect(response.status).toBe(404)
      expect(response.headers.get('Cache-Control')).toBe(NOT_FOUND_CACHE)
      expect(fetchWithTimeout).not.toHaveBeenCalled()
    })

    it('answers 404 when the item section cannot be read', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(MEMBER_SESSION)
      mockMember()
      ;(getSharedSectionKeys as jest.Mock).mockResolvedValue(new Set(['1']))
      ;(getItemSectionKey as jest.Mock).mockResolvedValue(null)

      const response = await callRoute(posterUrl('555'), '555')

      expect(response.status).toBe(404)
      expect(fetchWithTimeout).not.toHaveBeenCalled()
    })

    it('denies non-own keys when plex.tv fails, while own keys still load', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(MEMBER_SESSION)
      mockMember()
      ;(getSharedSectionKeys as jest.Mock).mockResolvedValue(null)
      mockUpstreamImage()

      const other = await callRoute(posterUrl('555'), '555')
      expect(other.status).toBe(404)
      expect(getItemSectionKey).not.toHaveBeenCalled()
      expect(fetchWithTimeout).not.toHaveBeenCalled()

      const own = await callRoute(posterUrl('111'), '111')
      expect(own.status).toBe(200)
      expect(own.headers.get('Cache-Control')).toBe(SESSION_CACHE)
    })

    it('denies non-own keys to a member without a Plex account', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(MEMBER_SESSION)
      mockMember(null)

      const response = await callRoute(posterUrl('555'), '555')

      expect(response.status).toBe(404)
      expect(getSharedSectionKeys).not.toHaveBeenCalled()
    })

    it("serves a member viewing someone else's share link as a share response", async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(MEMBER_SESSION)
      mockMember()
      ;(getSharedSectionKeys as jest.Mock).mockResolvedValue(null)
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
        status: 'completed',
        data: wrappedJson(['777']),
      })
      mockUpstreamImage()

      const response = await callRoute(posterUrl('777', 'tok'), '777')

      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toContain('public')
      expect(response.headers.get('X-Robots-Tag')).toBe('noindex')
      expect(getSharedSectionKeys).not.toHaveBeenCalled()
    })

    it("caches the viewer's own keys so later posters need no query", async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(MEMBER_SESSION)
      mockMember()
      mockUpstreamImage()

      await callRoute(posterUrl('111'), '111')
      await callRoute(posterUrl('222'), '222')

      expect(prisma.user.findUnique).toHaveBeenCalledTimes(1)
    })

    it("reloads the viewer's own keys after 10 minutes", async () => {
      const now = Date.now()
      const clock = jest.spyOn(Date, 'now').mockReturnValue(now)
      ;(getServerSession as jest.Mock).mockResolvedValue(MEMBER_SESSION)
      mockMember()
      mockUpstreamImage()

      await callRoute(posterUrl('111'), '111')
      clock.mockReturnValue(now + 10 * 60 * 1000 + 1)
      await callRoute(posterUrl('111'), '111')

      expect(prisma.user.findUnique).toHaveBeenCalledTimes(2)
    })
  })

  describe('share-token access', () => {
    beforeEach(() => {
      ;(getServerSession as jest.Mock).mockResolvedValue(null)
    })

    it('serves a key covered by a valid share token as public with noindex', async () => {
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
        status: 'completed',
        data: wrappedJson(['123']),
      })
      mockUpstreamImage()

      const response = await callRoute(posterUrl('123', 'tok'), '123')

      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toContain('public')
      expect(response.headers.get('Cache-Control')).toContain('max-age=86400')
      expect(response.headers.get('X-Robots-Tag')).toBe('noindex')
      expect(prisma.plexWrapped.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { shareToken: 'tok' } })
      )
    })

    it('refuses a token that matches no Rewind', async () => {
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)

      const response = await callRoute(posterUrl('123', 'bogus'), '123')

      expect(response.status).toBe(401)
      expect(fetchWithTimeout).not.toHaveBeenCalled()
    })

    it('refuses a token for a key outside its Rewind (no library enumeration)', async () => {
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
        status: 'completed',
        data: wrappedJson(['123']),
      })

      const response = await callRoute(posterUrl('999', 'tok'), '999')

      expect(response.status).toBe(401)
      expect(fetchWithTimeout).not.toHaveBeenCalled()
    })

    it('refuses a token for an incomplete Rewind', async () => {
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
        status: 'generating',
        data: '{}',
      })

      const response = await callRoute(posterUrl('123', 'tok'), '123')

      expect(response.status).toBe(401)
    })

    it("parses each token's Rewind once for all of its posters", async () => {
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
        status: 'completed',
        data: wrappedJson(['123', '124']),
      })
      mockUpstreamImage()
      const parse = jest.spyOn(JSON, 'parse')

      await callRoute(posterUrl('123', 'tok'), '123')
      await callRoute(posterUrl('124', 'tok'), '124')

      expect(prisma.plexWrapped.findUnique).toHaveBeenCalledTimes(1)
      expect(parse).toHaveBeenCalledTimes(1)
    })
  })

  describe('fast 404', () => {
    beforeEach(() => {
      ;(getServerSession as jest.Mock).mockResolvedValue(ADMIN_SESSION)
    })

    it('answers 404, not 500, when the Plex request times out', async () => {
      ;(fetchWithTimeout as jest.Mock).mockRejectedValue(abortError())

      const response = await callRoute(posterUrl('123'), '123')

      expect(response.status).toBe(404)
      expect(response.headers.get('Cache-Control')).toBe(NOT_FOUND_CACHE)
    })

    it('answers 404 on a network error', async () => {
      ;(fetchWithTimeout as jest.Mock).mockRejectedValue(new TypeError('fetch failed'))

      const response = await callRoute(posterUrl('123'), '123')

      expect(response.status).toBe(404)
    })

    it('answers 404 when Plex cannot produce the image', async () => {
      ;(fetchWithTimeout as jest.Mock).mockResolvedValue({ ok: false, status: 404 })

      const response = await callRoute(posterUrl('123'), '123')

      expect(response.status).toBe(404)
      expect(response.headers.get('Cache-Control')).toBe(NOT_FOUND_CACHE)
    })

    it('answers a repeat miss for the same key without contacting Plex', async () => {
      ;(fetchWithTimeout as jest.Mock).mockResolvedValue({ ok: false, status: 404 })

      await callRoute(posterUrl('123'), '123')
      const second = await callRoute(posterUrl('123'), '123')

      expect(second.status).toBe(404)
      expect(fetchWithTimeout).toHaveBeenCalledTimes(1)
      expect(prisma.plexServer.findFirst).toHaveBeenCalledTimes(1)

      // Other keys are unaffected
      await callRoute(posterUrl('124'), '124')
      expect(fetchWithTimeout).toHaveBeenCalledTimes(2)
    })

    it('tries Plex again once the miss is five minutes old', async () => {
      const now = Date.now()
      const clock = jest.spyOn(Date, 'now').mockReturnValue(now)
      ;(fetchWithTimeout as jest.Mock).mockRejectedValueOnce(abortError())
      mockUpstreamImage()

      await callRoute(posterUrl('123'), '123')
      clock.mockReturnValue(now + 5 * 60 * 1000 + 1)
      const response = await callRoute(posterUrl('123'), '123')

      expect(response.status).toBe(200)
      expect(fetchWithTimeout).toHaveBeenCalledTimes(2)
    })

    it('answers a known miss to a signed-out share viewer too', async () => {
      ;(fetchWithTimeout as jest.Mock).mockResolvedValue({ ok: false, status: 404 })
      await callRoute(posterUrl('123'), '123')

      ;(getServerSession as jest.Mock).mockResolvedValue(null)
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
        status: 'completed',
        data: wrappedJson(['123']),
      })
      const response = await callRoute(posterUrl('123', 'tok'), '123')

      expect(response.status).toBe(404)
      expect(fetchWithTimeout).toHaveBeenCalledTimes(1)
    })
  })
})
