/**
 * Tests for actions/maintenance.ts - maintenance rule and candidate operations
 */

import {
  getMaintenanceRules,
  createMaintenanceRule,
  updateMaintenanceRule,
  deleteMaintenanceRule,
  toggleMaintenanceRule,
  getMaintenanceCandidates,
  updateCandidateReviewStatus,
  bulkUpdateCandidates,
  triggerManualScan,
  triggerDeletion,
  getUserMediaMarks,
  createUserMediaMark,
  deleteUserMediaMark,
  getMaintenanceStats,
} from '@/actions/maintenance'
import { requireAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import { maintenanceQueue, deletionQueue } from '@/lib/maintenance/queue'
import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import type {
  MaintenanceRule,
  MaintenanceCandidate,
  MaintenanceScan,
  UserMediaMark,
} from '@/lib/generated/prisma/client'
import type { Session } from 'next-auth'

jest.mock('@/lib/admin', () => ({
  requireAdmin: jest.fn(),
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    maintenanceRule: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    maintenanceCandidate: {
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    userMediaMark: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    maintenanceScan: {
      findMany: jest.fn(),
    },
    maintenanceDeletionLog: {
      count: jest.fn(),
    },
  },
}))

jest.mock('@/lib/maintenance/queue', () => ({
  maintenanceQueue: {
    add: jest.fn(),
  },
  deletionQueue: {
    add: jest.fn(),
  },
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockMaintenanceQueue = maintenanceQueue as jest.Mocked<typeof maintenanceQueue>
const mockDeletionQueue = deletionQueue as jest.Mocked<typeof deletionQueue>
const mockRevalidatePath = revalidatePath as jest.MockedFunction<typeof revalidatePath>

describe('Maintenance Actions', () => {
  const mockAdminSession: Partial<Session> = {
    user: {
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin User',
      isAdmin: true,
    },
  }

  const mockUserSession: Partial<Session> = {
    user: {
      id: 'user-1',
      email: 'user@example.com',
      name: 'Regular User',
      isAdmin: false,
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getMaintenanceRules', () => {
    it('should return all maintenance rules with scan counts', async () => {
      const mockRules: Partial<MaintenanceRule>[] = [
        {
          id: 'rule-1',
          name: 'Old Movies',
          enabled: true,
          scans: [
            {
              id: 'scan-1',
              status: 'COMPLETED',
              itemsScanned: 100,
              itemsFlagged: 10,
              completedAt: new Date(),
            },
          ],
          _count: { scans: 5 },
        },
        {
          id: 'rule-2',
          name: 'Unwatched Shows',
          enabled: false,
          scans: [],
          _count: { scans: 0 },
        },
      ]

      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)
      mockPrisma.maintenanceRule.findMany.mockResolvedValue(mockRules as MaintenanceRule[])

      const result = await getMaintenanceRules()

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockRules)
      expect(mockRequireAdmin).toHaveBeenCalled()
      expect(mockPrisma.maintenanceRule.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        include: {
          scans: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              status: true,
              itemsScanned: true,
              itemsFlagged: true,
              completedAt: true,
            },
          },
          _count: {
            select: {
              scans: true,
            },
          },
        },
      })
    })

    it('should require admin access', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Unauthorized'))

      await expect(getMaintenanceRules()).rejects.toThrow('Unauthorized')
      expect(mockRequireAdmin).toHaveBeenCalled()
    })

    it('should handle database errors', async () => {
      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)
      mockPrisma.maintenanceRule.findMany.mockRejectedValue(new Error('DB error'))

      const result = await getMaintenanceRules()

      expect(result.success).toBe(false)
      expect(result.error).toBe('DB error')
    })
  })

  describe('createMaintenanceRule', () => {
    const validInput = {
      name: 'Test Rule',
      description: 'Test description',
      enabled: true,
      mediaType: 'MOVIE' as const,
      criteria: {
        type: 'group' as const,
        id: 'group-1',
        operator: 'AND' as const,
        conditions: [
          {
            type: 'condition' as const,
            id: 'cond-1',
            field: 'neverWatched',
            operator: 'equals',
            value: true,
          },
        ],
      },
      actionType: 'FLAG_FOR_REVIEW' as const,
      schedule: '0 0 * * *',
    }

    it('should create maintenance rule successfully', async () => {
      const mockCreated: Partial<MaintenanceRule> = {
        id: 'rule-1',
        ...validInput,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)
      mockPrisma.maintenanceRule.create.mockResolvedValue(mockCreated as MaintenanceRule)

      const result = await createMaintenanceRule(validInput)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockCreated)
      expect(mockPrisma.maintenanceRule.create).toHaveBeenCalledWith({
        data: {
          name: validInput.name,
          description: validInput.description,
          enabled: validInput.enabled,
          mediaType: validInput.mediaType,
          criteria: validInput.criteria,
          actionType: validInput.actionType,
          schedule: validInput.schedule,
        },
      })
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/maintenance')
    })

    it('should require admin access', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Unauthorized'))

      await expect(createMaintenanceRule(validInput)).rejects.toThrow('Unauthorized')
      expect(mockRequireAdmin).toHaveBeenCalled()
    })

    it('should return validation error for invalid input', async () => {
      const invalidInput = { name: '', mediaType: 'INVALID' }

      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)

      const result = await createMaintenanceRule(invalidInput)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(mockPrisma.maintenanceRule.create).not.toHaveBeenCalled()
    })

    it('should handle database errors', async () => {
      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)
      mockPrisma.maintenanceRule.create.mockRejectedValue(new Error('DB error'))

      const result = await createMaintenanceRule(validInput)

      expect(result.success).toBe(false)
      expect(result.error).toBe('DB error')
    })
  })

  describe('updateMaintenanceRule', () => {
    const updateInput = {
      name: 'Updated Rule',
      description: 'Updated description',
      enabled: false,
    }

    it('should update maintenance rule successfully', async () => {
      const mockUpdated: Partial<MaintenanceRule> = {
        id: 'rule-1',
        ...updateInput,
        mediaType: 'MOVIE',
        criteria: {},
        actionType: 'FLAG_FOR_REVIEW',
      }

      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)
      mockPrisma.maintenanceRule.update.mockResolvedValue(mockUpdated as MaintenanceRule)

      const result = await updateMaintenanceRule('rule-1', updateInput)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockUpdated)
      expect(mockPrisma.maintenanceRule.update).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
        data: {
          name: updateInput.name,
          description: updateInput.description,
          enabled: updateInput.enabled,
          mediaType: undefined,
          criteria: undefined,
          actionType: undefined,
          schedule: null,
        },
      })
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/maintenance')
    })

    it('should require admin access', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Unauthorized'))

      await expect(updateMaintenanceRule('rule-1', updateInput)).rejects.toThrow('Unauthorized')
    })

    it('should return validation error for invalid input', async () => {
      const invalidInput = { name: '' }

      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)

      const result = await updateMaintenanceRule('rule-1', invalidInput)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(mockPrisma.maintenanceRule.update).not.toHaveBeenCalled()
    })

    it('should handle database errors', async () => {
      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)
      mockPrisma.maintenanceRule.update.mockRejectedValue(new Error('Rule not found'))

      const result = await updateMaintenanceRule('nonexistent', updateInput)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Rule not found')
    })
  })

  describe('deleteMaintenanceRule', () => {
    it('should delete maintenance rule successfully', async () => {
      const mockDeleted: Partial<MaintenanceRule> = { id: 'rule-1' }

      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)
      mockPrisma.maintenanceRule.delete.mockResolvedValue(mockDeleted as MaintenanceRule)

      const result = await deleteMaintenanceRule('rule-1')

      expect(result.success).toBe(true)
      expect(mockPrisma.maintenanceRule.delete).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
      })
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/maintenance')
    })

    it('should require admin access', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Unauthorized'))

      await expect(deleteMaintenanceRule('rule-1')).rejects.toThrow('Unauthorized')
    })

    it('should handle database errors', async () => {
      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)
      mockPrisma.maintenanceRule.delete.mockRejectedValue(new Error('Rule not found'))

      const result = await deleteMaintenanceRule('nonexistent')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Rule not found')
    })
  })

  describe('toggleMaintenanceRule', () => {
    it('should enable maintenance rule successfully', async () => {
      const mockRule: Partial<MaintenanceRule> = {
        id: 'rule-1',
        name: 'Test Rule',
        enabled: true,
      }

      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)
      mockPrisma.maintenanceRule.update.mockResolvedValue(mockRule as MaintenanceRule)

      const result = await toggleMaintenanceRule('rule-1', true)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockRule)
      expect(mockPrisma.maintenanceRule.update).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
        data: { enabled: true },
      })
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/maintenance')
    })

    it('should disable maintenance rule successfully', async () => {
      const mockRule: Partial<MaintenanceRule> = {
        id: 'rule-1',
        name: 'Test Rule',
        enabled: false,
      }

      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)
      mockPrisma.maintenanceRule.update.mockResolvedValue(mockRule as MaintenanceRule)

      const result = await toggleMaintenanceRule('rule-1', false)

      expect(result.success).toBe(true)
      expect(result.data?.enabled).toBe(false)
    })

    it('should require admin access', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Unauthorized'))

      await expect(toggleMaintenanceRule('rule-1', true)).rejects.toThrow('Unauthorized')
    })
  })

  describe('getMaintenanceCandidates', () => {
    const mockCandidateData: Partial<MaintenanceCandidate>[] = [
      {
        id: 'candidate-1',
        reviewStatus: 'PENDING',
        mediaType: 'MOVIE',
        scan: {
          id: 'scan-1',
          rule: { id: 'rule-1', name: 'Test Rule', actionType: 'FLAG_FOR_REVIEW' },
        },
      },
    ]

    beforeEach(() => {
      mockPrisma.maintenanceCandidate.count.mockResolvedValue(1)
      mockPrisma.maintenanceCandidate.findMany.mockResolvedValue(
        mockCandidateData as MaintenanceCandidate[]
      )
    })

    it('should return paginated candidates with default parameters', async () => {
      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)

      const result = await getMaintenanceCandidates()

      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        candidates: mockCandidateData,
        pagination: {
          page: 1,
          pageSize: 25,
          totalCount: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      })
      expect(mockPrisma.maintenanceCandidate.count).toHaveBeenCalledWith({ where: {} })
      expect(mockPrisma.maintenanceCandidate.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { flaggedAt: 'desc' },
        skip: 0,
        take: 25,
        include: {
          scan: {
            include: {
              rule: {
                select: {
                  id: true,
                  name: true,
                  actionType: true,
                },
              },
            },
          },
        },
      })
    })

    it('should paginate correctly with custom page and pageSize', async () => {
      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)
      mockPrisma.maintenanceCandidate.count.mockResolvedValue(100)

      const result = await getMaintenanceCandidates({ page: 3, pageSize: 10 })

      expect(result.success).toBe(true)
      expect(result.data?.pagination).toEqual({
        page: 3,
        pageSize: 10,
        totalCount: 100,
        totalPages: 10,
        hasNextPage: true,
        hasPreviousPage: true,
      })
      expect(mockPrisma.maintenanceCandidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        })
      )
    })

    it('should filter candidates by review status with pagination', async () => {
      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)
      mockPrisma.maintenanceCandidate.count.mockResolvedValue(50)

      await getMaintenanceCandidates({ reviewStatus: 'APPROVED', page: 2, pageSize: 25 })

      expect(mockPrisma.maintenanceCandidate.count).toHaveBeenCalledWith({
        where: { reviewStatus: 'APPROVED' },
      })
      expect(mockPrisma.maintenanceCandidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { reviewStatus: 'APPROVED' },
          skip: 25,
          take: 25,
        })
      )
    })

    it('should filter candidates by media type', async () => {
      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)

      await getMaintenanceCandidates({ mediaType: 'TV_SERIES' })

      expect(mockPrisma.maintenanceCandidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { mediaType: 'TV_SERIES' },
        })
      )
    })

    it('should filter candidates by scan ID', async () => {
      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)

      await getMaintenanceCandidates({ scanId: 'scan-1' })

      expect(mockPrisma.maintenanceCandidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { scanId: 'scan-1' },
        })
      )
    })

    it('should apply multiple filters with pagination', async () => {
      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)

      await getMaintenanceCandidates({
        reviewStatus: 'PENDING',
        mediaType: 'MOVIE',
        scanId: 'scan-1',
        page: 1,
        pageSize: 50,
      })

      expect(mockPrisma.maintenanceCandidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            reviewStatus: 'PENDING',
            mediaType: 'MOVIE',
            scanId: 'scan-1',
          },
          skip: 0,
          take: 50,
        })
      )
    })

    it('should calculate hasNextPage and hasPreviousPage correctly', async () => {
      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)
      mockPrisma.maintenanceCandidate.count.mockResolvedValue(75)

      // Test first page - hasNextPage true, hasPreviousPage false
      let result = await getMaintenanceCandidates({ page: 1, pageSize: 25 })
      expect(result.data?.pagination.hasNextPage).toBe(true)
      expect(result.data?.pagination.hasPreviousPage).toBe(false)

      // Test middle page - both true
      result = await getMaintenanceCandidates({ page: 2, pageSize: 25 })
      expect(result.data?.pagination.hasNextPage).toBe(true)
      expect(result.data?.pagination.hasPreviousPage).toBe(true)

      // Test last page - hasNextPage false, hasPreviousPage true
      result = await getMaintenanceCandidates({ page: 3, pageSize: 25 })
      expect(result.data?.pagination.hasNextPage).toBe(false)
      expect(result.data?.pagination.hasPreviousPage).toBe(true)
    })

    it('should handle empty results', async () => {
      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)
      mockPrisma.maintenanceCandidate.count.mockResolvedValue(0)
      mockPrisma.maintenanceCandidate.findMany.mockResolvedValue([])

      const result = await getMaintenanceCandidates()

      expect(result.success).toBe(true)
      expect(result.data?.candidates).toEqual([])
      expect(result.data?.pagination).toEqual({
        page: 1,
        pageSize: 25,
        totalCount: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      })
    })

    it('should require admin access', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Unauthorized'))

      await expect(getMaintenanceCandidates()).rejects.toThrow('Unauthorized')
    })
  })

  describe('updateCandidateReviewStatus', () => {
    it('should update candidate review status successfully', async () => {
      const mockCandidate: Partial<MaintenanceCandidate> = {
        id: 'candidate-1',
        reviewStatus: 'APPROVED',
        reviewedAt: new Date(),
        reviewedBy: 'admin-1',
        reviewNote: 'Looks good',
      }

      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)
      mockPrisma.maintenanceCandidate.update.mockResolvedValue(mockCandidate as MaintenanceCandidate)

      const result = await updateCandidateReviewStatus('candidate-1', 'APPROVED', 'Looks good')

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockCandidate)
      expect(mockPrisma.maintenanceCandidate.update).toHaveBeenCalledWith({
        where: { id: 'candidate-1' },
        data: {
          reviewStatus: 'APPROVED',
          reviewedAt: expect.any(Date),
          reviewedBy: 'admin-1',
          reviewNote: 'Looks good',
        },
      })
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/maintenance')
    })

    it('should update without review note', async () => {
      const mockCandidate: Partial<MaintenanceCandidate> = {
        id: 'candidate-1',
        reviewStatus: 'REJECTED',
        reviewedAt: new Date(),
        reviewedBy: 'admin-1',
      }

      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)
      mockPrisma.maintenanceCandidate.update.mockResolvedValue(mockCandidate as MaintenanceCandidate)

      const result = await updateCandidateReviewStatus('candidate-1', 'REJECTED')

      expect(result.success).toBe(true)
      expect(mockPrisma.maintenanceCandidate.update).toHaveBeenCalledWith({
        where: { id: 'candidate-1' },
        data: {
          reviewStatus: 'REJECTED',
          reviewedAt: expect.any(Date),
          reviewedBy: 'admin-1',
          reviewNote: undefined,
        },
      })
    })

    it('should require admin access', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Unauthorized'))

      await expect(updateCandidateReviewStatus('candidate-1', 'APPROVED')).rejects.toThrow(
        'Unauthorized'
      )
    })

    it('should handle database errors', async () => {
      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)
      mockPrisma.maintenanceCandidate.update.mockRejectedValue(new Error('Candidate not found'))

      const result = await updateCandidateReviewStatus('nonexistent', 'APPROVED')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Candidate not found')
    })
  })

  describe('bulkUpdateCandidates', () => {
    it('should bulk update candidates successfully', async () => {
      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)
      mockPrisma.maintenanceCandidate.updateMany.mockResolvedValue({ count: 3 })

      const result = await bulkUpdateCandidates(
        ['candidate-1', 'candidate-2', 'candidate-3'],
        'APPROVED'
      )

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ count: 3 })
      expect(mockPrisma.maintenanceCandidate.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['candidate-1', 'candidate-2', 'candidate-3'] },
        },
        data: {
          reviewStatus: 'APPROVED',
          reviewedAt: expect.any(Date),
          reviewedBy: 'admin-1',
        },
      })
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/maintenance')
    })

    it('should require admin access', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Unauthorized'))

      await expect(bulkUpdateCandidates(['candidate-1'], 'REJECTED')).rejects.toThrow(
        'Unauthorized'
      )
    })
  })

  describe('triggerManualScan', () => {
    it('should trigger manual scan for enabled rule', async () => {
      const mockRule: Partial<MaintenanceRule> = {
        id: 'rule-1',
        name: 'Test Rule',
        enabled: true,
      }

      const mockJob = { id: 'job-123' }

      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)
      mockPrisma.maintenanceRule.findUnique.mockResolvedValue(mockRule as MaintenanceRule)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockMaintenanceQueue.add.mockResolvedValue(mockJob as any)

      const result = await triggerManualScan('rule-1')

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ jobId: 'job-123' })
      expect(mockMaintenanceQueue.add).toHaveBeenCalledWith(
        'manual-scan-rule-1',
        {
          ruleId: 'rule-1',
          manualTrigger: true,
        },
        {
          priority: 1,
        }
      )
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/maintenance')
    })

    it('should return error when rule not found', async () => {
      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)
      mockPrisma.maintenanceRule.findUnique.mockResolvedValue(null)

      const result = await triggerManualScan('nonexistent')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Maintenance rule not found')
      expect(mockMaintenanceQueue.add).not.toHaveBeenCalled()
    })

    it('should return error when rule is disabled', async () => {
      const mockRule: Partial<MaintenanceRule> = {
        id: 'rule-1',
        name: 'Test Rule',
        enabled: false,
      }

      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)
      mockPrisma.maintenanceRule.findUnique.mockResolvedValue(mockRule as MaintenanceRule)

      const result = await triggerManualScan('rule-1')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Maintenance rule is disabled')
      expect(mockMaintenanceQueue.add).not.toHaveBeenCalled()
    })

    it('should require admin access', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Unauthorized'))

      await expect(triggerManualScan('rule-1')).rejects.toThrow('Unauthorized')
    })

    it('should handle queue errors', async () => {
      const mockRule: Partial<MaintenanceRule> = { id: 'rule-1', enabled: true }

      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)
      mockPrisma.maintenanceRule.findUnique.mockResolvedValue(mockRule as MaintenanceRule)
      mockMaintenanceQueue.add.mockRejectedValue(new Error('Queue error'))

      const result = await triggerManualScan('rule-1')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Queue error')
    })
  })

  describe('triggerDeletion', () => {
    it('should trigger deletion for approved candidates', async () => {
      const mockCandidates: Partial<MaintenanceCandidate>[] = [
        { id: 'candidate-1', reviewStatus: 'APPROVED' },
        { id: 'candidate-2', reviewStatus: 'APPROVED' },
      ]

      const mockJob = { id: 'job-456' }

      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)
      mockPrisma.maintenanceCandidate.findMany.mockResolvedValue(
        mockCandidates as MaintenanceCandidate[]
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockDeletionQueue.add.mockResolvedValue(mockJob as any)

      const result = await triggerDeletion(['candidate-1', 'candidate-2'], true)

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ jobId: 'job-456' })
      expect(mockDeletionQueue.add).toHaveBeenCalledWith(
        expect.stringContaining('deletion-'),
        {
          candidateIds: ['candidate-1', 'candidate-2'],
          deleteFiles: true,
          userId: 'admin-1',
        },
        {
          priority: 1,
        }
      )
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/maintenance')
    })

    it('should support deletion without removing files', async () => {
      const mockCandidates: Partial<MaintenanceCandidate>[] = [
        { id: 'candidate-1', reviewStatus: 'APPROVED' },
      ]
      const mockJob = { id: 'job-789' }

      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)
      mockPrisma.maintenanceCandidate.findMany.mockResolvedValue(
        mockCandidates as MaintenanceCandidate[]
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockDeletionQueue.add.mockResolvedValue(mockJob as any)

      const result = await triggerDeletion(['candidate-1'], false)

      expect(result.success).toBe(true)
      expect(mockDeletionQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          deleteFiles: false,
        }),
        expect.any(Object)
      )
    })

    it('should return error when no candidates found', async () => {
      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)
      mockPrisma.maintenanceCandidate.findMany.mockResolvedValue([])

      const result = await triggerDeletion(['nonexistent'], true)

      expect(result.success).toBe(false)
      expect(result.error).toBe('No candidates found')
      expect(mockDeletionQueue.add).not.toHaveBeenCalled()
    })

    it('should return error when some candidates not found', async () => {
      const mockCandidates: Partial<MaintenanceCandidate>[] = [
        { id: 'candidate-1', reviewStatus: 'APPROVED' },
      ]

      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)
      mockPrisma.maintenanceCandidate.findMany.mockResolvedValue(
        mockCandidates as MaintenanceCandidate[]
      )

      const result = await triggerDeletion(['candidate-1', 'candidate-2'], true)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Some candidates were not found')
    })

    it('should return error when candidates not approved', async () => {
      const mockCandidates: Partial<MaintenanceCandidate>[] = [
        { id: 'candidate-1', reviewStatus: 'APPROVED' },
        { id: 'candidate-2', reviewStatus: 'PENDING' },
      ]

      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)
      mockPrisma.maintenanceCandidate.findMany.mockResolvedValue(
        mockCandidates as MaintenanceCandidate[]
      )

      const result = await triggerDeletion(['candidate-1', 'candidate-2'], true)

      expect(result.success).toBe(false)
      expect(result.error).toBe('1 candidate(s) are not approved for deletion')
    })

    it('should require admin access', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Unauthorized'))

      await expect(triggerDeletion(['candidate-1'], true)).rejects.toThrow('Unauthorized')
    })
  })

  describe('getUserMediaMarks', () => {
    it('should return user media marks without filters', async () => {
      const mockMarks: Partial<UserMediaMark>[] = [
        {
          id: 'mark-1',
          userId: 'user-1',
          mediaType: 'MOVIE',
          markType: 'FINISHED_WATCHING',
          title: 'Test Movie',
        },
      ]

      mockGetServerSession.mockResolvedValue(mockUserSession as Session)
      mockPrisma.userMediaMark.findMany.mockResolvedValue(mockMarks as UserMediaMark[])

      const result = await getUserMediaMarks()

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockMarks)
      expect(mockPrisma.userMediaMark.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { markedAt: 'desc' },
      })
    })

    it('should filter marks by media type', async () => {
      mockGetServerSession.mockResolvedValue(mockUserSession as Session)
      mockPrisma.userMediaMark.findMany.mockResolvedValue([])

      await getUserMediaMarks({ mediaType: 'TV_SERIES' })

      expect(mockPrisma.userMediaMark.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            mediaType: 'TV_SERIES',
          },
        })
      )
    })

    it('should filter marks by mark type', async () => {
      mockGetServerSession.mockResolvedValue(mockUserSession as Session)
      mockPrisma.userMediaMark.findMany.mockResolvedValue([])

      await getUserMediaMarks({ markType: 'KEEP_FOREVER' })

      expect(mockPrisma.userMediaMark.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            markType: 'KEEP_FOREVER',
          },
        })
      )
    })

    it('should return error when not authenticated', async () => {
      mockGetServerSession.mockResolvedValue(null)

      const result = await getUserMediaMarks()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unauthorized')
    })

    it('should handle database errors', async () => {
      mockGetServerSession.mockResolvedValue(mockUserSession as Session)
      mockPrisma.userMediaMark.findMany.mockRejectedValue(new Error('DB error'))

      const result = await getUserMediaMarks()

      expect(result.success).toBe(false)
      expect(result.error).toBe('DB error')
    })
  })

  describe('createUserMediaMark', () => {
    const validInput = {
      mediaType: 'MOVIE' as const,
      plexRatingKey: '12345',
      title: 'Test Movie',
      year: 2024,
      markType: 'FINISHED_WATCHING' as const,
      note: 'Great movie',
      markedVia: 'web',
    }

    it('should create user media mark successfully', async () => {
      const mockCreated: Partial<UserMediaMark> = {
        id: 'mark-1',
        userId: 'user-1',
        ...validInput,
        markedAt: new Date(),
      }

      mockGetServerSession.mockResolvedValue(mockUserSession as Session)
      mockPrisma.userMediaMark.findFirst.mockResolvedValue(null)
      mockPrisma.userMediaMark.create.mockResolvedValue(mockCreated as UserMediaMark)

      const result = await createUserMediaMark(validInput)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockCreated)
      expect(mockPrisma.userMediaMark.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          mediaType: validInput.mediaType,
          plexRatingKey: validInput.plexRatingKey,
          radarrId: undefined,
          sonarrId: undefined,
          title: validInput.title,
          year: validInput.year,
          seasonNumber: undefined,
          episodeNumber: undefined,
          parentTitle: undefined,
          markType: validInput.markType,
          note: validInput.note,
          markedVia: validInput.markedVia,
          discordChannelId: undefined,
        },
      })
      expect(mockRevalidatePath).toHaveBeenCalledWith('/media')
    })

    it('should return error when mark already exists', async () => {
      const existingMark: Partial<UserMediaMark> = {
        id: 'mark-1',
        userId: 'user-1',
        plexRatingKey: '12345',
        markType: 'FINISHED_WATCHING',
      }

      mockGetServerSession.mockResolvedValue(mockUserSession as Session)
      mockPrisma.userMediaMark.findFirst.mockResolvedValue(existingMark as UserMediaMark)

      const result = await createUserMediaMark(validInput)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Mark already exists for this media')
      expect(mockPrisma.userMediaMark.create).not.toHaveBeenCalled()
    })

    it('should return error when not authenticated', async () => {
      mockGetServerSession.mockResolvedValue(null)

      const result = await createUserMediaMark(validInput)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unauthorized')
    })

    it('should return validation error for invalid input', async () => {
      const invalidInput = { mediaType: 'INVALID', plexRatingKey: '', title: '' }

      mockGetServerSession.mockResolvedValue(mockUserSession as Session)

      const result = await createUserMediaMark(invalidInput)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(mockPrisma.userMediaMark.create).not.toHaveBeenCalled()
    })
  })

  describe('deleteUserMediaMark', () => {
    it('should delete user media mark successfully', async () => {
      const mockMark: Partial<UserMediaMark> = { id: 'mark-1', userId: 'user-1' }

      mockGetServerSession.mockResolvedValue(mockUserSession as Session)
      mockPrisma.userMediaMark.findUnique.mockResolvedValue(mockMark as UserMediaMark)
      mockPrisma.userMediaMark.delete.mockResolvedValue(mockMark as UserMediaMark)

      const result = await deleteUserMediaMark('mark-1')

      expect(result.success).toBe(true)
      expect(mockPrisma.userMediaMark.delete).toHaveBeenCalledWith({
        where: { id: 'mark-1' },
      })
      expect(mockRevalidatePath).toHaveBeenCalledWith('/media')
    })

    it('should return error when mark not found', async () => {
      mockGetServerSession.mockResolvedValue(mockUserSession as Session)
      mockPrisma.userMediaMark.findUnique.mockResolvedValue(null)

      const result = await deleteUserMediaMark('nonexistent')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Mark not found')
      expect(mockPrisma.userMediaMark.delete).not.toHaveBeenCalled()
    })

    it('should return error when mark belongs to different user', async () => {
      const mockMark: Partial<UserMediaMark> = { id: 'mark-1', userId: 'other-user' }

      mockGetServerSession.mockResolvedValue(mockUserSession as Session)
      mockPrisma.userMediaMark.findUnique.mockResolvedValue(mockMark as UserMediaMark)

      const result = await deleteUserMediaMark('mark-1')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unauthorized to delete this mark')
      expect(mockPrisma.userMediaMark.delete).not.toHaveBeenCalled()
    })

    it('should return error when not authenticated', async () => {
      mockGetServerSession.mockResolvedValue(null)

      const result = await deleteUserMediaMark('mark-1')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unauthorized')
    })
  })

  describe('getMaintenanceStats', () => {
    it('should return maintenance statistics successfully', async () => {
      const mockRecentScans: Partial<MaintenanceScan>[] = [
        {
          id: 'scan-1',
          status: 'COMPLETED',
          completedAt: new Date(),
          rule: { id: 'rule-1', name: 'Test Rule' },
        },
      ]

      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)
      mockPrisma.maintenanceRule.count
        .mockResolvedValueOnce(10) // totalRules
        .mockResolvedValueOnce(7) // enabledRules
      mockPrisma.maintenanceCandidate.count
        .mockResolvedValueOnce(50) // totalCandidates
        .mockResolvedValueOnce(30) // pendingCandidates
        .mockResolvedValueOnce(15) // approvedCandidates
        .mockResolvedValueOnce(5) // rejectedCandidates
      mockPrisma.maintenanceScan.findMany.mockResolvedValue(mockRecentScans as MaintenanceScan[])
      mockPrisma.maintenanceDeletionLog.count.mockResolvedValue(100)

      const result = await getMaintenanceStats()

      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        rules: {
          total: 10,
          enabled: 7,
          disabled: 3,
        },
        candidates: {
          total: 50,
          pending: 30,
          approved: 15,
          rejected: 5,
        },
        recentScans: mockRecentScans,
        totalDeletions: 100,
      })
    })

    it('should require admin access', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Unauthorized'))

      await expect(getMaintenanceStats()).rejects.toThrow('Unauthorized')
    })

    it('should handle database errors', async () => {
      mockRequireAdmin.mockResolvedValue(mockAdminSession as Session)
      mockPrisma.maintenanceRule.count.mockRejectedValue(new Error('DB error'))

      const result = await getMaintenanceStats()

      expect(result.success).toBe(false)
      expect(result.error).toBe('DB error')
    })
  })
})
