/**
 * Tests for app/api/admin/wrapped/by-user/[userId]/route.ts - admin wrapped by user API route
 */

import { GET } from '@/app/api/admin/wrapped/by-user/[userId]/route'
import { getUserPlexWrapped } from '@/actions/users'
import { requireAdminAPI, validateYear } from '@/lib/security/api-helpers'
import { limitRequest } from '@/lib/security/rate-limit'
import { NextRequest } from 'next/server'

// Mock dependencies
jest.mock('@/actions/users', () => ({
  getUserPlexWrapped: jest.fn(),
}))

jest.mock('@/lib/security/api-helpers', () => ({
  requireAdminAPI: jest.fn(),
  validateYear: jest.fn(),
}))

jest.mock('@/lib/security/rate-limit', () => ({
  limitRequest: jest.fn(),
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

describe('GET /api/admin/wrapped/by-user/[userId]', () => {
  const mockWrapped = {
    id: 'wrapped-1',
    userId: 'user-1',
    year: 2024,
    status: 'completed',
    data: '{"summary": "Test"}',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(limitRequest as jest.Mock).mockResolvedValue(null)
    ;(requireAdminAPI as jest.Mock).mockResolvedValue({ session: { user: { isAdmin: true } }, response: null })
    ;(validateYear as jest.Mock).mockReturnValue(2024)
  })

  it('should return wrappedId for valid userId and year', async () => {
    ;(getUserPlexWrapped as jest.Mock).mockResolvedValue(mockWrapped)

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/wrapped/by-user/user-1?year=2024')

    const response = await GET(request, { params: { userId: 'user-1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.wrappedId).toBe('wrapped-1')
    expect(getUserPlexWrapped).toHaveBeenCalledWith('user-1', 2024)
    expect(validateYear).toHaveBeenCalledWith('2024')
  })

  it('should return null wrappedId when no wrapped found', async () => {
    ;(getUserPlexWrapped as jest.Mock).mockResolvedValue(null)

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/wrapped/by-user/user-1?year=2024')

    const response = await GET(request, { params: { userId: 'user-1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.wrappedId).toBeNull()
  })

  it('should use current year when year parameter is not provided', async () => {
    ;(getUserPlexWrapped as jest.Mock).mockResolvedValue(mockWrapped)
    ;(validateYear as jest.Mock).mockReturnValue(2024)

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/wrapped/by-user/user-1')

    const response = await GET(request, { params: { userId: 'user-1' } })

    expect(response.status).toBe(200)
    expect(validateYear).toHaveBeenCalledWith(null)
    expect(getUserPlexWrapped).toHaveBeenCalledWith('user-1', 2024)
  })

  it('should return 401 when user is not authenticated', async () => {
    const mockResponse = { status: 401, json: () => Promise.resolve({ error: 'Authentication required' }) }
    ;(requireAdminAPI as jest.Mock).mockResolvedValue({ session: null, response: mockResponse })

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/wrapped/by-user/user-1?year=2024')

    const response = await GET(request, { params: { userId: 'user-1' } })

    expect(response).toBe(mockResponse)
    expect(getUserPlexWrapped).not.toHaveBeenCalled()
  })

  it('should return 403 when user is not admin', async () => {
    const mockResponse = { status: 403, json: () => Promise.resolve({ error: 'Admin access required' }) }
    ;(requireAdminAPI as jest.Mock).mockResolvedValue({ session: null, response: mockResponse })

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/wrapped/by-user/user-1?year=2024')

    const response = await GET(request, { params: { userId: 'user-1' } })

    expect(response).toBe(mockResponse)
    expect(getUserPlexWrapped).not.toHaveBeenCalled()
  })

  it('should return 429 when rate limit is exceeded', async () => {
    const mockRateLimitResponse = { status: 429, json: () => Promise.resolve({ error: 'Too many requests' }) }
    ;(limitRequest as jest.Mock).mockResolvedValue(mockRateLimitResponse)

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/wrapped/by-user/user-1?year=2024')

    const response = await GET(request, { params: { userId: 'user-1' } })

    expect(response).toBe(mockRateLimitResponse)
    expect(limitRequest).toHaveBeenCalledWith('admin', request)
    expect(requireAdminAPI).not.toHaveBeenCalled()
  })

  it('should handle errors from getUserPlexWrapped gracefully', async () => {
    ;(getUserPlexWrapped as jest.Mock).mockRejectedValue(new Error('Database error'))

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/wrapped/by-user/user-1?year=2024')

    const response = await GET(request, { params: { userId: 'user-1' } })
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toContain('Failed to fetch wrapped ID')
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })
})

