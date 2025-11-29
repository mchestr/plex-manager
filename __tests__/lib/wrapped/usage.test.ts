/**
 * Tests for lib/wrapped/usage.ts - LLM usage statistics
 */

import {
  getLLMUsageStats,
  getLLMUsageRecords,
  getCostSummary,
} from '@/lib/wrapped/usage'
import { prisma } from '@/lib/prisma'

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    lLMUsage: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

describe('LLM Usage Statistics', () => {
  const mockUsageRecords = [
    {
      id: '1',
      userId: 'user-1',
      provider: 'openai',
      model: 'gpt-4',
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      cost: 0.001,
      createdAt: new Date('2024-01-15'),
      user: {
        id: 'user-1',
        name: 'User 1',
        email: 'user1@example.com',
      },
      wrapped: null,
    },
    {
      id: '2',
      userId: 'user-1',
      provider: 'openai',
      model: 'gpt-3.5-turbo',
      promptTokens: 80,
      completionTokens: 40,
      totalTokens: 120,
      cost: 0.0005,
      createdAt: new Date('2024-01-16'),
      user: {
        id: 'user-1',
        name: 'User 1',
        email: 'user1@example.com',
      },
      wrapped: null,
    },
    {
      id: '3',
      userId: 'user-2',
      provider: 'openai',
      model: 'gpt-4',
      promptTokens: 200,
      completionTokens: 100,
      totalTokens: 300,
      cost: 0.002,
      createdAt: new Date('2024-01-17'),
      user: {
        id: 'user-2',
        name: 'User 2',
        email: 'user2@example.com',
      },
      wrapped: null,
    },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getLLMUsageStats', () => {
    it('should calculate usage statistics correctly', async () => {
      mockPrisma.lLMUsage.findMany.mockResolvedValue(mockUsageRecords as any)

      const result = await getLLMUsageStats()

      expect(result.totalRequests).toBe(3)
      expect(result.totalTokens).toBe(570) // 150 + 120 + 300
      expect(result.totalCost).toBe(0.0035) // 0.001 + 0.0005 + 0.002
      expect(result.averageCostPerRequest).toBeCloseTo(0.00116667, 5)
      expect(result.averageTokensPerRequest).toBe(190) // 570 / 3
    })

    it('should group statistics by provider', async () => {
      mockPrisma.lLMUsage.findMany.mockResolvedValue(mockUsageRecords as any)

      const result = await getLLMUsageStats()

      expect(result.byProvider).toHaveLength(1)
      expect(result.byProvider[0].provider).toBe('openai')
      expect(result.byProvider[0].requests).toBe(3)
      expect(result.byProvider[0].tokens).toBe(570)
      expect(result.byProvider[0].cost).toBe(0.0035)
    })

    it('should group statistics by model', async () => {
      mockPrisma.lLMUsage.findMany.mockResolvedValue(mockUsageRecords as any)

      const result = await getLLMUsageStats()

      expect(result.byModel).toHaveLength(2)
      expect(result.byModel[0].model).toBe('gpt-4')
      expect(result.byModel[0].requests).toBe(2)
      expect(result.byModel[0].tokens).toBe(450) // 150 + 300
      expect(result.byModel[0].cost).toBe(0.003) // 0.001 + 0.002
    })

    it('should group statistics by user', async () => {
      mockPrisma.lLMUsage.findMany.mockResolvedValue(mockUsageRecords as any)

      const result = await getLLMUsageStats()

      expect(result.byUser).toHaveLength(2)
      // Users are sorted by cost descending, so user-2 comes first
      expect(result.byUser[0].userId).toBe('user-2')
      expect(result.byUser[0].requests).toBe(1)
      expect(result.byUser[0].tokens).toBe(300)
      expect(result.byUser[0].cost).toBe(0.002)
      expect(result.byUser[1].userId).toBe('user-1')
      expect(result.byUser[1].requests).toBe(2)
      expect(result.byUser[1].tokens).toBe(270) // 150 + 120
      expect(result.byUser[1].cost).toBe(0.0015) // 0.001 + 0.0005
    })

    it('should group statistics by date', async () => {
      mockPrisma.lLMUsage.findMany.mockResolvedValue(mockUsageRecords as any)

      const result = await getLLMUsageStats()

      expect(result.byDate).toHaveLength(3)
      expect(result.byDate[0].date).toBe('2024-01-17')
      expect(result.byDate[0].requests).toBe(1)
      expect(result.byDate[1].date).toBe('2024-01-16')
      expect(result.byDate[2].date).toBe('2024-01-15')
    })

    it('should filter by date range', async () => {
      const startDate = new Date('2024-01-16')
      const endDate = new Date('2024-01-17')

      mockPrisma.lLMUsage.findMany.mockResolvedValue(
        mockUsageRecords.slice(1) as any
      )

      const result = await getLLMUsageStats(startDate, endDate)

      // Uses `lt` (less than) instead of `lte` for end date to ensure
      // records from the entire end date are included when the caller
      // passes the start of the next day
      expect(mockPrisma.lLMUsage.findMany).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: startDate,
            lt: endDate,
          },
        },
        include: expect.any(Object),
        orderBy: {
          createdAt: 'desc',
        },
      })
      expect(result.totalRequests).toBe(2)
    })

    it('should filter by user ID', async () => {
      mockPrisma.lLMUsage.findMany.mockResolvedValue(
        mockUsageRecords.slice(0, 2) as any
      )

      const result = await getLLMUsageStats(undefined, undefined, 'user-1')

      expect(mockPrisma.lLMUsage.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
        },
        include: expect.any(Object),
        orderBy: {
          createdAt: 'desc',
        },
      })
      expect(result.totalRequests).toBe(2)
    })

    it('should handle empty records', async () => {
      mockPrisma.lLMUsage.findMany.mockResolvedValue([])

      const result = await getLLMUsageStats()

      expect(result.totalRequests).toBe(0)
      expect(result.totalTokens).toBe(0)
      expect(result.totalCost).toBe(0)
      expect(result.averageCostPerRequest).toBe(0)
      expect(result.averageTokensPerRequest).toBe(0)
      expect(result.byProvider).toEqual([])
      expect(result.byModel).toEqual([])
      expect(result.byUser).toEqual([])
      expect(result.byDate).toEqual([])
    })

    it('should handle user without name (use email)', async () => {
      const recordsWithoutName = [
        {
          ...mockUsageRecords[0],
          user: {
            id: 'user-1',
            name: null,
            email: 'user1@example.com',
          },
        },
      ]

      mockPrisma.lLMUsage.findMany.mockResolvedValue(recordsWithoutName as any)

      const result = await getLLMUsageStats()

      expect(result.byUser[0].userName).toBe('user1@example.com')
    })

    it('should handle model as null', async () => {
      const recordsWithNullModel = [
        {
          ...mockUsageRecords[0],
          model: null,
        },
      ]

      mockPrisma.lLMUsage.findMany.mockResolvedValue(recordsWithNullModel as any)

      const result = await getLLMUsageStats()

      expect(result.byModel[0].model).toBe('unknown')
    })
  })

  describe('getLLMUsageRecords', () => {
    it('should return paginated records', async () => {
      mockPrisma.lLMUsage.findMany.mockResolvedValue(mockUsageRecords.slice(0, 2) as any)
      mockPrisma.lLMUsage.count.mockResolvedValue(3)

      const result = await getLLMUsageRecords(1, 2)

      expect(result.records).toHaveLength(2)
      expect(result.pagination.page).toBe(1)
      expect(result.pagination.pageSize).toBe(2)
      expect(result.pagination.total).toBe(3)
      expect(result.pagination.totalPages).toBe(2)
      expect(mockPrisma.lLMUsage.findMany).toHaveBeenCalledWith({
        where: {},
        include: expect.any(Object),
        orderBy: {
          createdAt: 'desc',
        },
        skip: 0,
        take: 2,
      })
    })

    it('should handle pagination correctly', async () => {
      mockPrisma.lLMUsage.findMany.mockResolvedValue([mockUsageRecords[2]] as any)
      mockPrisma.lLMUsage.count.mockResolvedValue(3)

      const result = await getLLMUsageRecords(2, 2)

      expect(result.records).toHaveLength(1)
      expect(result.pagination.page).toBe(2)
      expect(result.pagination.totalPages).toBe(2)
      expect(mockPrisma.lLMUsage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 2,
          take: 2,
        })
      )
    })

    it('should filter by user ID', async () => {
      mockPrisma.lLMUsage.findMany.mockResolvedValue(mockUsageRecords.slice(0, 2) as any)
      mockPrisma.lLMUsage.count.mockResolvedValue(2)

      const result = await getLLMUsageRecords(1, 10, 'user-1')

      expect(mockPrisma.lLMUsage.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        include: expect.any(Object),
        orderBy: {
          createdAt: 'desc',
        },
        skip: 0,
        take: 10,
      })
      expect(result.records).toHaveLength(2)
    })

    it('should use default pagination values', async () => {
      mockPrisma.lLMUsage.findMany.mockResolvedValue(mockUsageRecords as any)
      mockPrisma.lLMUsage.count.mockResolvedValue(3)

      await getLLMUsageRecords()

      expect(mockPrisma.lLMUsage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 50,
        })
      )
    })
  })

  describe('getCostSummary', () => {
    it('should return cost summary for date range', async () => {
      const startDate = new Date('2024-01-01')
      const endDate = new Date('2024-01-31')

      mockPrisma.lLMUsage.findMany.mockResolvedValue(mockUsageRecords as any)

      const result = await getCostSummary(startDate, endDate)

      expect(result.period.start).toBe(startDate.toISOString())
      expect(result.period.end).toBe(endDate.toISOString())
      expect(result.summary.totalCost).toBe(0.0035)
      expect(result.summary.totalRequests).toBe(3)
      expect(result.summary.averageCostPerRequest).toBeCloseTo(0.00116667, 5)
      expect(result.breakdown.byProvider).toHaveLength(1)
      expect(result.breakdown.byModel).toHaveLength(2)
      expect(result.breakdown.byUser).toHaveLength(2)
      expect(result.breakdown.byDate).toHaveLength(3)
    })
  })
})

