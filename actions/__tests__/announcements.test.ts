/**
 * Tests for actions/announcements.ts - announcement CRUD operations
 *
 * These tests cover:
 * - Getting active announcements (filters expired/inactive)
 * - Admin-only adminActions (create, update, delete, setActive) (P10.5)
 * - Input validation with the shared announcementSchema
 * - Revalidating home, /announcements and the admin page
 * - Prisma not-found (P2025) as NOT_FOUND
 */

import {
  getActiveAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  setAnnouncementActive,
} from '@/actions/announcements'
import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { Prisma } from '@/lib/generated/prisma/client'

// Mock dependencies
jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

const mockPrisma = prismaMock
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
    const memberSession = { expires: '2099-01-01', user: { id: 'member-1', isAdmin: false } }

    /** The announcements a signed-in member gets. */
    async function active() {
      const result = await getActiveAnnouncements()
      if (!result.success) throw new Error(result.error)
      return result.data
    }

    beforeEach(() => {
      mockGetServerSession.mockResolvedValue(memberSession)
    })

    it('should return active, non-expired announcements', async () => {
      mockPrisma.announcement.findMany.mockResolvedValue([mockAnnouncement])

      const result = await active()

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

    it('refuses a signed-out caller', async () => {
      mockGetServerSession.mockResolvedValue(null)

      await expect(getActiveAnnouncements()).resolves.toMatchObject({ success: false, code: 'UNAUTHENTICATED' })
      expect(mockPrisma.announcement.findMany).not.toHaveBeenCalled()
    })

    it('returns a coded failure on database error', async () => {
      mockPrisma.announcement.findMany.mockRejectedValue(new Error('Database error'))

      await expect(getActiveAnnouncements()).resolves.toMatchObject({ success: false, code: 'INTERNAL' })
    })

    it('should convert dates to ISO strings', async () => {
      mockPrisma.announcement.findMany.mockResolvedValue([mockAnnouncement])

      const result = await active()

      expect(result[0].createdAt).toBe('2024-01-01T00:00:00.000Z')
      expect(result[0].expiresAt).toBe('2025-12-31T00:00:00.000Z')
    })
  })

  const PATHS = ['/', '/announcements', '/admin/announcements']
  const expectRevalidated = () => PATHS.forEach((path) => expect(mockRevalidatePath).toHaveBeenCalledWith(path))
  const notFound = () => new Prisma.PrismaClientKnownRequestError('Record not found', { code: 'P2025', clientVersion: '7' })
  const input = { title: 'Storage upgrade', content: '- Disks swap', priority: 10, isActive: true, expiresAt: '' }

  describe('createAnnouncement', () => {
    beforeEach(() => mockGetServerSession.mockResolvedValue(mockAdminSession))

    it('creates the announcement and revalidates the three pages', async () => {
      mockPrisma.announcement.create.mockResolvedValue(mockAnnouncement)

      await expect(createAnnouncement(input)).resolves.toEqual({ success: true, data: { id: 'ann-123' } })

      expect(mockPrisma.announcement.create).toHaveBeenCalledWith({
        data: { ...input, expiresAt: null, createdBy: 'admin-123' },
        select: { id: true },
      })
      expectRevalidated()
    })

    it('reads the expiry as wall time in the server zone', async () => {
      mockPrisma.config.findUnique.mockResolvedValue({ timezone: 'America/Los_Angeles' } as never)
      mockPrisma.announcement.create.mockResolvedValue(mockAnnouncement)

      await createAnnouncement({ ...input, expiresAt: '2026-12-31T23:59' })

      expect(mockPrisma.announcement.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ expiresAt: new Date('2027-01-01T07:59:00Z') }) })
      )
    })

    it('rejects an expiry with a zone or offset, which would bypass the server zone', async () => {
      const result = await createAnnouncement({ ...input, expiresAt: '2026-12-31T23:59:00Z' })

      expect(result).toMatchObject({ success: false, code: 'VALIDATION', fieldErrors: { expiresAt: ['Enter a date and time'] } })
      expect(mockPrisma.announcement.create).not.toHaveBeenCalled()
    })

    it.each([
      [{ title: '' }, 'title', 'Add a title'],
      [{ title: 'a'.repeat(201) }, 'title', 'Keep the title to 200 characters'],
      [{ content: '   ' }, 'content', 'Add the announcement text'],
      [{ content: 'a'.repeat(5001) }, 'content', 'Keep the text to 5,000 characters'],
      [{ priority: 101 }, 'priority', 'Priority is a whole number from 0 to 100'],
    ])('rejects %o with a field error', async (patch, field, message) => {
      const result = await createAnnouncement({ ...input, ...patch })

      expect(result).toMatchObject({ success: false, code: 'VALIDATION', fieldErrors: { [field]: [message] } })
      expect(mockPrisma.announcement.create).not.toHaveBeenCalled()
    })

    it('refuses a member', async () => {
      mockGetServerSession.mockResolvedValue(mockNonAdminSession)

      await expect(createAnnouncement(input)).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' })
      expect(mockPrisma.announcement.create).not.toHaveBeenCalled()
    })

    it('returns its own copy, never the database error', async () => {
      mockPrisma.announcement.create.mockRejectedValue(new Error('connection refused at db:5432'))

      await expect(createAnnouncement(input)).resolves.toEqual({
        success: false,
        code: 'INTERNAL',
        error: "Couldn't create the announcement",
      })
    })
  })

  describe('updateAnnouncement', () => {
    beforeEach(() => mockGetServerSession.mockResolvedValue(mockAdminSession))

    it('updates the row and revalidates the three pages', async () => {
      mockPrisma.announcement.update.mockResolvedValue(mockAnnouncement)

      await expect(updateAnnouncement({ id: 'ann-123', ...input })).resolves.toEqual({ success: true, data: { id: 'ann-123' } })

      expect(mockPrisma.announcement.update).toHaveBeenCalledWith({
        where: { id: 'ann-123' },
        data: { title: input.title, content: input.content, priority: 10, isActive: true, expiresAt: null },
      })
      expectRevalidated()
    })

    it('converts the expiry in the server zone', async () => {
      mockPrisma.config.findUnique.mockResolvedValue({ timezone: 'Europe/Berlin' } as never)
      mockPrisma.announcement.update.mockResolvedValue(mockAnnouncement)

      await updateAnnouncement({ id: 'ann-123', ...input, expiresAt: '2026-07-01T12:00' })

      expect(mockPrisma.announcement.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ expiresAt: new Date('2026-07-01T10:00:00Z') }) })
      )
    })

    it('reads a missing row as NOT_FOUND', async () => {
      mockPrisma.announcement.update.mockRejectedValue(notFound())

      await expect(updateAnnouncement({ id: 'gone', ...input })).resolves.toMatchObject({ success: false, code: 'NOT_FOUND' })
    })

    it('refuses a member', async () => {
      mockGetServerSession.mockResolvedValue(mockNonAdminSession)

      await expect(updateAnnouncement({ id: 'ann-123', ...input })).resolves.toMatchObject({ code: 'FORBIDDEN' })
    })
  })

  describe('deleteAnnouncement', () => {
    beforeEach(() => mockGetServerSession.mockResolvedValue(mockAdminSession))

    it('deletes the row and revalidates the three pages', async () => {
      mockPrisma.announcement.delete.mockResolvedValue(mockAnnouncement)

      await expect(deleteAnnouncement({ id: 'ann-123' })).resolves.toEqual({ success: true, data: null })

      expect(mockPrisma.announcement.delete).toHaveBeenCalledWith({ where: { id: 'ann-123' } })
      expectRevalidated()
    })

    it('reads a missing row as NOT_FOUND', async () => {
      mockPrisma.announcement.delete.mockRejectedValue(notFound())

      await expect(deleteAnnouncement({ id: 'gone' })).resolves.toMatchObject({ success: false, code: 'NOT_FOUND' })
    })

    it('refuses a member', async () => {
      mockGetServerSession.mockResolvedValue(mockNonAdminSession)

      await expect(deleteAnnouncement({ id: 'ann-123' })).resolves.toMatchObject({ code: 'FORBIDDEN' })
      expect(mockPrisma.announcement.delete).not.toHaveBeenCalled()
    })
  })

  describe('setAnnouncementActive', () => {
    beforeEach(() => mockGetServerSession.mockResolvedValue(mockAdminSession))

    it.each([true, false])('sets isActive to %s and revalidates the three pages', async (isActive) => {
      mockPrisma.announcement.update.mockResolvedValue({ ...mockAnnouncement, isActive })

      await expect(setAnnouncementActive({ id: 'ann-123', isActive })).resolves.toEqual({ success: true, data: null })

      expect(mockPrisma.announcement.update).toHaveBeenCalledWith({ where: { id: 'ann-123' }, data: { isActive } })
      expectRevalidated()
    })

    it('reads a missing row as NOT_FOUND', async () => {
      mockPrisma.announcement.update.mockRejectedValue(notFound())

      await expect(setAnnouncementActive({ id: 'gone', isActive: true })).resolves.toMatchObject({ code: 'NOT_FOUND' })
    })

    it('refuses a member', async () => {
      mockGetServerSession.mockResolvedValue(mockNonAdminSession)

      await expect(setAnnouncementActive({ id: 'ann-123', isActive: true })).resolves.toMatchObject({ code: 'FORBIDDEN' })
    })
  })
})
