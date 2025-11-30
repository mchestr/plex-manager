/**
 * Tests for app/api/admin/plex/users/route.ts - admin Plex users API route
 */

import { GET } from '@/app/api/admin/plex/users/route'
import { getActivePlexService } from '@/lib/services/service-helpers'
import { getAllPlexServerUsers } from '@/lib/connections/plex'
import { requireAdminAPI } from '@/lib/security/api-helpers'
import { adminRateLimiter } from '@/lib/security/rate-limit'
import { NextRequest } from 'next/server'

// Mock dependencies
jest.mock('@/lib/services/service-helpers', () => ({
  getActivePlexService: jest.fn(),
}))

jest.mock('@/lib/connections/plex', () => ({
  getAllPlexServerUsers: jest.fn(),
}))

jest.mock('@/lib/security/api-helpers', () => ({
  requireAdminAPI: jest.fn(),
}))

jest.mock('@/lib/security/rate-limit', () => ({
  adminRateLimiter: jest.fn(),
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

describe('GET /api/admin/plex/users', () => {
  const mockPlexService = {
    id: 'plex-1',
    name: 'Test Plex Server',
    url: 'http://localhost:32400',
    isActive: true,
    config: {
      token: 'test-token',
    },
  }

  const mockPlexUsers = [
    {
      id: 'plex-1',
      username: 'user1',
      email: 'user1@example.com',
      thumb: 'https://example.com/thumb1.jpg',
    },
    {
      id: 'plex-2',
      username: 'user2',
      email: 'user2@example.com',
      thumb: 'https://example.com/thumb2.jpg',
    },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    ;(adminRateLimiter as jest.Mock).mockResolvedValue(null)
    ;(requireAdminAPI as jest.Mock).mockResolvedValue({ session: { user: { isAdmin: true } }, response: null })
  })

  it('should return Plex users for admin user', async () => {
    ;(getActivePlexService as jest.Mock).mockResolvedValue(mockPlexService)
    ;(getAllPlexServerUsers as jest.Mock).mockResolvedValue({
      success: true,
      data: mockPlexUsers,
    })

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/plex/users')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.users).toEqual(mockPlexUsers)
    expect(getAllPlexServerUsers).toHaveBeenCalledWith({
      url: 'http://localhost:32400',
      token: 'test-token',
    })
  })

  it('should return empty array when no users found', async () => {
    ;(getActivePlexService as jest.Mock).mockResolvedValue(mockPlexService)
    ;(getAllPlexServerUsers as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    })

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/plex/users')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.users).toEqual([])
  })

  it('should return 404 when no active Plex server is configured', async () => {
    ;(getActivePlexService as jest.Mock).mockResolvedValue(null)

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/plex/users')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('No active Plex server configured')
    expect(data.code).toBe('NOT_FOUND')
    expect(getAllPlexServerUsers).not.toHaveBeenCalled()
  })

  it('should return 500 when Plex API call fails', async () => {
    ;(getActivePlexService as jest.Mock).mockResolvedValue(mockPlexService)
    ;(getAllPlexServerUsers as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Failed to connect to Plex server',
    })

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/plex/users')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toContain('Failed to connect to Plex server')
    expect(data.code).toBe('INTERNAL_ERROR')
  })

  it('should return 401 when user is not authenticated', async () => {
    const mockResponse = { status: 401, json: () => Promise.resolve({ error: 'Authentication required' }) }
    ;(requireAdminAPI as jest.Mock).mockResolvedValue({ session: null, response: mockResponse })

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/plex/users')

    const response = await GET(request)

    expect(response).toBe(mockResponse)
    expect(getActivePlexService).not.toHaveBeenCalled()
  })

  it('should return 403 when user is not admin', async () => {
    const mockResponse = { status: 403, json: () => Promise.resolve({ error: 'Admin access required' }) }
    ;(requireAdminAPI as jest.Mock).mockResolvedValue({ session: null, response: mockResponse })

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/plex/users')

    const response = await GET(request)

    expect(response).toBe(mockResponse)
    expect(getActivePlexService).not.toHaveBeenCalled()
  })

  it('should return 429 when rate limit is exceeded', async () => {
    const mockRateLimitResponse = { status: 429, json: () => Promise.resolve({ error: 'Too many requests' }) }
    ;(adminRateLimiter as jest.Mock).mockResolvedValue(mockRateLimitResponse)

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/plex/users')

    const response = await GET(request)

    expect(response).toBe(mockRateLimitResponse)
    expect(requireAdminAPI).not.toHaveBeenCalled()
  })

  it('should handle database errors gracefully', async () => {
    ;(getActivePlexService as jest.Mock).mockRejectedValue(new Error('Database error'))

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/plex/users')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toContain('Failed to fetch Plex users')
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('should handle null data from Plex API', async () => {
    ;(getActivePlexService as jest.Mock).mockResolvedValue(mockPlexService)
    ;(getAllPlexServerUsers as jest.Mock).mockResolvedValue({
      success: true,
      data: null,
    })

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/plex/users')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.users).toEqual([])
  })
})

