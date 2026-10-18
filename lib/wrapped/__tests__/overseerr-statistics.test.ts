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
 * COMPLETED; three more belong to someone else or to no one.
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

/** Serves `/user` by `skip` and `/request` from the given pages. */
function serve({
  users = [usersPage1, usersPage2] as unknown[],
  requests = [requestsPage] as unknown[],
} = {}) {
  mockFetch.mockImplementation(async (input) => {
    const url = new URL(String(input))
    const pageIndex = Number(url.searchParams.get('skip') ?? 0) / 100
    if (url.pathname === '/api/v1/user') return ok(users[pageIndex] ?? users[users.length - 1])
    if (url.pathname === '/api/v1/request') return ok(requests[pageIndex] ?? { results: [] })
    throw new Error(`Unexpected fetch: ${url}`)
  })
}

function requestedUrls(pathname: string): string[] {
  return mockFetch.mock.calls.map(([input]) => String(input)).filter((url) => new URL(url).pathname === pathname)
}

function fixtureRequest(id: number): RequestFixture {
  const found = requestsPage.results.find((request) => request.id === id)
  if (!found) throw new Error(`No fixture request ${id}`)
  return structuredClone(found)
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

    it('gets zeros without a /user lookup when it has no plexUserId or email', async () => {
      serve()

      const result = await fetchOverseerrStatistics(config, { plexUserId: null, email: null }, 2025)

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

    it('keeps only requests created in the year', async () => {
      serve()

      const result = await fetchOverseerrStatistics(config, member, 2024)

      // 105 (2024-12-31T23:30Z) is the member's; 104 belongs to the owner.
      expect(result.data).toMatchObject({ totalRequests: 1, totalServerRequests: 2, approvedRequests: 1 })
    })
  })

  describe('request paging', () => {
    it('fetches the next page while a page is full', async () => {
      const fullPage = {
        ...requestsPage,
        results: Array.from({ length: 100 }, (_, i) => ({ ...fixtureRequest(108), id: 1000 + i })),
      }
      serve({ requests: [fullPage, requestsPage] })

      const result = await fetchOverseerrStatistics(config, member, 2025)

      expect(requestedUrls('/api/v1/request')).toEqual([
        'http://overseerr.local:5055/api/v1/request?take=100&skip=0&sort=added&filter=all',
        'http://overseerr.local:5055/api/v1/request?take=100&skip=100&sort=added&filter=all',
      ])
      expect(result.data).toMatchObject({ totalRequests: 105, totalServerRequests: 108 })
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
