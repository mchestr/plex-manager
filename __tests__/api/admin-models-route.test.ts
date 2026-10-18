/**
 * Tests for app/api/admin/models/route.ts - admin models API route
 */

import { GET } from '@/app/api/admin/models/route'
import { prisma } from '@/lib/prisma'
import { requireAdminAPI } from '@/lib/security/api-helpers'
import { limitRequest } from '@/lib/security/rate-limit'
import { NextRequest } from 'next/server'

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    lLMProvider: {
      findFirst: jest.fn(),
    },
  },
}))

jest.mock('@/lib/security/api-helpers', () => ({
  requireAdminAPI: jest.fn(),
}))

jest.mock('@/lib/security/rate-limit', () => ({
  limitRequest: jest.fn(),
}))

jest.mock('@/lib/llm/pricing', () => ({
  MODEL_PRICING: {
    'gpt-4': { input: 0.03, output: 0.06 },
    'gpt-3.5-turbo': { input: 0.001, output: 0.002 },
    'claude-3-opus': { input: 0.015, output: 0.075 },
  },
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

describe('GET /api/admin/models', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(limitRequest as jest.Mock).mockResolvedValue(null)
    ;(requireAdminAPI as jest.Mock).mockResolvedValue({ session: { user: { isAdmin: true } }, response: null })
  })

  it('should return models and configured model for admin user', async () => {
    const mockLlmProvider = {
      model: 'gpt-4',
    }

    ;(prisma.lLMProvider.findFirst as jest.Mock).mockResolvedValue(mockLlmProvider)

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/models')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.models).toEqual(['claude-3-opus', 'gpt-3.5-turbo', 'gpt-4'])
    expect(data.configuredModel).toBe('gpt-4')
    expect(prisma.lLMProvider.findFirst).toHaveBeenCalledWith({
      where: { isActive: true },
      select: { model: true },
    })
  })

  it('should return null configured model when no active provider', async () => {
    ;(prisma.lLMProvider.findFirst as jest.Mock).mockResolvedValue(null)

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/models')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.models).toEqual(['claude-3-opus', 'gpt-3.5-turbo', 'gpt-4'])
    expect(data.configuredModel).toBeNull()
  })

  it('should return 401 when user is not authenticated', async () => {
    const mockResponse = { status: 401, json: () => Promise.resolve({ error: 'Authentication required' }) }
    ;(requireAdminAPI as jest.Mock).mockResolvedValue({ session: null, response: mockResponse })

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/models')

    const response = await GET(request)

    expect(response).toBe(mockResponse)
    expect(prisma.lLMProvider.findFirst).not.toHaveBeenCalled()
  })

  it('should return 403 when user is not admin', async () => {
    const mockResponse = { status: 403, json: () => Promise.resolve({ error: 'Admin access required' }) }
    ;(requireAdminAPI as jest.Mock).mockResolvedValue({ session: null, response: mockResponse })

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/models')

    const response = await GET(request)

    expect(response).toBe(mockResponse)
    expect(prisma.lLMProvider.findFirst).not.toHaveBeenCalled()
  })

  it('should return 429 when rate limit is exceeded', async () => {
    const mockRateLimitResponse = { status: 429, json: () => Promise.resolve({ error: 'Too many requests' }) }
    ;(limitRequest as jest.Mock).mockResolvedValue(mockRateLimitResponse)

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/models')

    const response = await GET(request)

    expect(response).toBe(mockRateLimitResponse)
    expect(limitRequest).toHaveBeenCalledWith('admin', request)
    expect(requireAdminAPI).not.toHaveBeenCalled()
    expect(prisma.lLMProvider.findFirst).not.toHaveBeenCalled()
  })

  it('should handle database errors gracefully', async () => {
    ;(prisma.lLMProvider.findFirst as jest.Mock).mockRejectedValue(new Error('Database error'))

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/admin/models')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toContain('Failed to fetch models')
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })
})

