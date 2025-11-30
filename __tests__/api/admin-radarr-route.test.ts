/**
 * Tests for app/api/admin/radarr/route.ts - admin Radarr servers API route
 */

import { GET } from '@/app/api/admin/radarr/route'
import { prisma } from '@/lib/prisma'
import { requireAdminAPI } from '@/lib/security/api-helpers'
import { adminRateLimiter } from '@/lib/security/rate-limit'
import { NextRequest } from 'next/server'

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    service: {
      findMany: jest.fn(),
    },
  },
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

const mockPrisma = prisma as jest.Mocked<typeof prisma>

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
    mockPrisma.service.findMany.mockResolvedValue(mockRadarrServers as any)

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/radarr')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.servers).toEqual(mockRadarrServers)
    expect(mockPrisma.service.findMany).toHaveBeenCalledWith({
      where: { type: 'RADARR' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })
  })

  it('should return empty array when no servers configured', async () => {
    mockPrisma.service.findMany.mockResolvedValue([])

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
    expect(mockPrisma.service.findMany).not.toHaveBeenCalled()
  })

  it('should return 403 when user is not admin', async () => {
    const mockResponse = { status: 403, json: () => Promise.resolve({ error: 'Admin access required' }) }
    ;(requireAdminAPI as jest.Mock).mockResolvedValue({ session: null, response: mockResponse })

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/radarr')

    const response = await GET(request)

    expect(response).toBe(mockResponse)
    expect(mockPrisma.service.findMany).not.toHaveBeenCalled()
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
    mockPrisma.service.findMany.mockRejectedValue(new Error('Database error'))

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

  it('should request servers sorted by name', async () => {
    mockPrisma.service.findMany.mockResolvedValue(mockRadarrServers as any)

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/radarr')

    await GET(request)

    // Verify the query includes orderBy for sorting
    expect(mockPrisma.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { name: 'asc' },
      })
    )
  })
})
