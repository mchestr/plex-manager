/**
 * Tests for app/api/admin/wrapped/[wrappedId]/versions/route.ts - admin wrapped versions API route
 */

import { GET } from '@/app/api/admin/wrapped/[wrappedId]/versions/route'
import { getHistoricalWrappedVersions } from '@/actions/admin'
import { requireAdminAPI } from '@/lib/security/api-helpers'
import { limitRequest } from '@/lib/security/rate-limit'

// Mock dependencies
jest.mock('@/actions/admin', () => ({
  getHistoricalWrappedVersions: jest.fn(),
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

describe('GET /api/admin/wrapped/[wrappedId]/versions', () => {
  const mockVersions = [
    {
      id: 'version-1',
      wrappedId: 'wrapped-1',
      version: 1,
      data: '{"summary": "Version 1"}',
      createdAt: new Date('2024-01-01'),
    },
    {
      id: 'version-2',
      wrappedId: 'wrapped-1',
      version: 2,
      data: '{"summary": "Version 2"}',
      createdAt: new Date('2024-01-02'),
    },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    ;(limitRequest as jest.Mock).mockResolvedValue(null)
    ;(requireAdminAPI as jest.Mock).mockResolvedValue({ session: { user: { isAdmin: true } }, response: null })
  })

  it('should return versions for valid wrappedId', async () => {
    ;(getHistoricalWrappedVersions as jest.Mock).mockResolvedValue(mockVersions)

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/wrapped/wrapped-1/versions')

    const response = await GET(request, { params: Promise.resolve({ wrappedId: 'wrapped-1' }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.versions).toEqual(mockVersions)
    expect(getHistoricalWrappedVersions).toHaveBeenCalledWith('wrapped-1')
  })

  it('should return empty array when no versions found', async () => {
    ;(getHistoricalWrappedVersions as jest.Mock).mockResolvedValue([])

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/wrapped/wrapped-1/versions')

    const response = await GET(request, { params: Promise.resolve({ wrappedId: 'wrapped-1' }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.versions).toEqual([])
  })

  it('should return 401 when user is not authenticated', async () => {
    const mockResponse = { status: 401, json: () => Promise.resolve({ error: 'Authentication required' }) }
    ;(requireAdminAPI as jest.Mock).mockResolvedValue({ session: null, response: mockResponse })

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/wrapped/wrapped-1/versions')

    const response = await GET(request, { params: Promise.resolve({ wrappedId: 'wrapped-1' }) })

    expect(response).toBe(mockResponse)
    expect(getHistoricalWrappedVersions).not.toHaveBeenCalled()
  })

  it('should return 403 when user is not admin', async () => {
    const mockResponse = { status: 403, json: () => Promise.resolve({ error: 'Admin access required' }) }
    ;(requireAdminAPI as jest.Mock).mockResolvedValue({ session: null, response: mockResponse })

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/wrapped/wrapped-1/versions')

    const response = await GET(request, { params: Promise.resolve({ wrappedId: 'wrapped-1' }) })

    expect(response).toBe(mockResponse)
    expect(getHistoricalWrappedVersions).not.toHaveBeenCalled()
  })

  it('should return 429 when rate limit is exceeded', async () => {
    const mockRateLimitResponse = { status: 429, json: () => Promise.resolve({ error: 'Too many requests' }) }
    ;(limitRequest as jest.Mock).mockResolvedValue(mockRateLimitResponse)

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/wrapped/wrapped-1/versions')

    const response = await GET(request, { params: Promise.resolve({ wrappedId: 'wrapped-1' }) })

    expect(response).toBe(mockRateLimitResponse)
    expect(limitRequest).toHaveBeenCalledWith('admin', request)
    expect(requireAdminAPI).not.toHaveBeenCalled()
  })

  it('should handle errors from getHistoricalWrappedVersions gracefully', async () => {
    ;(getHistoricalWrappedVersions as jest.Mock).mockRejectedValue(new Error('Database error'))

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/wrapped/wrapped-1/versions')

    const response = await GET(request, { params: Promise.resolve({ wrappedId: 'wrapped-1' }) })
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toContain('Failed to fetch historical versions')
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })
})

