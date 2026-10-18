/**
 * Security tests for wrapped sharing
 * Tests that anonymous users can access shared wraps, but only completed ones,
 * and that a share response carries only the share-safe projection.
 */

import { GET as getSharedWrapped } from '@/app/api/wrapped/share/[token]/route'
import { prisma } from '@/lib/prisma'
import { shareRateLimiter } from '@/lib/security/rate-limit'

// Mock dependencies
jest.mock('next/server', () => ({
  NextRequest: class NextRequest {
    constructor(url, init = {}) {
      this.nextUrl = new URL(url)
      this.method = init.method || 'GET'
      this.headers = {
        get: jest.fn((name) => {
          const headers = init.headers || {}
          return headers[name.toLowerCase()] || null
        }),
      }
    }
  },
  NextResponse: {
    json: jest.fn((data, init) => ({
      json: () => Promise.resolve(data),
      status: init?.status || 200,
      headers: new Headers(init?.headers || {}),
    })),
  },
}))

jest.mock('@/lib/security/rate-limit', () => ({
  shareRateLimiter: jest.fn(),
}))

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

describe('Wrapped Sharing Security', () => {
  const mockCompletedWrapped = {
    id: 'wrapped-1',
    userId: 'user-1',
    year: 2024,
    status: 'completed',
    shareToken: 'valid-share-token',
    summary: 'Test summary',
    generatedAt: new Date('2024-01-01'),
    archetype: null,
    data: JSON.stringify({
      userId: 'user-1',
      userName: 'user@example.com',
      sections: [{ id: 'hero-1', type: 'hero', title: 'Welcome' }],
      summary: 'Test summary',
      statistics: {
        totalWatchTime: { total: 100, movies: 50, shows: 50 },
        moviesWatched: 1,
        showsWatched: 1,
        episodesWatched: 2,
        topMovies: [],
        topShows: [],
        serverStats: { serverName: 'Private Server', totalStorage: 1, totalStorageFormatted: '1 B', librarySize: { movies: 1, shows: 1, episodes: 1 } },
        overseerrStats: { totalRequests: 1, totalServerRequests: 50, approvedRequests: 1, pendingRequests: 0, topRequestedGenres: [] },
        leaderboards: {
          topContent: { movies: [], shows: [] },
          watchTime: {
            leaderboard: [{ userId: '9', username: 'jsnow', friendlyName: 'Jon Snow', totalWatchTime: 5000, moviesWatchTime: 0, showsWatchTime: 5000 }],
            totalUsers: 1,
          },
        },
      },
    }),
    user: {
      name: 'Test User',
    },
  }

  const mockGeneratingWrapped = {
    ...mockCompletedWrapped,
    status: 'generating',
  }

  const mockFailedWrapped = {
    ...mockCompletedWrapped,
    status: 'failed',
    error: 'Generation failed',
  }

  const mockPendingWrapped = {
    ...mockCompletedWrapped,
    status: 'pending',
  }

  const createMockRequest = (headers: Record<string, string> = {}): any => {
    return {
      nextUrl: new URL('http://localhost:3000/api/wrapped/share/valid-share-token'),
      method: 'GET',
      headers: {
        get: (name: string) => {
          const allHeaders = {
            'user-agent': 'Mozilla/5.0',
            'x-forwarded-for': '192.168.1.1',
            ...headers,
          }
          return allHeaders[name.toLowerCase()] || null
        },
      },
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(shareRateLimiter as jest.Mock).mockResolvedValue(null)
  })

  describe('GET /api/wrapped/share/[token]', () => {
    it('should allow anonymous user to access completed wrapped', async () => {
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(mockCompletedWrapped)
      ;(prisma.wrappedShareVisit.create as jest.Mock).mockResolvedValue({
        id: 'visit-1',
        wrappedId: 'wrapped-1',
        createdAt: new Date(),
      })

      const request = createMockRequest()
      const response = await getSharedWrapped(request, { params: { token: 'valid-share-token' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.wrapped).toBeTruthy()
      expect(data.wrapped.ownerName).toBe('Test User')
      expect(response.headers.get('X-Robots-Tag')).toBe('noindex')
      expect(prisma.plexWrapped.findUnique).toHaveBeenCalledWith({
        where: { shareToken: 'valid-share-token' },
        select: expect.objectContaining({
          user: { select: { name: true } },
        }),
      })
    })

    it('should reject access to generating wrapped', async () => {
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(mockGeneratingWrapped)

      const request = createMockRequest()
      const response = await getSharedWrapped(request, { params: { token: 'valid-share-token' } })
      const data = await response.json()

      // Security: Use 404 to prevent token enumeration
      expect(response.status).toBe(404)
      expect(data.error).toBe('Wrapped not found')
    })

    it('should reject access to failed wrapped', async () => {
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(mockFailedWrapped)

      const request = createMockRequest()
      const response = await getSharedWrapped(request, { params: { token: 'valid-share-token' } })
      const data = await response.json()

      // Security: Use 404 to prevent token enumeration
      expect(response.status).toBe(404)
      expect(data.error).toBe('Wrapped not found')
    })

    it('should reject access to pending wrapped', async () => {
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(mockPendingWrapped)

      const request = createMockRequest()
      const response = await getSharedWrapped(request, { params: { token: 'valid-share-token' } })
      const data = await response.json()

      // Security: Use 404 to prevent token enumeration
      expect(response.status).toBe(404)
      expect(data.error).toBe('Wrapped not found')
    })

    it('should return 404 for invalid token', async () => {
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)

      const request = createMockRequest()
      const response = await getSharedWrapped(request, { params: { token: 'invalid-token' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Wrapped not found')
    })

    it('should return 400 for missing token', async () => {
      const request = createMockRequest()
      const response = await getSharedWrapped(request, { params: { token: '' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Share token is required')
    })

    it('should track share visit for completed wrapped', async () => {
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(mockCompletedWrapped)
      ;(prisma.wrappedShareVisit.create as jest.Mock).mockResolvedValue({
        id: 'visit-1',
        wrappedId: 'wrapped-1',
        createdAt: new Date(),
      })

      const request = createMockRequest({
        'x-forwarded-for': '192.168.1.1',
        'user-agent': 'Mozilla/5.0',
        referer: 'https://example.com',
      })

      const response = await getSharedWrapped(request, { params: { token: 'valid-share-token' } })

      expect(response.status).toBe(200)
      // No IP pseudonym, user agent or referer is stored (GAP-37)
      expect(prisma.wrappedShareVisit.create).toHaveBeenCalledWith({
        data: { wrappedId: 'wrapped-1' },
      })
    })

    it('should handle visit tracking failure gracefully', async () => {
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(mockCompletedWrapped)
      ;(prisma.wrappedShareVisit.create as jest.Mock).mockRejectedValue(new Error('Database error'))

      const request = createMockRequest()
      const response = await getSharedWrapped(request, { params: { token: 'valid-share-token' } })
      const data = await response.json()

      // Should still return wrapped data even if tracking fails
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.wrapped).toBeTruthy()
    })

    it('should not expose sensitive user data', async () => {
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(mockCompletedWrapped)
      ;(prisma.wrappedShareVisit.create as jest.Mock).mockResolvedValue({
        id: 'visit-1',
        wrappedId: 'wrapped-1',
        createdAt: new Date(),
      })

      const request = createMockRequest()
      const response = await getSharedWrapped(request, { params: { token: 'valid-share-token' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      // No internal IDs or stored data blob in the response
      expect(data.wrapped).not.toHaveProperty('id')
      expect(data.wrapped).not.toHaveProperty('data')
      expect(data.wrapped).not.toHaveProperty('userId')
      expect(data.wrapped).not.toHaveProperty('shareToken')
      expect(data.wrapped).not.toHaveProperty('userImage')
      // Only the owner's own numbers: no roster, server stats or email
      const body = JSON.stringify(data)
      for (const leaked of ['leaderboard', 'Jon Snow', 'jsnow', 'Private Server', 'totalServerRequests', 'serverStats', 'user@example.com', 'user-1']) {
        expect(body).not.toContain(leaked)
      }
      expect(data.wrapped.totals).toEqual({ minutes: 100, movies: 1, shows: 1, episodes: 2 })
    })

    it('sends noindex on not-found responses too', async () => {
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)

      const response = await getSharedWrapped(createMockRequest(), { params: { token: 'invalid-token' } })

      expect(response.status).toBe(404)
      expect(response.headers.get('X-Robots-Tag')).toBe('noindex')
    })
  })
})

