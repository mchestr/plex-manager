/**
 * Tests for app/api/wrapped/poster/[ratingKey]/route.ts - poster proxy route
 *
 * Covers SEC-21: private caching for sessions, public + noindex only for
 * share tokens, per-viewer access checks that answer 404, one 3 s deadline
 * per request, fast 404s with a negative cache, and one load per Rewind for a
 * burst of parallel posters.
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
import { forgetShareToken } from '@/lib/wrapped/poster-keys'
import { getServerSession } from 'next-auth'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

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

/** The columns the route selects for a share token, minus `data`. */
const SHARED_ROW = { year: 2026, status: 'completed', summary: null, archetype: null }

const ADMIN_SESSION = { user: { id: 'admin-1', isAdmin: true } }
const MEMBER_SESSION = { user: { id: 'member-1', isAdmin: false } }

const SESSION_CACHE = 'private, max-age=86400'
const NOT_FOUND_CACHE = 'private, max-age=60'
const ERROR_CACHE = 'private, no-store'

/** Share tokens in the 43-character base64url shape the route accepts. */
const TOK = 't'.repeat(43)
const BOGUS = 'b'.repeat(43)

function wrappedJson(movieKeys: string[], showKeys: string[] = []) {
  return JSON.stringify({
    statistics: {
      topMovies: movieKeys.map((ratingKey, i) => ({ title: `Movie ${i}`, ratingKey })),
      topShows: showKeys.map((ratingKey, i) => ({ title: `Show ${i}`, ratingKey })),
    },
  })
}

function memberRow(plexUserId: string | null, data: string) {
  return { plexUserId, plexWrapped: [{ data }] }
}

/** The member's own user row: Plex ID plus one Rewind with movie 111 and show 222. */
function mockMember(plexUserId: string | null = 'member-plex-id') {
  ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
    memberRow(plexUserId, wrappedJson(['111'], ['222']))
  )
}

/** Resolves after a real delay, so parallel requests overlap. */
function later<T>(value: T, ms = 10): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

const found = (sectionKey: string) => ({ status: 'found', sectionKey })

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
    ;(getItemSectionKey as jest.Mock).mockResolvedValue({ status: 'unknown' })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('request validation', () => {
    it('rejects a non-numeric rating key', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(ADMIN_SESSION)

      const response = await callRoute(posterUrl('abc'), '../secrets')

      expect(response.status).toBe(400)
      expect(response.headers.get('Cache-Control')).toBe(ERROR_CACHE)
      expect(fetchWithTimeout).not.toHaveBeenCalled()
    })

    it('rejects the rating key ../1 with a code', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(ADMIN_SESSION)

      const response = await callRoute(posterUrl('1'), '../1')

      expect(response.status).toBe(400)
      expect((await response.json()).code).toBe('VALIDATION_ERROR')
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
      // Never stored, so a shared cache cannot replay it to signed-in viewers
      expect(response.headers.get('Cache-Control')).toBe(ERROR_CACHE)
      expect(fetchWithTimeout).not.toHaveBeenCalled()
    })

    it('answers an unexpected error with an unstored 500', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(ADMIN_SESSION)
      ;(prisma.plexServer.findFirst as jest.Mock).mockRejectedValue(new Error('db down'))
      jest.spyOn(console, 'error').mockImplementation(() => {})

      const response = await callRoute(posterUrl('123'), '123')

      expect(response.status).toBe(500)
      expect(response.headers.get('Cache-Control')).toBe(ERROR_CACHE)
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
      // The upstream timeout is what is left of the 3 s deadline, so hold the
      // clock still for an exact value (restored by restoreAllMocks).
      jest.spyOn(Date, 'now').mockReturnValue(1_760_000_000_000)

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
      expect(init.timeoutCoversBody).toBe(true)
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
      ;(getItemSectionKey as jest.Mock).mockResolvedValue(found('3'))
      mockUpstreamImage()

      const response = await callRoute(posterUrl('555'), '555')

      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toBe(SESSION_CACHE)
      expect(getSharedSectionKeys).toHaveBeenCalledWith(
        expect.objectContaining({ url: PLEX_SERVER.url, token: PLEX_SERVER.token }),
        'member-plex-id',
        expect.anything()
      )
      expect(getItemSectionKey).toHaveBeenCalledWith(
        expect.objectContaining({ url: PLEX_SERVER.url }),
        '555',
        expect.anything()
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
      ;(getItemSectionKey as jest.Mock).mockResolvedValue(found('2'))

      const response = await callRoute(posterUrl('555'), '555')

      expect(response.status).toBe(404)
      expect(response.headers.get('Cache-Control')).toBe(NOT_FOUND_CACHE)
      expect(fetchWithTimeout).not.toHaveBeenCalled()
    })

    it('never puts a denied key in the negative cache', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(MEMBER_SESSION)
      mockMember()
      ;(getSharedSectionKeys as jest.Mock).mockResolvedValue(new Set(['1']))
      ;(getItemSectionKey as jest.Mock).mockResolvedValue(found('2'))
      expect((await callRoute(posterUrl('555'), '555')).status).toBe(404)

      // An admin may still fetch it: the member's denial must not block them
      ;(getServerSession as jest.Mock).mockResolvedValue(ADMIN_SESSION)
      mockUpstreamImage()
      const response = await callRoute(posterUrl('555'), '555')

      expect(response.status).toBe(200)
      expect(fetchWithTimeout).toHaveBeenCalledTimes(1)
    })

    it('answers 404 when the item section cannot be read', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(MEMBER_SESSION)
      mockMember()
      ;(getSharedSectionKeys as jest.Mock).mockResolvedValue(new Set(['1']))
      ;(getItemSectionKey as jest.Mock).mockResolvedValue({ status: 'unknown' })

      const response = await callRoute(posterUrl('555'), '555')

      expect(response.status).toBe(404)
      expect(fetchWithTimeout).not.toHaveBeenCalled()
    })

    it('remembers a key the server says does not exist, for every viewer', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(MEMBER_SESSION)
      mockMember()
      ;(getSharedSectionKeys as jest.Mock).mockResolvedValue(new Set(['1']))
      ;(getItemSectionKey as jest.Mock).mockResolvedValue({ status: 'missing' })
      expect((await callRoute(posterUrl('555'), '555')).status).toBe(404)

      ;(getServerSession as jest.Mock).mockResolvedValue(ADMIN_SESSION)
      const response = await callRoute(posterUrl('555'), '555')

      expect(response.status).toBe(404)
      expect(fetchWithTimeout).not.toHaveBeenCalled()
      expect(prisma.plexServer.findFirst).toHaveBeenCalledTimes(1)
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
        ...SHARED_ROW,
        data: wrappedJson(['777']),
      })
      mockUpstreamImage()

      const response = await callRoute(posterUrl('777', TOK), '777')

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

    it("loads the viewer's keys once for a burst of parallel posters", async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(MEMBER_SESSION)
      ;(prisma.user.findUnique as jest.Mock).mockImplementation(() =>
        later(memberRow('member-plex-id', wrappedJson(['111', '112', '113'], ['222', '223'])))
      )
      mockUpstreamImage()
      const parse = jest.spyOn(JSON, 'parse')

      const responses = await Promise.all(
        ['111', '112', '113', '222', '223'].map((key) => callRoute(posterUrl(key), key))
      )

      expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200, 200])
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(1)
      expect(parse).toHaveBeenCalledTimes(1)
      expect(getSharedSectionKeys).not.toHaveBeenCalled()
    })

    it('keeps the rest of the own keys when one stored item is malformed', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(MEMBER_SESSION)
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
        memberRow(
          'member-plex-id',
          JSON.stringify({
            statistics: {
              topMovies: [{ title: 'A', ratingKey: '111' }, { title: 'B', ratingKey: { id: 1 } }, { title: 'no key' }, 'junk'],
              topShows: [{ title: 'S', ratingKey: 333 }],
            },
          })
        )
      )
      ;(getSharedSectionKeys as jest.Mock).mockResolvedValue(null)
      mockUpstreamImage()

      expect((await callRoute(posterUrl('111'), '111')).status).toBe(200)
      expect((await callRoute(posterUrl('333'), '333')).status).toBe(200)
      expect(getSharedSectionKeys).not.toHaveBeenCalled()
    })

    it('reloads the own keys once for a missing key after a minute (a regenerated Rewind)', async () => {
      const now = Date.now()
      const clock = jest.spyOn(Date, 'now').mockReturnValue(now)
      ;(getServerSession as jest.Mock).mockResolvedValue(MEMBER_SESSION)
      mockMember()
      ;(getSharedSectionKeys as jest.Mock).mockResolvedValue(null)
      mockUpstreamImage()
      await callRoute(posterUrl('111'), '111')

      // Within a minute, a non-own key costs no query
      clock.mockReturnValue(now + 30 * 1000)
      expect((await callRoute(posterUrl('555'), '555')).status).toBe(404)
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(1)

      // After a minute, the regenerated Rewind's new key is picked up
      clock.mockReturnValue(now + 61 * 1000)
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
        memberRow('member-plex-id', wrappedJson(['111', '333']))
      )
      const response = await callRoute(posterUrl('333'), '333')

      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toBe(SESSION_CACHE)
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(2)
      expect(getSharedSectionKeys).toHaveBeenCalledTimes(1) // only for 555
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

  describe('one 3 s deadline per request', () => {
    let now: number
    let clock: jest.SpyInstance<number, []>

    beforeEach(() => {
      now = Date.now()
      clock = jest.spyOn(Date, 'now').mockReturnValue(now)
      ;(getServerSession as jest.Mock).mockResolvedValue(MEMBER_SESSION)
      mockMember()
    })

    /** Makes a mocked lookup take `ms` of the request's time. */
    function takes<T>(ms: number, value: T) {
      return () => {
        clock.mockReturnValue(Date.now() + ms)
        return Promise.resolve(value)
      }
    }

    it('gives the lookups the full 3 s budget', async () => {
      ;(getSharedSectionKeys as jest.Mock).mockResolvedValue(new Set(['3']))
      ;(getItemSectionKey as jest.Mock).mockResolvedValue(found('3'))
      mockUpstreamImage()

      await callRoute(posterUrl('555'), '555')

      expect(getSharedSectionKeys).toHaveBeenCalledWith(expect.anything(), 'member-plex-id', {
        timeoutMs: 3000,
      })
      expect(getItemSectionKey).toHaveBeenCalledWith(expect.anything(), '555', { timeoutMs: 3000 })
      expect((fetchWithTimeout as jest.Mock).mock.calls[0][1].timeoutMs).toBe(3000)
    })

    it('gives each later step only what is left', async () => {
      ;(getSharedSectionKeys as jest.Mock).mockImplementation(takes(1000, new Set(['3'])))
      ;(getItemSectionKey as jest.Mock).mockImplementation(takes(1500, found('3')))
      mockUpstreamImage()

      const response = await callRoute(posterUrl('555'), '555')

      expect(response.status).toBe(200)
      expect(getItemSectionKey).toHaveBeenCalledWith(expect.anything(), '555', { timeoutMs: 2000 })
      expect((fetchWithTimeout as jest.Mock).mock.calls[0][1].timeoutMs).toBe(500)
    })

    it('answers 404 without fetching once the lookups use up the deadline', async () => {
      ;(getSharedSectionKeys as jest.Mock).mockImplementation(takes(3000, 'all'))

      const response = await callRoute(posterUrl('555'), '555')

      expect(response.status).toBe(404)
      expect(fetchWithTimeout).not.toHaveBeenCalled()
    })

    it('skips the plex.tv lookup when the database used up the deadline', async () => {
      ;(prisma.user.findUnique as jest.Mock).mockImplementation(
        takes(3000, memberRow('member-plex-id', wrappedJson(['111'])))
      )

      expect((await callRoute(posterUrl('555'), '555')).status).toBe(404)
      expect(getSharedSectionKeys).not.toHaveBeenCalled()
      expect(fetchWithTimeout).not.toHaveBeenCalled()
    })

    it('skips the item lookup once the share list used up the deadline', async () => {
      ;(getSharedSectionKeys as jest.Mock).mockImplementation(takes(3000, new Set(['3'])))

      expect((await callRoute(posterUrl('555'), '555')).status).toBe(404)
      expect(getItemSectionKey).not.toHaveBeenCalled()
    })

    it('does not remember a poster timeout cut short by slow lookups', async () => {
      ;(getSharedSectionKeys as jest.Mock).mockImplementation(takes(1500, 'all'))
      ;(fetchWithTimeout as jest.Mock).mockRejectedValueOnce(abortError())
      expect((await callRoute(posterUrl('555'), '555')).status).toBe(404)

      ;(getServerSession as jest.Mock).mockResolvedValue(ADMIN_SESSION)
      mockUpstreamImage()
      const response = await callRoute(posterUrl('555'), '555')

      expect(response.status).toBe(200)
      expect(fetchWithTimeout).toHaveBeenCalledTimes(2)
    })

    it('remembers a Plex 404 for the poster even after slow lookups', async () => {
      ;(getSharedSectionKeys as jest.Mock).mockImplementation(takes(2500, 'all'))
      ;(fetchWithTimeout as jest.Mock).mockResolvedValue({ ok: false, status: 404 })
      await callRoute(posterUrl('555'), '555')

      ;(getServerSession as jest.Mock).mockResolvedValue(ADMIN_SESSION)
      expect((await callRoute(posterUrl('555'), '555')).status).toBe(404)
      expect(fetchWithTimeout).toHaveBeenCalledTimes(1)
    })
  })

  describe('share-token access', () => {
    beforeEach(() => {
      ;(getServerSession as jest.Mock).mockResolvedValue(null)
    })

    it('serves a key covered by a valid share token as public with noindex', async () => {
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
        ...SHARED_ROW,
        data: wrappedJson(['123']),
      })
      mockUpstreamImage()

      const response = await callRoute(posterUrl('123', TOK), '123')

      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=300')
      expect(response.headers.get('X-Robots-Tag')).toBe('noindex')
      expect(prisma.plexWrapped.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { shareToken: TOK } })
      )
    })

    it('serves a token only the titles its share page shows (top five per list)', async () => {
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
        ...SHARED_ROW,
        data: wrappedJson(['501', '502', '503', '504', '505', '506']),
      })
      mockUpstreamImage()

      expect((await callRoute(posterUrl('505', TOK), '505')).status).toBe(200)

      ;(fetchWithTimeout as jest.Mock).mockClear()
      expect((await callRoute(posterUrl('506', TOK), '506')).status).toBe(401)
      expect(fetchWithTimeout).not.toHaveBeenCalled()
    })

    it('stops serving a token as soon as its link is stopped', async () => {
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
        ...SHARED_ROW,
        data: wrappedJson(['123']),
      })
      mockUpstreamImage()
      expect((await callRoute(posterUrl('123', TOK), '123')).status).toBe(200)

      // disableWrappedShareLink nulls the token, then forgets its cached keys.
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
      forgetShareToken(TOK)

      expect((await callRoute(posterUrl('123', TOK), '123')).status).toBe(401)
    })

    it('refuses a malformed share token with 400 before any lookup', async () => {
      const response = await callRoute(posterUrl('123', 'not-a-token'), '123')

      expect(response.status).toBe(400)
      expect(prisma.plexWrapped.findUnique).not.toHaveBeenCalled()
    })

    it('refuses a token that matches no Rewind', async () => {
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)

      const response = await callRoute(posterUrl('123', BOGUS), '123')

      expect(response.status).toBe(401)
      expect(fetchWithTimeout).not.toHaveBeenCalled()
    })

    it('refuses a token for a key outside its Rewind (no library enumeration)', async () => {
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
        ...SHARED_ROW,
        data: wrappedJson(['123']),
      })

      const response = await callRoute(posterUrl('999', TOK), '999')

      expect(response.status).toBe(401)
      expect(fetchWithTimeout).not.toHaveBeenCalled()
    })

    it('refuses a token for an incomplete Rewind', async () => {
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
        ...SHARED_ROW,
        status: 'generating',
        data: '{}',
      })

      const response = await callRoute(posterUrl('123', TOK), '123')

      expect(response.status).toBe(401)
    })

    it("parses each token's Rewind once for all of its posters", async () => {
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
        ...SHARED_ROW,
        data: wrappedJson(['123', '124']),
      })
      mockUpstreamImage()
      const parse = jest.spyOn(JSON, 'parse')

      await callRoute(posterUrl('123', TOK), '123')
      await callRoute(posterUrl('124', TOK), '124')

      expect(prisma.plexWrapped.findUnique).toHaveBeenCalledTimes(1)
      expect(parse).toHaveBeenCalledTimes(1)
    })

    it("loads and parses a token's Rewind once for a burst of parallel posters", async () => {
      const keys = ['121', '122', '123', '124', '125']
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockImplementation(() =>
        later({ ...SHARED_ROW, data: wrappedJson(keys) })
      )
      mockUpstreamImage()
      const parse = jest.spyOn(JSON, 'parse')

      const responses = await Promise.all(keys.map((key) => callRoute(posterUrl(key, TOK), key)))

      expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200, 200])
      expect(prisma.plexWrapped.findUnique).toHaveBeenCalledTimes(1)
      expect(parse).toHaveBeenCalledTimes(1)
    })

    it('shares one lookup for parallel requests with an invalid token and caches nothing', async () => {
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockImplementation(() => later(null))

      const responses = await Promise.all(
        ['121', '122', '123'].map((key) => callRoute(posterUrl(key, TOK), key))
      )
      expect(responses.map((response) => response.status)).toEqual([401, 401, 401])
      expect(prisma.plexWrapped.findUnique).toHaveBeenCalledTimes(1)

      // The token becomes valid (its Rewind completed): the next request sees it
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
        ...SHARED_ROW,
        data: wrappedJson(['123']),
      })
      mockUpstreamImage()
      expect((await callRoute(posterUrl('123', TOK), '123')).status).toBe(200)
      expect(prisma.plexWrapped.findUnique).toHaveBeenCalledTimes(2)
    })

    it("reloads a token's keys once for a missing key after a minute (a regenerated Rewind)", async () => {
      const now = Date.now()
      const clock = jest.spyOn(Date, 'now').mockReturnValue(now)
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
        ...SHARED_ROW,
        data: wrappedJson(['123']),
      })
      mockUpstreamImage()
      await callRoute(posterUrl('123', TOK), '123')

      clock.mockReturnValue(now + 30 * 1000)
      expect((await callRoute(posterUrl('999', TOK), '999')).status).toBe(401)
      expect(prisma.plexWrapped.findUnique).toHaveBeenCalledTimes(1)

      clock.mockReturnValue(now + 61 * 1000)
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
        ...SHARED_ROW,
        data: wrappedJson(['123', '999']),
      })
      expect((await callRoute(posterUrl('999', TOK), '999')).status).toBe(200)
      expect(prisma.plexWrapped.findUnique).toHaveBeenCalledTimes(2)
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
        ...SHARED_ROW,
        data: wrappedJson(['123']),
      })
      const response = await callRoute(posterUrl('123', TOK), '123')

      expect(response.status).toBe(404)
      expect(fetchWithTimeout).toHaveBeenCalledTimes(1)
    })
  })
})
