/**
 * Security tests for admin server actions
 * Tests that admin-only actions properly enforce authorization
 */

import { requireAdmin } from '@/lib/admin'
import {
  setLLMDisabled,
  getConfig,
  getLLMUsageRecords,
  getLLMUsageById,
  getLLMUsageStats,
  getUserById,
  getHistoricalWrappedVersions,
  getHistoricalWrappedData,
} from '@/actions/admin'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

// Mock dependencies
jest.mock('@/lib/admin', () => ({
  requireAdmin: jest.fn(),
  getAdminStatus: jest.fn(),
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    config: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    lLMUsage: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    plexWrapped: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}))

const mockGetLLMUsageStats = jest.fn()
jest.mock('@/lib/wrapped/usage', () => ({
  getLLMUsageStats: (...args: any[]) => mockGetLLMUsageStats(...args),
}))

const mockAdminSession = {
  user: {
    id: 'admin-user-id',
    email: 'admin@example.com',
    name: 'Admin User',
    isAdmin: true,
  },
}

describe('Admin Actions Security', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetLLMUsageStats.mockClear()
  })

  describe('getConfig', () => {
    it('should require admin to get config', async () => {
      ;(requireAdmin as jest.Mock).mockResolvedValue(mockAdminSession)
      ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({
        id: 'config',
        llmDisabled: false,
        updatedAt: new Date(),
        updatedBy: null,
      })

      const result = await getConfig()

      expect(requireAdmin).toHaveBeenCalled()
      expect(result).toBeTruthy()
      expect(result.id).toBe('config')
    })

    it('should create config with defaults if not exists (admin only)', async () => {
      ;(requireAdmin as jest.Mock).mockResolvedValue(mockAdminSession)
      ;(prisma.config.findUnique as jest.Mock).mockResolvedValue(null)
      ;(prisma.config.create as jest.Mock).mockResolvedValue({
        id: 'config',
        llmDisabled: false,
        updatedAt: new Date(),
        updatedBy: null,
      })

      const result = await getConfig()

      expect(requireAdmin).toHaveBeenCalled()
      expect(prisma.config.create).toHaveBeenCalledWith({
        data: {
          id: 'config',
          llmDisabled: false,
          wrappedEnabled: true,
        },
      })
      expect(result.id).toBe('config')
    })

    it('should reject non-admin user', async () => {
      ;(requireAdmin as jest.Mock).mockImplementation(() => {
        redirect('/')
        throw new Error('Not admin')
      })

      await expect(getConfig()).rejects.toThrow()
      expect(prisma.config.findUnique).not.toHaveBeenCalled()
      expect(prisma.config.create).not.toHaveBeenCalled()
    })

    it('should reject unauthenticated user', async () => {
      ;(requireAdmin as jest.Mock).mockImplementation(() => {
        redirect('/')
        throw new Error('Unauthenticated')
      })

      await expect(getConfig()).rejects.toThrow()
      expect(prisma.config.findUnique).not.toHaveBeenCalled()
      expect(prisma.config.create).not.toHaveBeenCalled()
    })
  })

  describe('setLLMDisabled', () => {
    it('should allow admin to update LLM disabled setting', async () => {
      ;(requireAdmin as jest.Mock).mockResolvedValue(mockAdminSession)
      ;(prisma.config.upsert as jest.Mock).mockResolvedValue({
        id: 'config',
        llmDisabled: true,
        updatedBy: 'admin-user-id',
      })

      const result = await setLLMDisabled(true)

      expect(requireAdmin).toHaveBeenCalled()
      expect(result.success).toBe(true)
      expect(prisma.config.upsert).toHaveBeenCalledWith({
        where: { id: 'config' },
        update: {
          llmDisabled: true,
          updatedBy: 'admin-user-id',
        },
        create: {
          id: 'config',
          llmDisabled: true,
          updatedBy: 'admin-user-id',
        },
      })
    })

    it('should reject non-admin user', async () => {
      ;(requireAdmin as jest.Mock).mockImplementation(() => {
        redirect('/')
        throw new Error('Not admin')
      })

      await expect(setLLMDisabled(true)).rejects.toThrow()
      expect(prisma.config.upsert).not.toHaveBeenCalled()
    })
  })

  describe('getLLMUsageRecords', () => {
    it('should allow admin to get LLM usage records', async () => {
      ;(requireAdmin as jest.Mock).mockResolvedValue(mockAdminSession)
      ;(prisma.lLMUsage.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'usage-1',
          userId: 'user-1',
          provider: 'openai',
          model: 'gpt-4',
          cost: 0.01,
          totalTokens: 1000,
        },
      ])
      ;(prisma.lLMUsage.count as jest.Mock).mockResolvedValue(1)

      const result = await getLLMUsageRecords(1, 50)

      expect(requireAdmin).toHaveBeenCalled()
      expect(result.records).toHaveLength(1)
      expect(result.pagination.total).toBe(1)
    })

    it('should reject non-admin user', async () => {
      ;(requireAdmin as jest.Mock).mockImplementation(() => {
        redirect('/')
        throw new Error('Not admin')
      })

      await expect(getLLMUsageRecords(1, 50)).rejects.toThrow()
      expect(prisma.lLMUsage.findMany).not.toHaveBeenCalled()
    })

    it('should filter by userId when provided', async () => {
      ;(requireAdmin as jest.Mock).mockResolvedValue(mockAdminSession)
      ;(prisma.lLMUsage.findMany as jest.Mock).mockResolvedValue([])
      ;(prisma.lLMUsage.count as jest.Mock).mockResolvedValue(0)

      await getLLMUsageRecords(1, 50, 'user-1')

      expect(prisma.lLMUsage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
        })
      )
    })
  })

  describe('getLLMUsageById', () => {
    it('should allow admin to get LLM usage by ID', async () => {
      ;(requireAdmin as jest.Mock).mockResolvedValue(mockAdminSession)
      ;(prisma.lLMUsage.findUnique as jest.Mock).mockResolvedValue({
        id: 'usage-1',
        userId: 'user-1',
        provider: 'openai',
        model: 'gpt-4',
        cost: 0.01,
        totalTokens: 1000,
      })

      const result = await getLLMUsageById('usage-1')

      expect(requireAdmin).toHaveBeenCalled()
      expect(result).toBeTruthy()
      expect(result?.id).toBe('usage-1')
    })

    it('should reject non-admin user', async () => {
      ;(requireAdmin as jest.Mock).mockImplementation(() => {
        redirect('/')
        throw new Error('Not admin')
      })

      await expect(getLLMUsageById('usage-1')).rejects.toThrow()
      expect(prisma.lLMUsage.findUnique).not.toHaveBeenCalled()
    })
  })

  describe('getLLMUsageStats', () => {
    it('should allow admin to get LLM usage stats', async () => {
      ;(requireAdmin as jest.Mock).mockResolvedValue(mockAdminSession)
      mockGetLLMUsageStats.mockResolvedValue({
        totalCost: 10.5,
        totalTokens: 100000,
      })

      const result = await getLLMUsageStats()

      expect(requireAdmin).toHaveBeenCalled()
      expect(mockGetLLMUsageStats).toHaveBeenCalled()
      expect(result).toBeTruthy()
    })

    it('should reject non-admin user', async () => {
      ;(requireAdmin as jest.Mock).mockImplementation(() => {
        redirect('/')
        throw new Error('Not admin')
      })

      await expect(getLLMUsageStats()).rejects.toThrow()
      expect(mockGetLLMUsageStats).not.toHaveBeenCalled()
    })
  })

  describe('getUserById', () => {
    it('should allow admin to get user by ID', async () => {
      ;(requireAdmin as jest.Mock).mockResolvedValue(mockAdminSession)
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        name: 'Test User',
        email: 'user@example.com',
        image: 'https://example.com/image.jpg',
      })

      const result = await getUserById('user-1')

      expect(requireAdmin).toHaveBeenCalled()
      expect(result).toBeTruthy()
      expect(result?.id).toBe('user-1')
    })

    it('should reject non-admin user', async () => {
      ;(requireAdmin as jest.Mock).mockImplementation(() => {
        redirect('/')
        throw new Error('Not admin')
      })

      await expect(getUserById('user-1')).rejects.toThrow()
      expect(prisma.user.findUnique).not.toHaveBeenCalled()
    })

    it('should only return safe user fields', async () => {
      ;(requireAdmin as jest.Mock).mockResolvedValue(mockAdminSession)
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        name: 'Test User',
        email: 'user@example.com',
        image: 'https://example.com/image.jpg',
      })

      const result = await getUserById('user-1')

      expect(result).not.toHaveProperty('plexUserId')
      expect(result).not.toHaveProperty('isAdmin')
      expect(result).not.toHaveProperty('accounts')
    })
  })

  describe('getHistoricalWrappedVersions', () => {
    it('should allow admin to get historical wrapped versions', async () => {
      ;(requireAdmin as jest.Mock).mockResolvedValue(mockAdminSession)
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
        data: JSON.stringify({ sections: [], summary: 'Test summary' }),
        generatedAt: new Date(),
      })
      ;(prisma.lLMUsage.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'llm-usage-1',
          wrappedId: 'wrapped-1',
          userId: 'user-1',
          response: JSON.stringify({ sections: [], summary: 'Test summary' }),
          createdAt: new Date(),
          provider: 'openai',
          model: 'gpt-4',
          cost: 0.01,
          totalTokens: 1000,
          user: {
            id: 'user-1',
            name: 'Test User',
            email: 'user@example.com',
          },
        },
      ])

      const result = await getHistoricalWrappedVersions('wrapped-1')

      expect(requireAdmin).toHaveBeenCalled()
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('llm-usage-1')
    })

    it('should reject non-admin user', async () => {
      ;(requireAdmin as jest.Mock).mockImplementation(() => {
        redirect('/')
        throw new Error('Not admin')
      })

      await expect(getHistoricalWrappedVersions('wrapped-1')).rejects.toThrow()
      expect(prisma.plexWrapped.findUnique).not.toHaveBeenCalled()
    })
  })

  describe('getHistoricalWrappedData', () => {
    it('should allow admin to get historical wrapped data', async () => {
      ;(requireAdmin as jest.Mock).mockResolvedValue(mockAdminSession)
      ;(prisma.lLMUsage.findUnique as jest.Mock).mockResolvedValue({
        id: 'llm-usage-1',
        wrappedId: 'wrapped-1',
        userId: 'user-1',
        response: JSON.stringify({
          sections: [],
          summary: 'Test summary',
        }),
        createdAt: new Date(),
        provider: 'openai',
        model: 'gpt-4',
        cost: 0.01,
        totalTokens: 1000,
        user: {
          id: 'user-1',
          name: 'Test User',
          email: 'user@example.com',
        },
        wrapped: {
          id: 'wrapped-1',
          year: 2024,
          data: JSON.stringify({
            statistics: { totalWatchTime: { total: 1000 } },
          }),
        },
      })

      const result = await getHistoricalWrappedData('llm-usage-1', 'wrapped-1')

      expect(requireAdmin).toHaveBeenCalled()
      expect(result).toBeTruthy()
      expect(result?.wrappedData).toBeTruthy()
    })

    it('should reject non-admin user', async () => {
      ;(requireAdmin as jest.Mock).mockImplementation(() => {
        redirect('/')
        throw new Error('Not admin')
      })

      await expect(getHistoricalWrappedData('llm-usage-1', 'wrapped-1')).rejects.toThrow()
      expect(prisma.lLMUsage.findUnique).not.toHaveBeenCalled()
    })
  })
})

