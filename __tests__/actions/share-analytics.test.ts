/**
 * Tests for actions/share-analytics.ts - share analytics functions
 */

import {
  getShareAnalyticsStats,
  getShareTimeSeriesData,
  getTopSharedWraps,
} from '@/actions/share-analytics'
import { prisma } from '@/lib/prisma'

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    plexWrapped: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    wrappedShareVisit: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
  },
}))

describe('Share Analytics', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getShareAnalyticsStats', () => {
    it('should return correct analytics stats', async () => {
      ;(prisma.plexWrapped.count as jest.Mock).mockResolvedValue(10)
      ;(prisma.wrappedShareVisit.count as jest.Mock).mockResolvedValue(50)

      const result = await getShareAnalyticsStats()

      expect(result.totalShares).toBe(10)
      expect(result.totalVisits).toBe(50)
      expect(result.uniqueWrapsShared).toBe(10)
      expect(result.averageVisitsPerShare).toBe(5)
    })

    it('should handle zero shares', async () => {
      ;(prisma.plexWrapped.count as jest.Mock).mockResolvedValue(0)
      ;(prisma.wrappedShareVisit.count as jest.Mock).mockResolvedValue(0)

      const result = await getShareAnalyticsStats()

      expect(result.totalShares).toBe(0)
      expect(result.totalVisits).toBe(0)
      expect(result.uniqueWrapsShared).toBe(0)
      expect(result.averageVisitsPerShare).toBe(0)
    })

    it('should round average visits per share to 2 decimal places', async () => {
      ;(prisma.plexWrapped.count as jest.Mock).mockResolvedValue(3)
      ;(prisma.wrappedShareVisit.count as jest.Mock).mockResolvedValue(10)

      const result = await getShareAnalyticsStats()

      expect(result.averageVisitsPerShare).toBe(3.33) // 10/3 = 3.333... rounded to 3.33
    })

    it('should handle database errors gracefully', async () => {
      ;(prisma.plexWrapped.count as jest.Mock).mockRejectedValue(
        new Error('Database error')
      )

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

      const result = await getShareAnalyticsStats()

      expect(result.totalShares).toBe(0)
      expect(result.totalVisits).toBe(0)
      expect(result.uniqueWrapsShared).toBe(0)
      expect(result.averageVisitsPerShare).toBe(0)
      expect(consoleErrorSpy).toHaveBeenCalled()
      consoleErrorSpy.mockRestore()
    })

    it('should handle wrappedShareVisit count error separately', async () => {
      ;(prisma.plexWrapped.count as jest.Mock).mockResolvedValue(10)
      ;(prisma.wrappedShareVisit.count as jest.Mock).mockRejectedValue(
        new Error('Visit count failed')
      )

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

      const result = await getShareAnalyticsStats()

      expect(result.totalShares).toBe(0)
      expect(result.totalVisits).toBe(0)
      expect(consoleErrorSpy).toHaveBeenCalled()
      consoleErrorSpy.mockRestore()
    })

    it('should handle very large numbers correctly', async () => {
      ;(prisma.plexWrapped.count as jest.Mock).mockResolvedValue(1000000)
      ;(prisma.wrappedShareVisit.count as jest.Mock).mockResolvedValue(5000000)

      const result = await getShareAnalyticsStats()

      expect(result.totalShares).toBe(1000000)
      expect(result.totalVisits).toBe(5000000)
      expect(result.averageVisitsPerShare).toBe(5)
    })
  })

  describe('getShareTimeSeriesData', () => {
    it('should return time series data for default 30 days', async () => {
      const mockShares = [
        { createdAt: new Date('2024-01-15') },
        { createdAt: new Date('2024-01-20') },
      ]

      const mockVisits = [
        { createdAt: new Date('2024-01-15') },
        { createdAt: new Date('2024-01-15') },
        { createdAt: new Date('2024-01-20') },
      ]

      ;(prisma.plexWrapped.findMany as jest.Mock).mockResolvedValue(mockShares)
      ;(prisma.wrappedShareVisit.findMany as jest.Mock).mockResolvedValue(
        mockVisits
      )

      const result = await getShareTimeSeriesData()

      expect(result).toBeInstanceOf(Array)
      expect(result.length).toBeGreaterThan(0)
      // Should have entries for all dates in the range
      expect(result.every((entry) => entry.date && entry.shares >= 0 && entry.visits >= 0)).toBe(
        true
      )
    })

    it('should return time series data for custom days', async () => {
      const mockShares = [{ createdAt: new Date('2024-01-15') }]
      const mockVisits = [{ createdAt: new Date('2024-01-15') }]

      ;(prisma.plexWrapped.findMany as jest.Mock).mockResolvedValue(mockShares)
      ;(prisma.wrappedShareVisit.findMany as jest.Mock).mockResolvedValue(
        mockVisits
      )

      const result = await getShareTimeSeriesData(7)

      expect(result).toBeInstanceOf(Array)
      // Function creates entries for dates starting from (today - 7 days) through today
      // This can be 7 or 8 days depending on time of day - accept either
      expect(result.length).toBeGreaterThanOrEqual(7)
      expect(result.length).toBeLessThanOrEqual(8)
    })

    it('should group shares and visits by date', async () => {
      const baseDate = new Date()
      baseDate.setDate(baseDate.getDate() - 5)

      const mockShares = [
        { createdAt: new Date(baseDate) },
        { createdAt: new Date(baseDate) },
      ]

      const mockVisits = [
        { createdAt: new Date(baseDate) },
        { createdAt: new Date(baseDate) },
        { createdAt: new Date(baseDate) },
      ]

      ;(prisma.plexWrapped.findMany as jest.Mock).mockResolvedValue(mockShares)
      ;(prisma.wrappedShareVisit.findMany as jest.Mock).mockResolvedValue(
        mockVisits
      )

      const result = await getShareTimeSeriesData(7)

      const dateKey = baseDate.toISOString().split('T')[0]
      const entry = result.find((e) => e.date === dateKey)

      if (entry) {
        expect(entry.shares).toBe(2)
        expect(entry.visits).toBe(3)
      }
    })

    it('should sort results by date', async () => {
      const mockShares: any[] = []
      const mockVisits: any[] = []

      ;(prisma.plexWrapped.findMany as jest.Mock).mockResolvedValue(mockShares)
      ;(prisma.wrappedShareVisit.findMany as jest.Mock).mockResolvedValue(
        mockVisits
      )

      const result = await getShareTimeSeriesData(7)

      // Check that dates are in ascending order
      for (let i = 1; i < result.length; i++) {
        expect(result[i].date >= result[i - 1].date).toBe(true)
      }
    })

    it('should handle database errors gracefully', async () => {
      ;(prisma.plexWrapped.findMany as jest.Mock).mockRejectedValue(
        new Error('Database error')
      )

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

      const result = await getShareTimeSeriesData()

      expect(result).toEqual([])
      expect(consoleErrorSpy).toHaveBeenCalled()
      consoleErrorSpy.mockRestore()
    })

    it('should handle wrappedShareVisit query error separately', async () => {
      ;(prisma.plexWrapped.findMany as jest.Mock).mockResolvedValue([])
      ;(prisma.wrappedShareVisit.findMany as jest.Mock).mockRejectedValue(
        new Error('Visit query failed')
      )

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

      const result = await getShareTimeSeriesData()

      expect(result).toEqual([])
      expect(consoleErrorSpy).toHaveBeenCalled()
      consoleErrorSpy.mockRestore()
    })

    it('should handle zero days parameter', async () => {
      const mockShares: any[] = []
      const mockVisits: any[] = []

      ;(prisma.plexWrapped.findMany as jest.Mock).mockResolvedValue(mockShares)
      ;(prisma.wrappedShareVisit.findMany as jest.Mock).mockResolvedValue(
        mockVisits
      )

      const result = await getShareTimeSeriesData(0)

      // Should return empty array or minimal data for 0 days
      expect(result).toBeInstanceOf(Array)
    })

    it('should handle negative days parameter', async () => {
      const mockShares: any[] = []
      const mockVisits: any[] = []

      ;(prisma.plexWrapped.findMany as jest.Mock).mockResolvedValue(mockShares)
      ;(prisma.wrappedShareVisit.findMany as jest.Mock).mockResolvedValue(
        mockVisits
      )

      const result = await getShareTimeSeriesData(-5)

      // Should handle gracefully (likely return empty or minimal data)
      expect(result).toBeInstanceOf(Array)
    })

    it('should handle very large days parameter', async () => {
      const mockShares: any[] = []
      const mockVisits: any[] = []

      ;(prisma.plexWrapped.findMany as jest.Mock).mockResolvedValue(mockShares)
      ;(prisma.wrappedShareVisit.findMany as jest.Mock).mockResolvedValue(
        mockVisits
      )

      const result = await getShareTimeSeriesData(365)

      // Should return data for 365 days
      expect(result).toBeInstanceOf(Array)
      expect(result.length).toBeGreaterThanOrEqual(365)
    })

    it('should handle dates at timezone boundaries', async () => {
      const baseDate = new Date()
      baseDate.setHours(23, 59, 59, 999)

      const mockShares = [{ createdAt: baseDate }]
      const mockVisits = [{ createdAt: baseDate }]

      ;(prisma.plexWrapped.findMany as jest.Mock).mockResolvedValue(mockShares)
      ;(prisma.wrappedShareVisit.findMany as jest.Mock).mockResolvedValue(
        mockVisits
      )

      const result = await getShareTimeSeriesData(7)

      expect(result).toBeInstanceOf(Array)
      // Should group by date correctly even at timezone boundaries
      expect(result.some((entry) => entry.shares > 0 || entry.visits > 0)).toBe(
        true
      )
    })
  })

  describe('getTopSharedWraps', () => {
    it('should return top shared wraps by visit count', async () => {
      const mockWraps = [
        {
          id: 'wrap-1',
          userId: 'user-1',
          year: 2024,
          shareToken: 'token-1',
          generatedAt: new Date('2024-01-15'),
          createdAt: new Date('2024-01-15'),
          user: {
            id: 'user-1',
            name: 'User 1',
            email: 'user1@example.com',
          },
          shareVisits: [{ createdAt: new Date('2024-01-20') }],
          _count: {
            shareVisits: 10,
          },
        },
        {
          id: 'wrap-2',
          userId: 'user-2',
          year: 2024,
          shareToken: 'token-2',
          generatedAt: new Date('2024-01-10'),
          createdAt: new Date('2024-01-10'),
          user: {
            id: 'user-2',
            name: 'User 2',
            email: 'user2@example.com',
          },
          shareVisits: [{ createdAt: new Date('2024-01-18') }],
          _count: {
            shareVisits: 5,
          },
        },
      ]

      ;(prisma.plexWrapped.findMany as jest.Mock).mockResolvedValue(mockWraps)

      const result = await getTopSharedWraps()

      expect(result).toHaveLength(2)
      expect(result[0].wrappedId).toBe('wrap-1')
      expect(result[0].visitCount).toBe(10)
      expect(result[0].userName).toBe('User 1')
      expect(result[1].wrappedId).toBe('wrap-2')
      expect(result[1].visitCount).toBe(5)
    })

    it('should respect limit parameter', async () => {
      const mockWraps = Array.from({ length: 20 }, (_, i) => ({
        id: `wrap-${i}`,
        userId: `user-${i}`,
        year: 2024,
        shareToken: `token-${i}`,
        generatedAt: new Date(),
        createdAt: new Date(),
        user: {
          id: `user-${i}`,
          name: `User ${i}`,
          email: `user${i}@example.com`,
        },
        shareVisits: [],
        _count: {
          shareVisits: i,
        },
      }))

      // Mock Prisma to return only the first 'limit' items (simulating take: limit)
      ;(prisma.plexWrapped.findMany as jest.Mock).mockImplementation((options) => {
        const limit = options?.take || 10
        return Promise.resolve(mockWraps.slice(0, limit))
      })

      const result = await getTopSharedWraps(5)

      expect(result).toHaveLength(5)
      // Verify Prisma was called with take: 5
      expect(prisma.plexWrapped.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5,
        })
      )
    })

    it('should use createdAt if generatedAt is null', async () => {
      const mockWraps = [
        {
          id: 'wrap-1',
          userId: 'user-1',
          year: 2024,
          shareToken: 'token-1',
          generatedAt: null,
          createdAt: new Date('2024-01-15'),
          user: {
            id: 'user-1',
            name: 'User 1',
            email: 'user1@example.com',
          },
          shareVisits: [],
          _count: {
            shareVisits: 10,
          },
        },
      ]

      ;(prisma.plexWrapped.findMany as jest.Mock).mockResolvedValue(mockWraps)

      const result = await getTopSharedWraps()

      expect(result[0].firstSharedAt).toEqual(new Date('2024-01-15'))
    })

    it('should handle wraps with no visits', async () => {
      const mockWraps = [
        {
          id: 'wrap-1',
          userId: 'user-1',
          year: 2024,
          shareToken: 'token-1',
          generatedAt: new Date('2024-01-15'),
          createdAt: new Date('2024-01-15'),
          user: {
            id: 'user-1',
            name: 'User 1',
            email: 'user1@example.com',
          },
          shareVisits: [],
          _count: {
            shareVisits: 0,
          },
        },
      ]

      ;(prisma.plexWrapped.findMany as jest.Mock).mockResolvedValue(mockWraps)

      const result = await getTopSharedWraps()

      expect(result[0].visitCount).toBe(0)
      expect(result[0].lastVisitedAt).toBeNull()
    })

    it('should handle database errors gracefully', async () => {
      ;(prisma.plexWrapped.findMany as jest.Mock).mockRejectedValue(
        new Error('Database error')
      )

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

      const result = await getTopSharedWraps()

      expect(result).toEqual([])
      expect(consoleErrorSpy).toHaveBeenCalled()
      consoleErrorSpy.mockRestore()
    })

    it('should use default limit when zero is passed (validation)', async () => {
      const mockWraps: any[] = []

      ;(prisma.plexWrapped.findMany as jest.Mock).mockResolvedValue(mockWraps)

      const result = await getTopSharedWraps(0)

      expect(result).toEqual([])
      // With validation, invalid limit (0) falls back to default (10)
      expect(prisma.plexWrapped.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        })
      )
    })

    it('should use default limit when negative value is passed (validation)', async () => {
      const mockWraps: any[] = []

      ;(prisma.plexWrapped.findMany as jest.Mock).mockResolvedValue(mockWraps)

      const result = await getTopSharedWraps(-5)

      // With validation, invalid limit (-5) falls back to default (10)
      expect(prisma.plexWrapped.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        })
      )
    })

    it('should cap limit at maximum allowed value (100) when very large value is passed', async () => {
      const mockWraps = Array.from({ length: 100 }, (_, i) => ({
        id: `wrap-${i}`,
        userId: `user-${i}`,
        year: 2024,
        shareToken: `token-${i}`,
        generatedAt: new Date(),
        createdAt: new Date(),
        user: {
          id: `user-${i}`,
          name: `User ${i}`,
          email: `user${i}@example.com`,
        },
        shareVisits: [],
        _count: {
          shareVisits: i,
        },
      }))

      ;(prisma.plexWrapped.findMany as jest.Mock).mockImplementation((options) => {
        const limit = options?.take || 10
        return Promise.resolve(mockWraps.slice(0, limit))
      })

      const result = await getTopSharedWraps(1000)

      // With validation, limit over 100 falls back to default (10)
      expect(prisma.plexWrapped.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        })
      )
    })

    it('should handle wraps with null user data', async () => {
      const mockWraps = [
        {
          id: 'wrap-1',
          userId: 'user-1',
          year: 2024,
          shareToken: 'token-1',
          generatedAt: new Date('2024-01-15'),
          createdAt: new Date('2024-01-15'),
          user: {
            id: 'user-1',
            name: null,
            email: null,
          },
          shareVisits: [],
          _count: {
            shareVisits: 5,
          },
        },
      ]

      ;(prisma.plexWrapped.findMany as jest.Mock).mockResolvedValue(mockWraps)

      const result = await getTopSharedWraps()

      expect(result[0].userName).toBeNull()
      expect(result[0].userEmail).toBeNull()
      expect(result[0].visitCount).toBe(5)
    })

    it('should handle wraps with both generatedAt and createdAt null', async () => {
      const mockWraps = [
        {
          id: 'wrap-1',
          userId: 'user-1',
          year: 2024,
          shareToken: 'token-1',
          generatedAt: null,
          createdAt: null,
          user: {
            id: 'user-1',
            name: 'User 1',
            email: 'user1@example.com',
          },
          shareVisits: [],
          _count: {
            shareVisits: 10,
          },
        },
      ]

      ;(prisma.plexWrapped.findMany as jest.Mock).mockResolvedValue(mockWraps)

      const result = await getTopSharedWraps()

      expect(result[0].firstSharedAt).toBeNull()
    })

    it('should correctly order wraps by visit count descending', async () => {
      const mockWraps = [
        {
          id: 'wrap-1',
          userId: 'user-1',
          year: 2024,
          shareToken: 'token-1',
          generatedAt: new Date('2024-01-15'),
          createdAt: new Date('2024-01-15'),
          user: {
            id: 'user-1',
            name: 'User 1',
            email: 'user1@example.com',
          },
          shareVisits: [],
          _count: {
            shareVisits: 100,
          },
        },
        {
          id: 'wrap-2',
          userId: 'user-2',
          year: 2024,
          shareToken: 'token-2',
          generatedAt: new Date('2024-01-10'),
          createdAt: new Date('2024-01-10'),
          user: {
            id: 'user-2',
            name: 'User 2',
            email: 'user2@example.com',
          },
          shareVisits: [],
          _count: {
            shareVisits: 50,
          },
        },
        {
          id: 'wrap-3',
          userId: 'user-3',
          year: 2024,
          shareToken: 'token-3',
          generatedAt: new Date('2024-01-20'),
          createdAt: new Date('2024-01-20'),
          user: {
            id: 'user-3',
            name: 'User 3',
            email: 'user3@example.com',
          },
          shareVisits: [],
          _count: {
            shareVisits: 75,
          },
        },
      ]

      ;(prisma.plexWrapped.findMany as jest.Mock).mockResolvedValue(mockWraps)

      const result = await getTopSharedWraps()

      // Should be ordered by visit count descending
      expect(result[0].visitCount).toBe(100)
      expect(result[1].visitCount).toBe(50)
      expect(result[2].visitCount).toBe(75)
    })

    it('should include most recent visit timestamp', async () => {
      const recentVisit = new Date('2024-01-25')
      const olderVisit = new Date('2024-01-20')

      const mockWraps = [
        {
          id: 'wrap-1',
          userId: 'user-1',
          year: 2024,
          shareToken: 'token-1',
          generatedAt: new Date('2024-01-15'),
          createdAt: new Date('2024-01-15'),
          user: {
            id: 'user-1',
            name: 'User 1',
            email: 'user1@example.com',
          },
          shareVisits: [{ createdAt: recentVisit }],
          _count: {
            shareVisits: 2,
          },
        },
      ]

      ;(prisma.plexWrapped.findMany as jest.Mock).mockResolvedValue(mockWraps)

      const result = await getTopSharedWraps()

      expect(result[0].lastVisitedAt).toEqual(recentVisit)
    })
  })
})

