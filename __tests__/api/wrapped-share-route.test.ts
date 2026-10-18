/**
 * Tests for app/api/wrapped/share/[token]/route.ts - share API route
 */

import { GET } from '@/app/api/wrapped/share/[token]/route'
import { prisma } from '@/lib/prisma'
import { limitRequest } from '@/lib/security/rate-limit'
import { NextRequest } from 'next/server'

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    plexWrapped: {
      findUnique: jest.fn(),
    },
    wrappedShareVisit: {
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/security/rate-limit', () => ({
  limitRequest: jest.fn(),
}))

// Mock NextRequest and NextResponse to avoid URL property issues
jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server')
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
    NextResponse: {
      ...actual.NextResponse,
      json: jest.fn((data, init) => ({
        json: () => Promise.resolve(data),
        status: init?.status || 200,
        headers: new Headers(init?.headers || {}),
      })),
    },
  }
})

const OWNER_EMAIL = 'test@example.com'

function makeWrapped(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wrapped-1',
    year: 2024,
    status: 'completed',
    summary: 'Test summary',
    archetype: 'The Midnight Marathoner',
    data: JSON.stringify({
      version: 2,
      userId: 'user-1',
      userName: OWNER_EMAIL,
      statistics: {
        totalWatchTime: { total: 1000, movies: 600, shows: 400 },
        moviesWatched: 10,
        showsWatched: 5,
        episodesWatched: 20,
        topMovies: [{ title: 'Test Movie', watchTime: 120, playCount: 1 }],
        topShows: [{ title: 'Test Show', watchTime: 200, playCount: 2, episodesWatched: 4 }],
        leaderboards: {
          watchTime: {
            leaderboard: [{ userId: '9', username: 'jsnow', friendlyName: 'Jon Snow', totalWatchTime: 5000 }],
            totalUsers: 1,
          },
        },
      },
      sections: [],
      summary: 'Test summary',
    }),
    user: { name: 'Test User' },
    ...overrides,
  }
}

function buildRequest(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/wrapped/share/test-token', { headers })
}

describe('GET /api/wrapped/share/[token]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(limitRequest as jest.Mock).mockResolvedValue(null)
    ;(prisma.wrappedShareVisit.create as jest.Mock).mockResolvedValue({})
  })

  it('returns only the share-safe projection for a valid token', async () => {
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(makeWrapped())

    const response = await GET(buildRequest(), { params: Promise.resolve({ token: 'test-token' }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual({
      success: true,
      wrapped: {
        year: 2024,
        ownerName: 'Test User',
        summary: 'Test summary',
        archetypeName: 'The Midnight Marathoner',
        totals: { minutes: 1000, movies: 10, shows: 5, episodes: 20 },
        months: [],
        topMovies: [{ title: 'Test Movie', minutes: 120, plays: 1 }],
        topShows: [{ title: 'Test Show', minutes: 200, plays: 2, episodes: 4 }],
      },
    })
    expect(data.wrapped).not.toHaveProperty('id')
    expect(data.wrapped).not.toHaveProperty('data')
    expect(JSON.stringify(data)).not.toMatch(/leaderboard|Jon Snow|jsnow|user-1|test@example\.com/i)
  })

  it('sends X-Robots-Tag: noindex', async () => {
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(makeWrapped())

    const response = await GET(buildRequest(), { params: Promise.resolve({ token: 'test-token' }) })

    expect(response.headers.get('X-Robots-Tag')).toBe('noindex')
  })

  it('selects only the columns the projection needs and the owner name', async () => {
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(makeWrapped())

    await GET(buildRequest(), { params: Promise.resolve({ token: 'test-token' }) })

    expect(prisma.plexWrapped.findUnique).toHaveBeenCalledWith({
      where: { shareToken: 'test-token' },
      select: {
        id: true,
        year: true,
        status: true,
        summary: true,
        archetype: true,
        data: true,
        user: { select: { name: true } },
      },
    })
  })

  it('should return 400 when token is missing', async () => {
    const response = await GET(buildRequest(), { params: Promise.resolve({ token: '' }) })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Share token is required')
    expect(data.code).toBe('VALIDATION_ERROR')
  })

  it('should return 404 when wrapped not found', async () => {
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)

    const response = await GET(buildRequest(), { params: Promise.resolve({ token: 'invalid-token' }) })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('Wrapped not found')
    expect(data.code).toBe('NOT_FOUND')
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex')
  })

  it('should return 404 when wrapped is not completed', async () => {
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(makeWrapped({ status: 'generating' }))

    const response = await GET(buildRequest(), { params: Promise.resolve({ token: 'test-token' }) })
    const data = await response.json()

    // Security: Use 404 to prevent token enumeration
    expect(response.status).toBe(404)
    expect(data.error).toBe('Wrapped not found')
    expect(prisma.wrappedShareVisit.create).not.toHaveBeenCalled()
  })

  it('records the visit with the wrapped id only', async () => {
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(makeWrapped())

    await GET(
      buildRequest({
        'x-forwarded-for': '192.168.1.1, 10.0.0.1',
        'x-real-ip': '192.168.1.2',
        'user-agent': 'Mozilla/5.0',
        referer: 'https://example.com',
      }),
      { params: Promise.resolve({ token: 'test-token' }) }
    )

    expect(prisma.wrappedShareVisit.create).toHaveBeenCalledWith({
      data: { wrappedId: 'wrapped-1' },
    })
  })

  it('should handle visit tracking failure gracefully', async () => {
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(makeWrapped())
    ;(prisma.wrappedShareVisit.create as jest.Mock).mockRejectedValue(new Error('Database error'))

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

    const response = await GET(buildRequest(), { params: Promise.resolve({ token: 'test-token' }) })
    const data = await response.json()

    // Should still return success even if tracking fails
    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('should handle database errors', async () => {
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'))

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

    const response = await GET(buildRequest(), { params: Promise.resolve({ token: 'test-token' }) })
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toContain('Failed to fetch')
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('short-circuits on rate limit, with noindex', async () => {
    const rateLimited = { status: 429, headers: new Headers() }
    ;(limitRequest as jest.Mock).mockResolvedValue(rateLimited)

    const request = buildRequest()
    const response = await GET(request, { params: Promise.resolve({ token: 'test-token' }) })

    expect(response).toBe(rateLimited)
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex')
    expect(limitRequest).toHaveBeenCalledWith('share', request)
    expect(prisma.plexWrapped.findUnique).not.toHaveBeenCalled()
  })

  it.each([
    ['a null name', null],
    ['an email used as the name', OWNER_EMAIL],
  ])('names the owner "Someone" for %s, never the email', async (_label, name) => {
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(makeWrapped({ user: { name } }))

    const response = await GET(buildRequest(), { params: Promise.resolve({ token: 'test-token' }) })
    const data = await response.json()

    expect(data.wrapped.ownerName).toBe('Someone')
    expect(JSON.stringify(data)).not.toContain(OWNER_EMAIL)
  })
})
