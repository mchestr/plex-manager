/**
 * @jest-environment node
 */

/**
 * Tests for fetchOverseerrStatistics (P0.15: RWP-06).
 *
 * The fixtures use Overseerr's real response shapes: `pageInfo` and `results`
 * on every page, `requestedBy.id`, request `status` and `type`, and
 * `media.status`. The member (Overseerr user 102, plexId 9000123) is on the
 * second page of `/user`, which the old unpaged lookup (10 users) never saw.
 *
 * Requests in 2025: the member has one of each request status, PENDING to
 * COMPLETED; three more belong to someone else or to no one. Overseerr user 7
 * (plexId 1000007) has one completed request in 2025.
 */

import { fetchOverseerrStatistics } from '../overseerr-statistics'
import requestsPage from './fixtures/overseerr-requests.json'
import usersPage1 from './fixtures/overseerr-users-p1.json'
import usersPage2 from './fixtures/overseerr-users-p2.json'

jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

global.fetch = jest.fn()
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>

const config = { url: 'http://overseerr.local:5055', apiKey: 'overseerr-key' }
const member = { plexUserId: '9000123', email: 'dana.plex@example.com' }

type RequestFixture = (typeof requestsPage.results)[number]

function ok(body: unknown): Response {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body } as Response
}

function failed(status: number): Response {
  return { ok: false, status, statusText: 'Internal Server Error', json: async () => ({}) } as Response
}

/**
 * Serves `/user` by `skip`, and `/request` pages in call order with the last
 * one repeating. A request page given as a number is that HTTP error status.
 */
function serve({
  users = [usersPage1, usersPage2] as unknown[],
  requests = [requestsPage] as unknown[],
} = {}) {
  let requestCall = 0
  mockFetch.mockImplementation(async (input) => {
    const url = new URL(String(input))
    if (url.pathname === '/api/v1/user') {
      const pageIndex = Number(url.searchParams.get('skip') ?? 0) / 100
      return ok(users[pageIndex] ?? users[users.length - 1])
    }
    if (url.pathname === '/api/v1/request') {
      const body = requests[Math.min(requestCall++, requests.length - 1)]
      return typeof body === 'number' ? failed(body) : ok(body)
    }
    throw new Error(`Unexpected fetch: ${url}`)
  })
}

/** One `/request` page with Overseerr's `pageInfo`. */
function requestPage(
  results: RequestFixture[],
  { page, pages, total, pageSize = 100 }: { page: number; pages: number; total: number; pageSize?: number }
) {
  return { pageInfo: { pages, pageSize, results: total, page }, results }
}

function requestedUrls(pathname: string): string[] {
  return mockFetch.mock.calls.map(([input]) => String(input)).filter((url) => new URL(url).pathname === pathname)
}

function fixtureRequest(id: number): RequestFixture {
  const found = requestsPage.results.find((request) => request.id === id)
  if (!found) throw new Error(`No fixture request ${id}`)
  return structuredClone(found)
}

/** Copies of the member's completed 2025 request 108 with ids from `firstId`. */
function memberCopies(count: number, firstId: number): RequestFixture[] {
  return Array.from({ length: count }, (_, i) => ({ ...fixtureRequest(108), id: firstId + i }))
}

const memberZeros = {
  totalRequests: 0,
  approvedRequests: 0,
  pendingRequests: 0,
  availableRequests: 0,
  topRequestedGenres: [],
}

describe('fetchOverseerrStatistics', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  describe('finding the member', () => {
    it('pages /user with take and skip and finds the member on page 2', async () => {
      serve()

      const result = await fetchOverseerrStatistics(config, member, 2025)

      expect(requestedUrls('/api/v1/user')).toEqual([
        'http://overseerr.local:5055/api/v1/user?take=100&skip=0',
        'http://overseerr.local:5055/api/v1/user?take=100&skip=100',
      ])
      expect(requestedUrls('/api/v1/request')).toEqual([
        'http://overseerr.local:5055/api/v1/request?take=100&skip=0&sort=added&filter=all',
      ])
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ headers: expect.objectContaining({ 'X-Api-Key': 'overseerr-key' }) })
      )
      expect(result.success).toBe(true)
      expect(result.data?.totalRequests).toBe(5)
    })

    it('prefers the plexId match over an email match on an earlier page', async () => {
      serve()

      // Page 1 holds a local account with this email; page 2 holds the plexId.
      const result = await fetchOverseerrStatistics(
        config,
        { plexUserId: '9000123', email: 'dana.member@example.com' },
        2025
      )

      expect(result.data?.totalRequests).toBe(5)
    })

    it('falls back to the email, in any case, when no plexId matches', async () => {
      serve()

      const byEmailOnly = await fetchOverseerrStatistics(
        config,
        { plexUserId: null, email: 'DANA.PLEX@Example.COM' },
        2025
      )
      const unknownPlexId = await fetchOverseerrStatistics(
        config,
        { plexUserId: '424242', email: 'dana.member@example.com' },
        2025
      )

      expect(byEmailOnly.data?.totalRequests).toBe(5)
      // The local account (Overseerr user 37) made one request in 2025.
      expect(unknownPlexId.data).toMatchObject({ totalRequests: 1, approvedRequests: 1 })
    })

    it('accepts a user page with a null email', async () => {
      const withNullEmail = structuredClone(usersPage1) as { results: { email: string | null }[] }
      withNullEmail.results[0].email = null
      serve({ users: [withNullEmail, usersPage2] })

      const result = await fetchOverseerrStatistics(config, member, 2025)

      expect(result.success).toBe(true)
      expect(result.data?.totalRequests).toBe(5)
    })

    it('does not take an email match on an account linked to another plexId', async () => {
      serve()

      // member7@example.com belongs to Overseerr user 7, linked to plexId 1000007.
      const result = await fetchOverseerrStatistics(
        config,
        { plexUserId: '424242', email: 'member7@example.com' },
        2025
      )

      expect(result).toEqual({ success: true, data: { ...memberZeros, totalServerRequests: 8 } })
    })

    it('stops paging /user after 50 pages', async () => {
      const endless = { ...usersPage1, pageInfo: { ...usersPage1.pageInfo, pages: 500 } }
      serve({ users: [endless] })

      const result = await fetchOverseerrStatistics(config, member, 2025)

      const userUrls = requestedUrls('/api/v1/user')
      expect(userUrls).toHaveLength(50)
      expect(userUrls[49]).toBe('http://overseerr.local:5055/api/v1/user?take=100&skip=4900')
      expect(result).toEqual({ success: true, data: { ...memberZeros, totalServerRequests: 8 } })
    })
  })

  describe('an unmatched member', () => {
    it('gets zeros and is not credited with requests that have no requester', async () => {
      serve()

      const result = await fetchOverseerrStatistics(
        config,
        { plexUserId: '424242', email: 'nobody@example.com' },
        2025
      )

      expect(result).toEqual({ success: true, data: { ...memberZeros, totalServerRequests: 8 } })
    })

    it.each([
      [null, null],
      [null, ''],
      ['', '   '],
      ['   ', null],
      ['not-a-number', null],
    ])('gets zeros without a /user lookup for plexUserId %p and email %p', async (plexUserId, email) => {
      // Overseerr stores a missing email as '', so a blank email would match it.
      const withBlankEmail = structuredClone(usersPage1) as { results: { email: string }[] }
      withBlankEmail.results[6].email = ''
      serve({ users: [withBlankEmail, usersPage2] })

      const result = await fetchOverseerrStatistics(config, { plexUserId, email }, 2025)

      expect(requestedUrls('/api/v1/user')).toEqual([])
      expect(result).toEqual({ success: true, data: { ...memberZeros, totalServerRequests: 8 } })
    })
  })

  describe('request statuses', () => {
    it('counts statuses 1 to 5 as pending 1, approved 2 and available 1', async () => {
      serve()

      const result = await fetchOverseerrStatistics(config, member, 2025)

      expect(result).toEqual({
        success: true,
        data: {
          totalRequests: 5,
          totalServerRequests: 8,
          pendingRequests: 1,
          approvedRequests: 2,
          availableRequests: 1,
          topRequestedGenres: [],
        },
      })
    })

    it('counts declined and failed requests as neither approved nor available', async () => {
      // 110 is declined and 109 failed; both titles are available on the server.
      serve({ requests: [{ ...requestsPage, results: [fixtureRequest(110), fixtureRequest(109)] }] })

      const result = await fetchOverseerrStatistics(config, member, 2025)

      expect(result.data).toMatchObject({
        totalRequests: 2,
        approvedRequests: 0,
        pendingRequests: 0,
        availableRequests: 0,
      })
    })

    it('counts a request with an unknown status as neither pending nor approved, and keeps the page', async () => {
      const unknown = { ...fixtureRequest(111), id: 900, status: 9 }
      serve({ requests: [{ ...requestsPage, results: [unknown, fixtureRequest(112)] }] })

      const result = await fetchOverseerrStatistics(config, member, 2025)

      expect(result).toMatchObject({ success: true })
      expect(result.data).toMatchObject({
        totalRequests: 2,
        approvedRequests: 0,
        pendingRequests: 1,
        availableRequests: 0,
      })
    })

    it.each([
      ['tv', 4, 1],
      ['movie', 4, 0],
      ['movie', 5, 1],
      ['tv', 5, 1],
      ['movie', 3, 0],
      ['movie', 6, 0],
      ['tv', 6, 0],
      ['movie', 7, 0],
      ['tv', 7, 0],
    ])('an approved %s request with media status %i counts %i as available', async (type, mediaStatus, expected) => {
      const approved = fixtureRequest(111)
      approved.type = type
      approved.media.mediaType = type
      approved.media.status = mediaStatus
      serve({ requests: [{ ...requestsPage, results: [approved] }] })

      const result = await fetchOverseerrStatistics(config, member, 2025)

      expect(result.data).toMatchObject({ approvedRequests: 1, availableRequests: expected })
    })

    it.each([
      // is4k, media.status, media.status4k, available
      [true, 5, 3, 0],
      [true, 1, 5, 1],
      [false, 5, 3, 1],
    ])('a 4K request (%p) with media status %i and 4K status %i counts %i as available', async (is4k, mediaStatus, status4k, expected) => {
      const approved = fixtureRequest(111)
      approved.is4k = is4k
      approved.media.status = mediaStatus
      approved.media.status4k = status4k
      serve({ requests: [{ ...requestsPage, results: [approved] }] })

      const result = await fetchOverseerrStatistics(config, member, 2025)

      expect(result.data).toMatchObject({ approvedRequests: 1, availableRequests: expected })
    })

    it.each([
      ['tv', 4],
      ['tv', 5],
      ['movie', 5],
    ])('a pending %s request with media status %i is not available', async (type, mediaStatus) => {
      // A pending request for new seasons of a show that is partly on the server.
      const pending = fixtureRequest(112)
      pending.type = type
      pending.media.mediaType = type
      pending.media.status = mediaStatus
      serve({ requests: [{ ...requestsPage, results: [pending] }] })

      const result = await fetchOverseerrStatistics(config, member, 2025)

      expect(result.data).toMatchObject({ pendingRequests: 1, availableRequests: 0 })
    })

    it('keeps only requests created in the year', async () => {
      serve()

      const result = await fetchOverseerrStatistics(config, member, 2024)

      // 105 (2024-12-31T23:30Z) is the member's; 104 belongs to the owner.
      expect(result.data).toMatchObject({ totalRequests: 1, totalServerRequests: 2, approvedRequests: 1 })
    })

    it('ends the year window just before midnight UTC on January 1', async () => {
      const lastMoment = { ...fixtureRequest(108), id: 200, createdAt: '2025-12-31T23:59:59.999Z' }
      const nextYear = { ...fixtureRequest(108), id: 201, createdAt: '2026-01-01T00:00:00.000Z' }
      serve({ requests: [{ ...requestsPage, results: [nextYear, lastMoment] }] })

      const in2025 = await fetchOverseerrStatistics(config, member, 2025)
      const in2026 = await fetchOverseerrStatistics(config, member, 2026)

      expect(in2025.data).toMatchObject({ totalRequests: 1, totalServerRequests: 1 })
      expect(in2026.data).toMatchObject({ totalRequests: 1, totalServerRequests: 1 })
    })
  })

  describe('request paging', () => {
    const requestUrl = (skip: number) =>
      `http://overseerr.local:5055/api/v1/request?take=100&skip=${skip}&sort=added&filter=all`

    it('fetches pages until pageInfo reports the last one', async () => {
      serve({
        requests: [
          requestPage(memberCopies(100, 1000), { page: 1, pages: 2, total: 110 }),
          requestPage(requestsPage.results, { page: 2, pages: 2, total: 110 }),
        ],
      })

      const result = await fetchOverseerrStatistics(config, member, 2025)

      expect(requestedUrls('/api/v1/request')).toEqual([requestUrl(0), requestUrl(100)])
      expect(result.data).toMatchObject({ totalRequests: 105, totalServerRequests: 108 })
    })

    it('counts a request that moves onto the next page once', async () => {
      // A request added between the fetches pushes 1099 from page 1 to page 2.
      const pageOne = memberCopies(100, 1000)
      serve({
        requests: [
          requestPage(pageOne, { page: 1, pages: 2, total: 111 }),
          requestPage([pageOne[99], ...requestsPage.results], { page: 2, pages: 2, total: 111 }),
        ],
      })

      const result = await fetchOverseerrStatistics(config, member, 2025)

      expect(result.data).toMatchObject({ totalRequests: 105, totalServerRequests: 108 })
    })

    it('advances skip by the rows received when the server sends fewer than take', async () => {
      serve({
        requests: [
          requestPage(memberCopies(50, 1000), { page: 1, pages: 2, total: 60, pageSize: 50 }),
          requestPage(requestsPage.results, { page: 2, pages: 2, total: 60, pageSize: 50 }),
        ],
      })

      const result = await fetchOverseerrStatistics(config, member, 2025)

      expect(requestedUrls('/api/v1/request')).toEqual([requestUrl(0), requestUrl(50)])
      expect(result.data).toMatchObject({ totalRequests: 55, totalServerRequests: 58 })
    })

    it('returns success: false after 200 pages instead of a partial count', async () => {
      // A proxy that ignores skip keeps answering with the same full page.
      serve({ requests: [requestPage(memberCopies(100, 1000), { page: 1, pages: 500, total: 50000 })] })

      const result = await fetchOverseerrStatistics(config, member, 2025)

      const requestUrls = requestedUrls('/api/v1/request')
      expect(requestUrls).toHaveLength(200)
      expect(requestUrls[199]).toBe(requestUrl(19900))
      expect(result.success).toBe(false)
      expect(result.data).toBeUndefined()
      expect(result.error).toContain('200 pages')
    })

    it('returns success: false when a later request page fails', async () => {
      serve({ requests: [requestPage(memberCopies(100, 1000), { page: 1, pages: 2, total: 110 }), 500] })

      const result = await fetchOverseerrStatistics(config, member, 2025)

      expect(requestedUrls('/api/v1/request')).toEqual([requestUrl(0), requestUrl(100)])
      expect(result.success).toBe(false)
      expect(result.data).toBeUndefined()
      expect(result.error).toContain('500')
    })
  })

  describe('response validation', () => {
    it('returns success: false when a request page has no results', async () => {
      serve({ requests: [{ pageInfo: requestsPage.pageInfo }] })

      const result = await fetchOverseerrStatistics(config, member, 2025)

      expect(result.success).toBe(false)
      expect(result.data).toBeUndefined()
      expect(result.error).toContain('unexpected response')
    })

    it('returns success: false when a request page has no pageInfo', async () => {
      serve({ requests: [{ results: requestsPage.results }] })

      const result = await fetchOverseerrStatistics(config, member, 2025)

      expect(result.success).toBe(false)
      expect(result.data).toBeUndefined()
    })

    it('returns success: false when a user page has no results', async () => {
      serve({ users: [{ pageInfo: usersPage1.pageInfo }] })

      const result = await fetchOverseerrStatistics(config, member, 2025)

      expect(result.success).toBe(false)
      expect(result.data).toBeUndefined()
    })

    it('returns success: false when Overseerr answers with an error status', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({}),
      } as Response)

      const result = await fetchOverseerrStatistics(config, member, 2025)

      expect(result.success).toBe(false)
      expect(result.error).toContain('500')
    })
  })
})
