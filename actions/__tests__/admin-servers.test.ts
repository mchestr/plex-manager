/**
 * Tests for actions/admin/admin-servers.ts - Jellyfin login toggle
 *
 * These tests cover:
 * - toggleJellyfinLogin: enable/disable Jellyfin visibility on login page
 * - Admin authorization
 * - Input validation with Zod
 */

import { toggleJellyfinLogin } from '@/actions/admin/admin-servers'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    jellyfinServer: {
      updateMany: jest.fn(),
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

describe('admin-servers actions', () => {
  const mockAdminSession = {
    user: { id: 'admin-123', name: 'Admin', email: 'admin@test.com', isAdmin: true },
    expires: new Date(Date.now() + 86400000).toISOString(),
  }

  const mockNonAdminSession = {
    user: { id: 'user-123', name: 'User', email: 'user@test.com', isAdmin: false },
    expires: new Date(Date.now() + 86400000).toISOString(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('toggleJellyfinLogin', () => {
    it('should enable Jellyfin login when passed true', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      mockPrisma.jellyfinServer.updateMany.mockResolvedValue({ count: 1 })

      const result = await toggleJellyfinLogin(true)

      expect(result).toEqual({ success: true })
      expect(mockPrisma.jellyfinServer.updateMany).toHaveBeenCalledWith({
        where: { isActive: true },
        data: { enabledForLogin: true },
      })
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/settings')
      expect(mockRevalidatePath).toHaveBeenCalledWith('/')
    })

    it('should disable Jellyfin login when passed false', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      mockPrisma.jellyfinServer.updateMany.mockResolvedValue({ count: 1 })

      const result = await toggleJellyfinLogin(false)

      expect(result).toEqual({ success: true })
      expect(mockPrisma.jellyfinServer.updateMany).toHaveBeenCalledWith({
        where: { isActive: true },
        data: { enabledForLogin: false },
      })
    })

    it('should reject non-admin users', async () => {
      mockGetServerSession.mockResolvedValue(mockNonAdminSession)

      await expect(toggleJellyfinLogin(true)).rejects.toThrow()
    })

    it('should reject unauthenticated users', async () => {
      mockGetServerSession.mockResolvedValue(null)

      await expect(toggleJellyfinLogin(true)).rejects.toThrow()
    })

    it('should return error for invalid input', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)

      // TypeScript would normally catch this, but testing runtime validation
      const result = await toggleJellyfinLogin('invalid' as unknown as boolean)

      expect(result).toEqual({
        success: false,
        error: 'Invalid input: enabled must be a boolean',
      })
      expect(mockPrisma.jellyfinServer.updateMany).not.toHaveBeenCalled()
    })

    it('should handle database errors gracefully', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      mockPrisma.jellyfinServer.updateMany.mockRejectedValue(new Error('Database error'))

      const result = await toggleJellyfinLogin(true)

      expect(result).toEqual({
        success: false,
        error: 'Database error',
      })
    })

    it('should handle unknown errors gracefully', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      mockPrisma.jellyfinServer.updateMany.mockRejectedValue('unknown error')

      const result = await toggleJellyfinLogin(true)

      expect(result).toEqual({
        success: false,
        error: 'Failed to toggle Jellyfin login setting',
      })
    })
  })
})
