/**
 * Tests for app/api/admin/wrapped/[wrappedId]/user/route.ts - admin wrapped user API route
 */

import { GET } from '@/app/api/admin/wrapped/[wrappedId]/user/route'
import { prisma } from '@/lib/prisma'
import { requireAdminAPI } from '@/lib/security/api-helpers'
import { limitRequest } from '@/lib/security/rate-limit'
import { NextRequest } from 'next/server'

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    plexWrapped: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('@/lib/security/api-helpers', () => ({
  requireAdminAPI: jest.fn(),
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

describe('GET /api/admin/wrapped/[wrappedId]/user', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(limitRequest as jest.Mock).mockResolvedValue(null)
    ;(requireAdminAPI as jest.Mock).mockResolvedValue({ session: { user: { isAdmin: true } }, response: null })
  })

  it('should return userId for valid wrappedId', async () => {
    const mockWrapped = {
      userId: 'user-123',
    }

    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(mockWrapped)

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/wrapped/wrapped-1/user')

    const response = await GET(request, { params: { wrappedId: 'wrapped-1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.userId).toBe('user-123')
    expect(prisma.plexWrapped.findUnique).toHaveBeenCalledWith({
      where: { id: 'wrapped-1' },
      select: { userId: true },
    })
  })

  it('should return 404 when wrapped is not found', async () => {
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/wrapped/invalid-id/user')

    const response = await GET(request, { params: { wrappedId: 'invalid-id' } })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('Wrapped not found')
    expect(data.code).toBe('NOT_FOUND')
  })

  it('should return 401 when user is not authenticated', async () => {
    const mockResponse = { status: 401, json: () => Promise.resolve({ error: 'Authentication required' }) }
    ;(requireAdminAPI as jest.Mock).mockResolvedValue({ session: null, response: mockResponse })

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/wrapped/wrapped-1/user')

    const response = await GET(request, { params: { wrappedId: 'wrapped-1' } })

    expect(response).toBe(mockResponse)
    expect(prisma.plexWrapped.findUnique).not.toHaveBeenCalled()
  })

  it('should return 403 when user is not admin', async () => {
    const mockResponse = { status: 403, json: () => Promise.resolve({ error: 'Admin access required' }) }
    ;(requireAdminAPI as jest.Mock).mockResolvedValue({ session: null, response: mockResponse })

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/wrapped/wrapped-1/user')

    const response = await GET(request, { params: { wrappedId: 'wrapped-1' } })

    expect(response).toBe(mockResponse)
    expect(prisma.plexWrapped.findUnique).not.toHaveBeenCalled()
  })

  it('should return 429 when rate limit is exceeded', async () => {
    const mockRateLimitResponse = { status: 429, json: () => Promise.resolve({ error: 'Too many requests' }) }
    ;(limitRequest as jest.Mock).mockResolvedValue(mockRateLimitResponse)

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/wrapped/wrapped-1/user')

    const response = await GET(request, { params: { wrappedId: 'wrapped-1' } })

    expect(response).toBe(mockRateLimitResponse)
    expect(limitRequest).toHaveBeenCalledWith('admin', request)
    expect(requireAdminAPI).not.toHaveBeenCalled()
  })

  it('should handle database errors gracefully', async () => {
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'))

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/wrapped/wrapped-1/user')

    const response = await GET(request, { params: { wrappedId: 'wrapped-1' } })
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toContain('Failed to fetch wrapped user')
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })
})

