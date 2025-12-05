/**
 * Tests for app/api/admin/maintenance/schedulers/route.ts - admin schedulers API route
 */

import { GET } from '@/app/api/admin/maintenance/schedulers/route'
import { prisma } from '@/lib/prisma'
import { getActiveSchedulers } from '@/lib/maintenance/scheduler'
import { requireAdminAPI } from '@/lib/security/api-helpers'
import { adminRateLimiter } from '@/lib/security/rate-limit'
import { NextRequest } from 'next/server'

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    maintenanceRule: {
      findMany: jest.fn(),
    },
  },
}))

jest.mock('@/lib/maintenance/scheduler', () => ({
  getActiveSchedulers: jest.fn(),
}))

jest.mock('@/lib/security/api-helpers', () => ({
  requireAdminAPI: jest.fn(),
}))

jest.mock('@/lib/security/rate-limit', () => ({
  adminRateLimiter: jest.fn(),
}))

jest.mock('@/lib/security/error-handler', () => ({
  createSafeError: jest.fn((code, message) => ({ code, error: message })),
  ErrorCode: {
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
  },
  getStatusCode: jest.fn((code) => (code === 'INTERNAL_ERROR' ? 500 : 401)),
  logError: jest.fn(),
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

describe('GET /api/admin/maintenance/schedulers', () => {
  const mockSchedulers = [
    {
      id: 'maintenance-rule-abc123',
      ruleId: 'abc123',
      pattern: '0 2 * * *',
      next: new Date('2024-01-01T02:00:00Z'),
    },
    {
      id: 'maintenance-rule-def456',
      ruleId: 'def456',
      pattern: '0 */6 * * *',
      next: new Date('2024-01-01T06:00:00Z'),
    },
  ]

  const mockRules = [
    { id: 'abc123', name: 'Cleanup old movies', enabled: true },
    { id: 'def456', name: 'Remove unwatched shows', enabled: true },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    ;(adminRateLimiter as jest.Mock).mockResolvedValue(null)
    ;(requireAdminAPI as jest.Mock).mockResolvedValue({ session: { user: { isAdmin: true } }, response: null })
  })

  it('should return active schedulers with rule info for admin user', async () => {
    ;(getActiveSchedulers as jest.Mock).mockResolvedValue(mockSchedulers)
    ;(prisma.maintenanceRule.findMany as jest.Mock).mockResolvedValue(mockRules)

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/maintenance/schedulers')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.count).toBe(2)
    expect(data.schedulers).toHaveLength(2)
    expect(data.schedulers[0]).toEqual({
      id: 'maintenance-rule-abc123',
      ruleId: 'abc123',
      pattern: '0 2 * * *',
      next: '2024-01-01T02:00:00.000Z',
      ruleName: 'Cleanup old movies',
      ruleEnabled: true,
    })
  })

  it('should return empty array when no schedulers are active', async () => {
    ;(getActiveSchedulers as jest.Mock).mockResolvedValue([])
    ;(prisma.maintenanceRule.findMany as jest.Mock).mockResolvedValue([])

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/maintenance/schedulers')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.count).toBe(0)
    expect(data.schedulers).toEqual([])
  })

  it('should handle schedulers for deleted rules gracefully', async () => {
    ;(getActiveSchedulers as jest.Mock).mockResolvedValue([mockSchedulers[0]])
    ;(prisma.maintenanceRule.findMany as jest.Mock).mockResolvedValue([])

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/maintenance/schedulers')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.schedulers[0].ruleName).toBeNull()
    expect(data.schedulers[0].ruleEnabled).toBeNull()
  })

  it('should return 401 when user is not authenticated', async () => {
    const mockResponse = { status: 401, json: () => Promise.resolve({ error: 'Authentication required' }) }
    ;(requireAdminAPI as jest.Mock).mockResolvedValue({ session: null, response: mockResponse })

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/maintenance/schedulers')

    const response = await GET(request)

    expect(response).toBe(mockResponse)
    expect(getActiveSchedulers).not.toHaveBeenCalled()
  })

  it('should return 403 when user is not admin', async () => {
    const mockResponse = { status: 403, json: () => Promise.resolve({ error: 'Admin access required' }) }
    ;(requireAdminAPI as jest.Mock).mockResolvedValue({ session: null, response: mockResponse })

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/maintenance/schedulers')

    const response = await GET(request)

    expect(response).toBe(mockResponse)
    expect(getActiveSchedulers).not.toHaveBeenCalled()
  })

  it('should return 429 when rate limit is exceeded', async () => {
    const mockRateLimitResponse = { status: 429, json: () => Promise.resolve({ error: 'Too many requests' }) }
    ;(adminRateLimiter as jest.Mock).mockResolvedValue(mockRateLimitResponse)

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/maintenance/schedulers')

    const response = await GET(request)

    expect(response).toBe(mockRateLimitResponse)
    expect(requireAdminAPI).not.toHaveBeenCalled()
  })

  it('should handle scheduler fetch errors gracefully', async () => {
    ;(getActiveSchedulers as jest.Mock).mockRejectedValue(new Error('Redis connection failed'))

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/maintenance/schedulers')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toContain('Failed to fetch schedulers')
    expect(data.code).toBe('INTERNAL_ERROR')

    consoleErrorSpy.mockRestore()
  })

  it('should handle null next time in schedulers', async () => {
    const schedulerWithNullNext = {
      ...mockSchedulers[0],
      next: null,
    }
    ;(getActiveSchedulers as jest.Mock).mockResolvedValue([schedulerWithNullNext])
    ;(prisma.maintenanceRule.findMany as jest.Mock).mockResolvedValue([mockRules[0]])

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/maintenance/schedulers')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.schedulers[0].next).toBeNull()
  })
})
