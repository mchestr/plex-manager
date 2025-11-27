/**
 * Unit tests for wrapped settings date range feature
 * Tests date range logic, year rollover, and validation
 */

import { getWrappedSettings, updateWrappedSettings } from '@/actions/admin'
import { requireAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import { createLogger } from '@/lib/utils/logger'

// Mock dependencies
jest.mock('@/lib/admin', () => ({
  requireAdmin: jest.fn(),
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    config: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
}))

jest.mock('@/lib/utils/logger', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  })),
}))

const mockRevalidatePath = jest.fn()
jest.mock('next/cache', () => ({
  revalidatePath: (...args: any[]) => mockRevalidatePath(...args),
}))

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>
const mockPrisma = prisma as jest.Mocked<typeof prisma>

const mockAdminSession = {
  user: {
    id: 'admin-user-id',
    email: 'admin@example.com',
    name: 'Admin User',
    isAdmin: true,
  },
}

describe('Wrapped Settings Date Range', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    mockRequireAdmin.mockResolvedValue(mockAdminSession as any)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('getWrappedSettings', () => {
    it('should return defaults when config does not exist', async () => {
      ;(mockPrisma.config.findUnique as jest.Mock).mockResolvedValue(null)

      const result = await getWrappedSettings()

      expect(result.wrappedEnabled).toBe(true)
      expect(result.wrappedYear).toBe(new Date().getFullYear())
    })

    it('should return enabled when no date range is set', async () => {
      const currentYear = new Date().getFullYear()
      ;(mockPrisma.config.findUnique as jest.Mock).mockResolvedValue({
        wrappedEnabled: true,
        wrappedGenerationStartDate: null,
        wrappedGenerationEndDate: null,
      })

      const result = await getWrappedSettings()

      expect(result.wrappedEnabled).toBe(true)
      expect(result.wrappedYear).toBe(currentYear) // Year defaults to current year when no date range
    })

    it('should return disabled when wrappedEnabled is false, regardless of date range', async () => {
      jest.setSystemTime(new Date('2024-12-15'))
      ;(mockPrisma.config.findUnique as jest.Mock).mockResolvedValue({
        wrappedEnabled: false,
        wrappedYear: 2024,
        wrappedGenerationStartDate: new Date('2024-11-20'),
        wrappedGenerationEndDate: new Date('2025-01-31'),
      })

      const result = await getWrappedSettings()

      expect(result.wrappedEnabled).toBe(false)
    })

    describe('normal date range (same year)', () => {
      it('should allow generation when current date is within range', async () => {
        jest.setSystemTime(new Date('2024-12-15'))
        ;(mockPrisma.config.findUnique as jest.Mock).mockResolvedValue({
          wrappedEnabled: true,
          wrappedYear: 2024,
          wrappedGenerationStartDate: new Date('2024-11-20'),
          wrappedGenerationEndDate: new Date('2024-12-31'),
        })

        const result = await getWrappedSettings()

        expect(result.wrappedEnabled).toBe(true)
      })

      it('should disallow generation when current date is before start date', async () => {
        jest.setSystemTime(new Date('2024-11-15'))
        ;(mockPrisma.config.findUnique as jest.Mock).mockResolvedValue({
          wrappedEnabled: true,
          wrappedYear: 2024,
          wrappedGenerationStartDate: new Date('2024-11-20'),
          wrappedGenerationEndDate: new Date('2024-12-31'),
        })

        const result = await getWrappedSettings()

        expect(result.wrappedEnabled).toBe(false)
      })

      it('should disallow generation when current date is after end date', async () => {
        jest.setSystemTime(new Date('2025-01-15'))
        ;(mockPrisma.config.findUnique as jest.Mock).mockResolvedValue({
          wrappedEnabled: true,
          wrappedYear: 2024,
          wrappedGenerationStartDate: new Date('2024-11-20'),
          wrappedGenerationEndDate: new Date('2024-12-31'),
        })

        const result = await getWrappedSettings()

        expect(result.wrappedEnabled).toBe(false)
      })

      it('should allow generation on start date', async () => {
        jest.setSystemTime(new Date('2024-11-20'))
        ;(mockPrisma.config.findUnique as jest.Mock).mockResolvedValue({
          wrappedEnabled: true,
          wrappedYear: 2024,
          wrappedGenerationStartDate: new Date('2024-11-20'),
          wrappedGenerationEndDate: new Date('2024-12-31'),
        })

        const result = await getWrappedSettings()

        expect(result.wrappedEnabled).toBe(true)
      })

      it('should allow generation on end date', async () => {
        jest.setSystemTime(new Date('2024-12-31'))
        ;(mockPrisma.config.findUnique as jest.Mock).mockResolvedValue({
          wrappedEnabled: true,
          wrappedYear: 2024,
          wrappedGenerationStartDate: new Date('2024-11-20'),
          wrappedGenerationEndDate: new Date('2024-12-31'),
        })

        const result = await getWrappedSettings()

        expect(result.wrappedEnabled).toBe(true)
      })
    })

    describe('year rollover date range (Nov - Jan)', () => {
      it('should allow generation in November (after start)', async () => {
        jest.setSystemTime(new Date('2024-11-25'))
        ;(mockPrisma.config.findUnique as jest.Mock).mockResolvedValue({
          wrappedEnabled: true,
          wrappedYear: 2024,
          wrappedGenerationStartDate: new Date('2024-11-20'),
          wrappedGenerationEndDate: new Date('2025-01-31'),
        })

        const result = await getWrappedSettings()

        expect(result.wrappedEnabled).toBe(true)
      })

      it('should allow generation in December', async () => {
        jest.setSystemTime(new Date('2024-12-15'))
        ;(mockPrisma.config.findUnique as jest.Mock).mockResolvedValue({
          wrappedEnabled: true,
          wrappedYear: 2024,
          wrappedGenerationStartDate: new Date('2024-11-20'),
          wrappedGenerationEndDate: new Date('2025-01-31'),
        })

        const result = await getWrappedSettings()

        expect(result.wrappedEnabled).toBe(true)
      })

      it('should allow generation in January (next year, before end)', async () => {
        jest.setSystemTime(new Date('2025-01-15'))
        ;(mockPrisma.config.findUnique as jest.Mock).mockResolvedValue({
          wrappedEnabled: true,
          wrappedYear: 2024,
          wrappedGenerationStartDate: new Date('2024-11-20'),
          wrappedGenerationEndDate: new Date('2025-01-31'),
        })

        const result = await getWrappedSettings()

        expect(result.wrappedEnabled).toBe(true)
      })

      it('should disallow generation in February (after end date)', async () => {
        jest.setSystemTime(new Date('2025-02-15'))
        ;(mockPrisma.config.findUnique as jest.Mock).mockResolvedValue({
          wrappedEnabled: true,
          wrappedYear: 2024,
          wrappedGenerationStartDate: new Date('2024-11-20'),
          wrappedGenerationEndDate: new Date('2025-01-31'),
        })

        const result = await getWrappedSettings()

        expect(result.wrappedEnabled).toBe(false)
      })

      it('should disallow generation in October (before start date)', async () => {
        jest.setSystemTime(new Date('2024-10-15'))
        ;(mockPrisma.config.findUnique as jest.Mock).mockResolvedValue({
          wrappedEnabled: true,
          wrappedYear: 2024,
          wrappedGenerationStartDate: new Date('2024-11-20'),
          wrappedGenerationEndDate: new Date('2025-01-31'),
        })

        const result = await getWrappedSettings()

        expect(result.wrappedEnabled).toBe(false)
      })

      it('should allow generation on start date (Nov 20)', async () => {
        jest.setSystemTime(new Date('2024-11-20'))
        ;(mockPrisma.config.findUnique as jest.Mock).mockResolvedValue({
          wrappedEnabled: true,
          wrappedYear: 2024,
          wrappedGenerationStartDate: new Date('2024-11-20'),
          wrappedGenerationEndDate: new Date('2025-01-31'),
        })

        const result = await getWrappedSettings()

        expect(result.wrappedEnabled).toBe(true)
      })

      it('should allow generation on end date (Jan 31)', async () => {
        jest.setSystemTime(new Date('2025-01-31'))
        ;(mockPrisma.config.findUnique as jest.Mock).mockResolvedValue({
          wrappedEnabled: true,
          wrappedYear: 2024,
          wrappedGenerationStartDate: new Date('2024-11-20'),
          wrappedGenerationEndDate: new Date('2025-01-31'),
        })

        const result = await getWrappedSettings()

        expect(result.wrappedEnabled).toBe(true)
      })
    })

    it('should handle errors gracefully and return defaults', async () => {
      ;(mockPrisma.config.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'))

      const result = await getWrappedSettings()

      expect(result.wrappedEnabled).toBe(true)
      expect(result.wrappedYear).toBe(new Date().getFullYear())
    })
  })

  describe('updateWrappedSettings', () => {

    it('should update wrapped settings without date range', async () => {
      ;(mockPrisma.config.upsert as jest.Mock).mockResolvedValue({
        id: 'config',
        wrappedEnabled: true,
        wrappedGenerationStartDate: null,
        wrappedGenerationEndDate: null,
        updatedBy: 'admin-user-id',
      })

      const result = await updateWrappedSettings({
        enabled: true,
      })

      expect(mockRequireAdmin).toHaveBeenCalled()
      expect(result.success).toBe(true)
      expect(mockPrisma.config.upsert).toHaveBeenCalledWith({
        where: { id: 'config' },
        update: {
          wrappedEnabled: true,
          updatedBy: 'admin-user-id',
        },
        create: {
          id: 'config',
          llmDisabled: false,
          wrappedEnabled: true,
          wrappedGenerationStartDate: null,
          wrappedGenerationEndDate: null,
          updatedBy: 'admin-user-id',
        },
      })
    })

    it('should update wrapped settings with date range (year is auto-determined, not stored)', async () => {
      const startDate = new Date('2024-11-20')
      const endDate = new Date('2025-01-31')
      ;(mockPrisma.config.upsert as jest.Mock).mockResolvedValue({
        id: 'config',
        wrappedEnabled: true,
        wrappedGenerationStartDate: startDate,
        wrappedGenerationEndDate: endDate,
        updatedBy: 'admin-user-id',
      })

      const result = await updateWrappedSettings({
        enabled: true,
        startDate,
        endDate,
      })

      expect(result.success).toBe(true)
      expect(mockPrisma.config.upsert).toHaveBeenCalledWith({
        where: { id: 'config' },
        update: {
          wrappedEnabled: true,
          wrappedGenerationStartDate: startDate,
          wrappedGenerationEndDate: endDate,
          updatedBy: 'admin-user-id',
        },
        create: {
          id: 'config',
          llmDisabled: false,
          wrappedEnabled: true,
          wrappedGenerationStartDate: startDate,
          wrappedGenerationEndDate: endDate,
          updatedBy: 'admin-user-id',
        },
      })
    })

    it('should clear date range when both are null', async () => {
      ;(mockPrisma.config.upsert as jest.Mock).mockResolvedValue({
        id: 'config',
        wrappedEnabled: true,
        wrappedGenerationStartDate: null,
        wrappedGenerationEndDate: null,
        updatedBy: 'admin-user-id',
      })

      const result = await updateWrappedSettings({
        enabled: true,
        startDate: null,
        endDate: null,
      })

      expect(result.success).toBe(true)
      expect(mockPrisma.config.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            wrappedGenerationStartDate: null,
            wrappedGenerationEndDate: null,
          }),
        })
      )
    })

    it('should reject when only start date is provided', async () => {
      const result = await updateWrappedSettings({
        enabled: true,
        startDate: new Date('2024-11-20'),
        endDate: null,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Both start and end dates must be set')
      expect(mockPrisma.config.upsert).not.toHaveBeenCalled()
    })

    it('should reject when only end date is provided', async () => {
      const result = await updateWrappedSettings({
        enabled: true,
        startDate: null,
        endDate: new Date('2025-01-31'),
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Both start and end dates must be set')
      expect(mockPrisma.config.upsert).not.toHaveBeenCalled()
    })

    it('should reject when start and end dates are the same', async () => {
      const sameDate = new Date('2024-11-20')
      const result = await updateWrappedSettings({
        enabled: true,
        startDate: sameDate,
        endDate: sameDate,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Start and end dates cannot be the same')
      expect(mockPrisma.config.upsert).not.toHaveBeenCalled()
    })

    it('should allow year rollover dates (end before start)', async () => {
      const startDate = new Date('2024-11-20')
      const endDate = new Date('2025-01-31')
      ;(mockPrisma.config.upsert as jest.Mock).mockResolvedValue({
        id: 'config',
        wrappedEnabled: true,
        wrappedGenerationStartDate: startDate,
        wrappedGenerationEndDate: endDate,
        updatedBy: 'admin-user-id',
      })

      const result = await updateWrappedSettings({
        enabled: true,
        startDate,
        endDate,
      })

      expect(result.success).toBe(true)
      expect(mockPrisma.config.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            wrappedGenerationStartDate: startDate,
            wrappedGenerationEndDate: endDate,
          }),
        })
      )
    })

    it('should require admin access', async () => {
      mockRequireAdmin.mockImplementation(() => {
        throw new Error('Not admin')
      })

      await expect(
        updateWrappedSettings({
          enabled: true,
        })
      ).rejects.toThrow('Not admin')

      expect(mockPrisma.config.upsert).not.toHaveBeenCalled()
    })

    it('should handle database errors gracefully', async () => {
      ;(mockPrisma.config.upsert as jest.Mock).mockRejectedValue(new Error('Database error'))

      const result = await updateWrappedSettings({
        enabled: true,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Database error')
    })

    it('should revalidate paths after successful update', async () => {
      ;(mockPrisma.config.upsert as jest.Mock).mockResolvedValue({
        id: 'config',
        wrappedEnabled: true,
        wrappedYear: 2024,
        updatedBy: 'admin-user-id',
      })

      await updateWrappedSettings({
        enabled: true,
        year: 2024,
      })

      expect(mockRevalidatePath).toHaveBeenCalledWith('/')
      expect(mockRevalidatePath).toHaveBeenCalledWith('/wrapped')
    })
  })
})

