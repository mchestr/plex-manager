/**
 * Tests for app/api/admin/playground/statistics/route.ts - admin playground statistics API route
 */

import { GET } from '@/app/api/admin/playground/statistics/route'
import { prisma } from '@/lib/prisma'
import {
  getActivePlexService,
  getActiveTautulliService,
  getActiveOverseerrService,
} from '@/lib/services/service-helpers'
import { requireAdminAPI } from '@/lib/security/api-helpers'
import { adminRateLimiter } from '@/lib/security/rate-limit'
import {
  fetchTautulliStatistics,
  fetchPlexServerStatistics,
  fetchOverseerrStatistics,
  fetchTopContentLeaderboards,
  fetchWatchTimeLeaderboard,
} from '@/lib/wrapped/statistics'
import { NextRequest } from 'next/server'

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
    },
  },
}))

jest.mock('@/lib/services/service-helpers', () => ({
  getActivePlexService: jest.fn(),
  getActiveTautulliService: jest.fn(),
  getActiveOverseerrService: jest.fn(),
}))

jest.mock('@/lib/security/api-helpers', () => ({
  requireAdminAPI: jest.fn(),
}))

jest.mock('@/lib/security/rate-limit', () => ({
  adminRateLimiter: jest.fn(),
}))

jest.mock('@/lib/wrapped/statistics', () => ({
  fetchTautulliStatistics: jest.fn(),
  fetchPlexServerStatistics: jest.fn(),
  fetchOverseerrStatistics: jest.fn(),
  fetchTopContentLeaderboards: jest.fn(),
  fetchWatchTimeLeaderboard: jest.fn(),
}))

// Mock NextRequest
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
        ...init,
      })),
    },
  }
})

const mockGetActivePlexService = getActivePlexService as jest.MockedFunction<typeof getActivePlexService>
const mockGetActiveTautulliService = getActiveTautulliService as jest.MockedFunction<typeof getActiveTautulliService>
const mockGetActiveOverseerrService = getActiveOverseerrService as jest.MockedFunction<typeof getActiveOverseerrService>

describe('GET /api/admin/playground/statistics', () => {
  const mockUser = {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    plexUserId: 'plex-123',
  }

  const mockTautulliService = {
    id: 'tautulli-1',
    name: 'Tautulli',
    url: 'http://localhost:8181',
    isActive: true,
    config: {
      apiKey: 'test-key',
    },
  }

  const mockTautulliStats = {
    success: true,
    data: {
      totalWatchTime: 1000,
      moviesWatchTime: 600,
      showsWatchTime: 400,
      moviesWatched: 10,
      showsWatched: 5,
      episodesWatched: 50,
      topMovies: [{ title: 'Movie 1', plays: 3 }],
      topShows: [{ title: 'Show 1', plays: 10 }],
      watchTimeByMonth: [],
      tautulliUserId: 'tautulli-1',
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(adminRateLimiter as jest.Mock).mockResolvedValue(null)
    ;(requireAdminAPI as jest.Mock).mockResolvedValue({ session: { user: { isAdmin: true } }, response: null })
  })

  it('should return statistics for valid user and year', async () => {
    ;(prisma.user.findFirst as jest.Mock).mockResolvedValue(mockUser)
    mockGetActiveTautulliService.mockResolvedValue(mockTautulliService as any)
    ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue(mockTautulliStats)
    mockGetActivePlexService.mockResolvedValue(null)
    mockGetActiveOverseerrService.mockResolvedValue(null)
    ;(fetchTopContentLeaderboards as jest.Mock).mockResolvedValue({ success: false })
    ;(fetchWatchTimeLeaderboard as jest.Mock).mockResolvedValue({ success: false })

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/playground/statistics?userName=Test User&year=2024')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.statistics).toBeDefined()
    expect(data.statistics.totalWatchTime).toEqual({
      total: 1000,
      movies: 600,
      shows: 400,
    })
    expect(data.statistics.moviesWatched).toBe(10)
    expect(data.statistics.showsWatched).toBe(5)
  })

  it('should return 400 when userName is missing', async () => {
    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/playground/statistics?year=2024')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('userName parameter is required')
    expect(data.code).toBe('VALIDATION_ERROR')
  })

  it('should return 400 when year is invalid', async () => {
    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/playground/statistics?userName=Test User&year=invalid')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid year parameter')
    expect(data.code).toBe('VALIDATION_ERROR')
  })

  it('should return 400 when year is out of range', async () => {
    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/playground/statistics?userName=Test User&year=1999')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid year parameter')
  })

  it('should return 404 when user is not found', async () => {
    ;(prisma.user.findFirst as jest.Mock).mockResolvedValue(null)

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/playground/statistics?userName=Unknown User&year=2024')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toContain('User not found')
    expect(data.code).toBe('NOT_FOUND')
  })

  it('should return 400 when user has no plexUserId', async () => {
    ;(prisma.user.findFirst as jest.Mock).mockResolvedValue({ ...mockUser, plexUserId: null })

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/playground/statistics?userName=Test User&year=2024')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('User does not have a Plex user ID')
  })

  it('should return 404 when no active Tautulli server is configured', async () => {
    ;(prisma.user.findFirst as jest.Mock).mockResolvedValue(mockUser)
    mockGetActiveTautulliService.mockResolvedValue(null)

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/playground/statistics?userName=Test User&year=2024')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('No active Tautulli server configured')
  })

  it('should return 500 when Tautulli statistics fetch fails', async () => {
    ;(prisma.user.findFirst as jest.Mock).mockResolvedValue(mockUser)
    mockGetActiveTautulliService.mockResolvedValue(mockTautulliService as any)
    ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Failed to connect to Tautulli',
    })

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/playground/statistics?userName=Test User&year=2024')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toContain('Failed to connect to Tautulli')
  })

  it('should find user by email when name does not match', async () => {
    ;(prisma.user.findFirst as jest.Mock).mockResolvedValue(mockUser)
    mockGetActiveTautulliService.mockResolvedValue(mockTautulliService as any)
    ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue(mockTautulliStats)
    mockGetActivePlexService.mockResolvedValue(null)
    mockGetActiveOverseerrService.mockResolvedValue(null)
    ;(fetchTopContentLeaderboards as jest.Mock).mockResolvedValue({ success: false })
    ;(fetchWatchTimeLeaderboard as jest.Mock).mockResolvedValue({ success: false })

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/playground/statistics?userName=test@example.com&year=2024')

    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { name: 'test@example.com' },
          { email: 'test@example.com' },
        ],
      },
    })
  })

  it('should include server stats when Plex server is configured', async () => {
    const mockPlexService = {
      id: 'plex-1',
      name: 'My Plex Server',
      url: 'http://localhost:32400',
      isActive: true,
      config: {
        token: 'test-token',
      },
    }

    const mockServerStats = {
      success: true,
      data: {
        totalStorage: 1000000000,
        totalStorageFormatted: '1 TB',
        librarySize: 500,
      },
    }

    ;(prisma.user.findFirst as jest.Mock).mockResolvedValue(mockUser)
    mockGetActiveTautulliService.mockResolvedValue(mockTautulliService as any)
    ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue(mockTautulliStats)
    mockGetActivePlexService.mockResolvedValue(mockPlexService as any)
    ;(fetchPlexServerStatistics as jest.Mock).mockResolvedValue(mockServerStats)
    mockGetActiveOverseerrService.mockResolvedValue(null)
    ;(fetchTopContentLeaderboards as jest.Mock).mockResolvedValue({ success: false })
    ;(fetchWatchTimeLeaderboard as jest.Mock).mockResolvedValue({ success: false })

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/playground/statistics?userName=Test User&year=2024')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.statistics.serverStats).toBeDefined()
    expect(data.statistics.serverStats.serverName).toBe('My Plex Server')
  })

  it('should include leaderboards when tautulliUserId is available', async () => {
    const mockLeaderboards = {
      success: true,
      data: [
        { title: 'Movie 1', userRank: 1 },
      ],
    }

    const mockWatchTimeLeaderboard = {
      success: true,
      data: [
        { userId: 'tautulli-1', watchTime: 1000 },
        { userId: 'tautulli-2', watchTime: 800 },
      ],
    }

    ;(prisma.user.findFirst as jest.Mock).mockResolvedValue(mockUser)
    mockGetActiveTautulliService.mockResolvedValue(mockTautulliService as any)
    ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue(mockTautulliStats)
    mockGetActivePlexService.mockResolvedValue(null)
    mockGetActiveOverseerrService.mockResolvedValue(null)
    ;(fetchTopContentLeaderboards as jest.Mock).mockResolvedValue(mockLeaderboards)
    ;(fetchWatchTimeLeaderboard as jest.Mock).mockResolvedValue(mockWatchTimeLeaderboard)

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/playground/statistics?userName=Test User&year=2024')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.statistics.leaderboards).toBeDefined()
    expect(data.statistics.leaderboards.watchTime.userPosition).toBe(1)
  })

  it('should return 401 when user is not authenticated', async () => {
    const mockResponse = { status: 401, json: () => Promise.resolve({ error: 'Authentication required' }) }
    ;(requireAdminAPI as jest.Mock).mockResolvedValue({ session: null, response: mockResponse })

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/playground/statistics?userName=Test User&year=2024')

    const response = await GET(request)

    expect(response).toBe(mockResponse)
  })

  it('should return 429 when rate limit is exceeded', async () => {
    const mockRateLimitResponse = { status: 429, json: () => Promise.resolve({ error: 'Too many requests' }) }
    ;(adminRateLimiter as jest.Mock).mockResolvedValue(mockRateLimitResponse)

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/playground/statistics?userName=Test User&year=2024')

    const response = await GET(request)

    expect(response).toBe(mockRateLimitResponse)
  })

  it('should handle database errors gracefully', async () => {
    ;(prisma.user.findFirst as jest.Mock).mockRejectedValue(new Error('Database error'))

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/playground/statistics?userName=Test User&year=2024')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toContain('Failed to fetch statistics')
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })
})

