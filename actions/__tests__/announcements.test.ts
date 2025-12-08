/**
 * Tests for actions/announcements.ts - announcement CRUD operations
 *
 * These tests cover:
 * - Getting active announcements (filters expired/inactive)
 * - Admin-only operations (create, update, delete, setActive)
 * - Input validation with Zod
 * - Prisma error handling (P2025 not found)
 */

import {
  getActiveAnnouncements,
  getAllAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  setAnnouncementActive,
} from '@/actions/announcements'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    announcement: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockRevalidatePath = revalidatePath as jest.MockedFunction<typeof revalidatePath>

describe('announcements actions', () => {
  const mockAdminSession = {
    user: { id: 'admin-123', name: 'Admin', email: 'admin@test.com', isAdmin: true },
    expires: new Date(Date.now() + 86400000).toISOString(),
  }

  const mockNonAdminSession = {
    user: { id: 'user-123', name: 'User', email: 'user@test.com', isAdmin: false },
    expires: new Date(Date.now() + 86400000).toISOString(),
  }

  const mockAnnouncement = {
    id: 'ann-123',
    title: 'Test Announcement',
    content: 'This is test content',
    priority: 10,
    isActive: true,
    createdAt: new Date('2024-01-01'),
    expiresAt: new Date('2025-12-31'),
    createdBy: 'admin-123',
    updatedAt: new Date('2024-01-01'),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getActiveAnnouncements', () => {
    it('should return active, non-expired announcements', async () => {
      mockPrisma.announcement.findMany.mockResolvedValue([mockAnnouncement])

      const result = await getActiveAnnouncements()

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('ann-123')
      expect(result[0].title).toBe('Test Announcement')
      expect(mockPrisma.announcement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
          }),
        })
      )
    })

    it('should return empty array on database error', async () => {
      mockPrisma.announcement.findMany.mockRejectedValue(new Error('Database error'))

      const result = await getActiveAnnouncements()

      expect(result).toEqual([])
    })

    it('should convert dates to ISO strings', async () => {
      mockPrisma.announcement.findMany.mockResolvedValue([mockAnnouncement])

      const result = await getActiveAnnouncements()

      expect(result[0].createdAt).toBe('2024-01-01T00:00:00.000Z')
      expect(result[0].expiresAt).toBe('2025-12-31T00:00:00.000Z')
    })
  })

  describe('getAllAnnouncements', () => {
    it('should return all announcements for admin', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      mockPrisma.announcement.findMany.mockResolvedValue([mockAnnouncement])

      const result = await getAllAnnouncements()

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('ann-123')
    })

    it('should return empty array for non-admin', async () => {
      mockGetServerSession.mockResolvedValue(mockNonAdminSession)

      const result = await getAllAnnouncements()

      expect(result).toEqual([])
      expect(mockPrisma.announcement.findMany).not.toHaveBeenCalled()
    })

    it('should return empty array when not authenticated', async () => {
      mockGetServerSession.mockResolvedValue(null)

      const result = await getAllAnnouncements()

      expect(result).toEqual([])
    })
  })

  describe('createAnnouncement', () => {
    it('should create announcement for admin', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      mockPrisma.announcement.create.mockResolvedValue(mockAnnouncement)

      const result = await createAnnouncement({
        title: 'Test Announcement',
        content: 'This is test content',
        priority: 10,
        isActive: true,
        expiresAt: '2025-12-31T00:00:00.000Z',
      })

      expect(result.success).toBe(true)
      expect(result.data?.title).toBe('Test Announcement')
      expect(mockRevalidatePath).toHaveBeenCalledWith('/')
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/announcements')
    })

    it('should reject for non-admin', async () => {
      mockGetServerSession.mockResolvedValue(mockNonAdminSession)

      const result = await createAnnouncement({
        title: 'Test',
        content: 'Content',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unauthorized')
    })

    it('should validate title is required', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)

      const result = await createAnnouncement({
        title: '',
        content: 'Content',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Title is required')
    })

    it('should validate content is required', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)

      const result = await createAnnouncement({
        title: 'Title',
        content: '',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Content is required')
    })

    it('should validate title max length', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)

      const result = await createAnnouncement({
        title: 'a'.repeat(201),
        content: 'Content',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Title too long')
    })

    it('should validate invalid date format', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)

      const result = await createAnnouncement({
        title: 'Title',
        content: 'Content',
        expiresAt: 'invalid-date',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid date format')
    })

    it('should allow null expiresAt', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      mockPrisma.announcement.create.mockResolvedValue({
        ...mockAnnouncement,
        expiresAt: null,
      })

      const result = await createAnnouncement({
        title: 'Test',
        content: 'Content',
        expiresAt: null,
      })

      expect(result.success).toBe(true)
      expect(result.data?.expiresAt).toBeNull()
    })
  })

  describe('updateAnnouncement', () => {
    it('should update announcement for admin', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      mockPrisma.announcement.update.mockResolvedValue(mockAnnouncement)

      const result = await updateAnnouncement({
        id: 'ann-123',
        title: 'Updated Title',
        content: 'Updated content',
        priority: 5,
        isActive: true,
        expiresAt: null,
      })

      expect(result.success).toBe(true)
      expect(mockRevalidatePath).toHaveBeenCalledWith('/')
    })

    it('should return error for non-existent announcement', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      mockPrisma.announcement.update.mockRejectedValue({ code: 'P2025' })

      const result = await updateAnnouncement({
        id: 'non-existent',
        title: 'Title',
        content: 'Content',
        priority: 0,
        isActive: true,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Announcement not found')
    })

    it('should reject for non-admin', async () => {
      mockGetServerSession.mockResolvedValue(mockNonAdminSession)

      const result = await updateAnnouncement({
        id: 'ann-123',
        title: 'Title',
        content: 'Content',
        priority: 0,
        isActive: true,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unauthorized')
    })
  })

  describe('deleteAnnouncement', () => {
    it('should delete announcement for admin', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      mockPrisma.announcement.delete.mockResolvedValue(mockAnnouncement)

      const result = await deleteAnnouncement('ann-123')

      expect(result.success).toBe(true)
      expect(mockRevalidatePath).toHaveBeenCalledWith('/')
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/announcements')
    })

    it('should return error for non-existent announcement', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      mockPrisma.announcement.delete.mockRejectedValue({ code: 'P2025' })

      const result = await deleteAnnouncement('non-existent')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Announcement not found')
    })

    it('should reject for non-admin', async () => {
      mockGetServerSession.mockResolvedValue(mockNonAdminSession)

      const result = await deleteAnnouncement('ann-123')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unauthorized')
    })
  })

  describe('setAnnouncementActive', () => {
    it('should set announcement to active', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      mockPrisma.announcement.update.mockResolvedValue({
        ...mockAnnouncement,
        isActive: true,
      })

      const result = await setAnnouncementActive('ann-123', true)

      expect(result.success).toBe(true)
      expect(mockPrisma.announcement.update).toHaveBeenCalledWith({
        where: { id: 'ann-123' },
        data: { isActive: true },
      })
      expect(mockRevalidatePath).toHaveBeenCalledWith('/')
    })

    it('should set announcement to inactive', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      mockPrisma.announcement.update.mockResolvedValue({
        ...mockAnnouncement,
        isActive: false,
      })

      const result = await setAnnouncementActive('ann-123', false)

      expect(result.success).toBe(true)
      expect(mockPrisma.announcement.update).toHaveBeenCalledWith({
        where: { id: 'ann-123' },
        data: { isActive: false },
      })
    })

    it('should return error for non-existent announcement', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      mockPrisma.announcement.update.mockRejectedValue({ code: 'P2025' })

      const result = await setAnnouncementActive('non-existent', true)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Announcement not found')
    })

    it('should reject for non-admin', async () => {
      mockGetServerSession.mockResolvedValue(mockNonAdminSession)

      const result = await setAnnouncementActive('ann-123', true)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unauthorized')
    })
  })
})
