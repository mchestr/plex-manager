/**
 * Security tests for admin API routes
 * Tests that admin-only endpoints properly enforce authorization
 */

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { GET as getWrappedVersions } from '@/app/api/admin/wrapped/[wrappedId]/versions/route'
import { getHistoricalWrappedVersions } from '@/actions/admin'

// Mock dependencies
jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
  authOptions: {},
}))

jest.mock('next/server', () => ({
  NextRequest: class NextRequest {
    constructor(url, init = {}) {
      this.nextUrl = new URL(url)
      this.method = init.method || 'GET'
      this.headers = {
        get: jest.fn().mockReturnValue(null),
      }
    }
  },
  NextResponse: {
    json: jest.fn((data, init) => ({
      json: () => Promise.resolve(data),
      status: init?.status || 200,
      ...init,
    })),
  },
}))

jest.mock('@/actions/admin', () => ({
  getHistoricalWrappedVersions: jest.fn(),
}))

describe('Admin API Routes Security', () => {
  const mockAdminSession = {
    user: {
      id: 'admin-user-id',
      email: 'admin@example.com',
      name: 'Admin User',
      isAdmin: true,
    },
  }

  const mockRegularUserSession = {
    user: {
      id: 'regular-user-id',
      email: 'user@example.com',
      name: 'Regular User',
      isAdmin: false,
    },
  }

  const mockRequest = (url: string): any => {
    const urlObj = new URL(url)
    return {
      nextUrl: urlObj,
      method: 'GET',
      headers: {
        get: jest.fn().mockReturnValue(null),
      },
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('GET /api/admin/wrapped/[wrappedId]/versions', () => {
    it('should allow admin to get historical wrapped versions', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(mockAdminSession)
      ;(getHistoricalWrappedVersions as jest.Mock).mockResolvedValue([
        {
          id: 'llm-usage-1',
          createdAt: new Date(),
          provider: 'openai',
          model: 'gpt-4',
          cost: 0.01,
          totalTokens: 1000,
          isCurrent: true,
        },
      ])

      const request = mockRequest('http://localhost:3000/api/admin/wrapped/wrapped-id/versions')
      const response = await getWrappedVersions(request, { params: { wrappedId: 'wrapped-id' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.versions).toHaveLength(1)
      expect(getHistoricalWrappedVersions).toHaveBeenCalledWith('wrapped-id')
    })

    it('should reject non-admin user', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(mockRegularUserSession)

      const request = mockRequest('http://localhost:3000/api/admin/wrapped/wrapped-id/versions')
      const response = await getWrappedVersions(request, { params: { wrappedId: 'wrapped-id' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Admin access required')
      expect(getHistoricalWrappedVersions).not.toHaveBeenCalled()
    })

    it('should reject unauthenticated request', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(null)

      const request = mockRequest('http://localhost:3000/api/admin/wrapped/wrapped-id/versions')
      const response = await getWrappedVersions(request, { params: { wrappedId: 'wrapped-id' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Authentication required')
      expect(getHistoricalWrappedVersions).not.toHaveBeenCalled()
    })
  })
})

