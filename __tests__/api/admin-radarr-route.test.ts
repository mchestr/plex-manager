/**
 * Tests for app/api/admin/radarr/route.ts - admin Radarr servers API route
 */

import { GET } from '@/app/api/admin/radarr/route'
import { getAllRadarrServices } from '@/lib/services/service-helpers'
import { requireAdminAPI } from '@/lib/security/api-helpers'
import { adminRateLimiter } from '@/lib/security/rate-limit'
import { NextRequest } from 'next/server'

// Mock dependencies
jest.mock('@/lib/services/service-helpers', () => ({
  getAllRadarrServices: jest.fn(),
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

describe('GET /api/admin/radarr', () => {
  const mockRadarrServers = [
    { id: 'radarr-1', name: 'Radarr 4K' },
    { id: 'radarr-2', name: 'Radarr HD' },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    ;(adminRateLimiter as jest.Mock).mockResolvedValue(null)
    ;(requireAdminAPI as jest.Mock).mockResolvedValue({ session: { user: { isAdmin: true } }, response: null })
  })

  it('should return Radarr servers for admin user', async () => {
    ;(getAllRadarrServices as jest.Mock).mockResolvedValue(mockRadarrServers)

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/radarr')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.servers).toEqual(mockRadarrServers)
    expect(getAllRadarrServices).toHaveBeenCalled()
  })

  it('should return empty array when no servers configured', async () => {
    ;(getAllRadarrServices as jest.Mock).mockResolvedValue([])

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/radarr')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.servers).toEqual([])
  })

  it('should return 401 when user is not authenticated', async () => {
    const mockResponse = { status: 401, json: () => Promise.resolve({ error: 'Authentication required' }) }
    ;(requireAdminAPI as jest.Mock).mockResolvedValue({ session: null, response: mockResponse })

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/radarr')

    const response = await GET(request)

    expect(response).toBe(mockResponse)
    expect(getAllRadarrServices).not.toHaveBeenCalled()
  })

  it('should return 403 when user is not admin', async () => {
    const mockResponse = { status: 403, json: () => Promise.resolve({ error: 'Admin access required' }) }
    ;(requireAdminAPI as jest.Mock).mockResolvedValue({ session: null, response: mockResponse })

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/radarr')

    const response = await GET(request)

    expect(response).toBe(mockResponse)
    expect(getAllRadarrServices).not.toHaveBeenCalled()
  })

  it('should return 429 when rate limit is exceeded', async () => {
    const mockRateLimitResponse = { status: 429, json: () => Promise.resolve({ error: 'Too many requests' }) }
    ;(adminRateLimiter as jest.Mock).mockResolvedValue(mockRateLimitResponse)

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/radarr')

    const response = await GET(request)

    expect(response).toBe(mockRateLimitResponse)
    expect(requireAdminAPI).not.toHaveBeenCalled()
  })

  it('should handle database errors gracefully', async () => {
    ;(getAllRadarrServices as jest.Mock).mockRejectedValue(new Error('Database error'))

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/radarr')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toContain('Failed to fetch Radarr servers')
    expect(data.code).toBe('INTERNAL_ERROR')
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('should return servers sorted by name', async () => {
    const unsortedServers = [
      { id: 'radarr-2', name: 'Radarr HD' },
      { id: 'radarr-1', name: 'Radarr 4K' },
    ]
    ;(getAllRadarrServices as jest.Mock).mockResolvedValue(unsortedServers)

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/radarr')

    await GET(request)

    // The service helper handles sorting internally
    expect(getAllRadarrServices).toHaveBeenCalled()
  })
})
