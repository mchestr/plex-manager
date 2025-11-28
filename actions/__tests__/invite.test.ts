/**
 * Tests for actions/invite.ts - invite validation and processing
 * Focus on race condition prevention with atomic transactions
 */

import {
  validateInvite,
  processInvite,
  createInvite,
  getInvites,
  deleteInvite,
} from '@/actions/invite'
import { requireAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import {
  getPlexUserInfo,
  inviteUserToPlexServer,
  acceptPlexInvite,
} from '@/lib/connections/plex'
import type { Invite, PlexServer } from '@prisma/client'
import type { Session } from 'next-auth'

// Mock dependencies
jest.mock('@/lib/admin', () => ({
  requireAdmin: jest.fn(),
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    invite: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    inviteUsage: {
      create: jest.fn(),
    },
    plexServer: {
      findFirst: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

jest.mock('@/lib/connections/plex', () => ({
  getPlexUserInfo: jest.fn(),
  inviteUserToPlexServer: jest.fn(),
  acceptPlexInvite: jest.fn(),
}))

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>
const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockGetPlexUserInfo = getPlexUserInfo as jest.MockedFunction<typeof getPlexUserInfo>
const mockInviteUserToPlexServer = inviteUserToPlexServer as jest.MockedFunction<
  typeof inviteUserToPlexServer
>
const mockAcceptPlexInvite = acceptPlexInvite as jest.MockedFunction<typeof acceptPlexInvite>

describe('invite actions', () => {
  const mockSession: Session = {
    user: { id: 'admin-123', name: 'Admin', email: 'admin@test.com', isAdmin: true },
    expires: new Date(Date.now() + 86400000).toISOString(),
  }

  const mockInvite: Invite = {
    id: 'invite-123',
    code: 'TESTCODE',
    maxUses: 1,
    useCount: 0,
    expiresAt: new Date(Date.now() + 86400000), // 1 day from now
    createdBy: 'admin-123',
    createdAt: new Date(),
    librarySectionIds: null,
    allowDownloads: false,
  }

  const mockPlexServer: PlexServer = {
    id: 'server-123',
    name: 'Test Server',
    url: 'http://localhost:32400',
    token: 'test-token',
    machineIdentifier: 'machine-123',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockPlexUser = {
    id: 'plex-user-123',
    username: 'testuser',
    email: 'test@example.com',
    thumb: null,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockRequireAdmin.mockResolvedValue(mockSession)
  })

  describe('validateInvite', () => {
    it('should return success for valid invite', async () => {
      mockPrisma.invite.findUnique.mockResolvedValue(mockInvite)

      const result = await validateInvite('TESTCODE')

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockInvite)
    })

    it('should return error for non-existent invite', async () => {
      mockPrisma.invite.findUnique.mockResolvedValue(null)

      const result = await validateInvite('INVALID')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid invite code')
    })

    it('should return error for expired invite', async () => {
      const expiredInvite = {
        ...mockInvite,
        expiresAt: new Date(Date.now() - 86400000), // 1 day ago
      }
      mockPrisma.invite.findUnique.mockResolvedValue(expiredInvite)

      const result = await validateInvite('TESTCODE')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invite has expired')
    })

    it('should return error for fully used invite', async () => {
      const usedInvite = {
        ...mockInvite,
        useCount: 1,
        maxUses: 1,
      }
      mockPrisma.invite.findUnique.mockResolvedValue(usedInvite)

      const result = await validateInvite('TESTCODE')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invite has reached maximum uses')
    })
  })

  describe('processInvite - atomic transaction behavior', () => {
    beforeEach(() => {
      mockGetPlexUserInfo.mockResolvedValue({
        success: true,
        data: mockPlexUser,
      })
      mockPrisma.plexServer.findFirst.mockResolvedValue(mockPlexServer)
      mockInviteUserToPlexServer.mockResolvedValue({
        success: true,
        inviteID: 12345,
      })
      mockAcceptPlexInvite.mockResolvedValue({ success: true })
    })

    it('should atomically validate and use invite in transaction', async () => {
      // Mock transaction to simulate atomic behavior
      const mockTx = {
        invite: {
          findUnique: jest.fn().mockResolvedValue(mockInvite),
          update: jest.fn().mockResolvedValue({ ...mockInvite, useCount: 1 }),
        },
        user: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'user-123' }),
        },
        inviteUsage: {
          create: jest.fn().mockResolvedValue({}),
        },
      }

      const capturedOptions: Array<{ isolationLevel?: string; timeout?: number } | undefined> = []

      mockPrisma.$transaction.mockImplementation(async (fn, options) => {
        capturedOptions.push(options)
        return fn(mockTx)
      })

      const result = await processInvite('TESTCODE', 'plex-auth-token')

      expect(result.success).toBe(true)
      expect(mockPrisma.$transaction).toHaveBeenCalled()
      // The first transaction should be validateAndUseInvite with Serializable isolation
      expect(capturedOptions[0]?.isolationLevel).toBe('Serializable')
    })

    it('should fail gracefully on transaction conflict (P2034)', async () => {
      const prismaError = new Error('Transaction failed') as Error & { code: string }
      prismaError.code = 'P2034'
      Object.setPrototypeOf(prismaError, require('@prisma/client').Prisma.PrismaClientKnownRequestError.prototype)

      // Simulate transaction failure due to concurrent modification
      mockPrisma.$transaction.mockRejectedValue(prismaError)

      const result = await processInvite('TESTCODE', 'plex-auth-token')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Please try again')
    })

    it('should reject invite that has already been used', async () => {
      const usedInvite = { ...mockInvite, useCount: 1 }

      mockPrisma.$transaction.mockImplementation(async (fn) => {
        const mockTx = {
          invite: {
            findUnique: jest.fn().mockResolvedValue(usedInvite),
          },
        }
        return fn(mockTx)
      })

      const result = await processInvite('TESTCODE', 'plex-auth-token')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invite has reached maximum uses')
    })

    it('should reject expired invite inside transaction', async () => {
      const expiredInvite = {
        ...mockInvite,
        expiresAt: new Date(Date.now() - 86400000),
      }

      mockPrisma.$transaction.mockImplementation(async (fn) => {
        const mockTx = {
          invite: {
            findUnique: jest.fn().mockResolvedValue(expiredInvite),
          },
        }
        return fn(mockTx)
      })

      const result = await processInvite('TESTCODE', 'plex-auth-token')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invite has expired')
    })

    it('should fail if Plex user info cannot be retrieved', async () => {
      mockGetPlexUserInfo.mockResolvedValue({
        success: false,
        error: 'Invalid token',
      })

      const result = await processInvite('TESTCODE', 'invalid-token')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid token')
      // Transaction should not be called since we fail early
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    it('should fail if no active Plex server configured', async () => {
      mockPrisma.plexServer.findFirst.mockResolvedValue(null)

      const result = await processInvite('TESTCODE', 'plex-auth-token')

      expect(result.success).toBe(false)
      expect(result.error).toBe('No active Plex server configured')
      // Transaction should not be called since we fail early
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })
  })

  describe('createInvite', () => {
    it('should create invite with generated code', async () => {
      mockPrisma.invite.findUnique.mockResolvedValue(null)
      mockPrisma.invite.create.mockResolvedValue(mockInvite)

      const result = await createInvite({ maxUses: 5 })

      expect(result.success).toBe(true)
      expect(mockPrisma.invite.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          maxUses: 5,
          createdBy: mockSession.user.id,
        }),
      })
    })

    it('should create invite with custom code', async () => {
      mockPrisma.invite.findUnique.mockResolvedValue(null)
      mockPrisma.invite.create.mockResolvedValue({ ...mockInvite, code: 'CUSTOMCODE' })

      const result = await createInvite({ code: 'customcode' })

      expect(result.success).toBe(true)
      expect(mockPrisma.invite.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          code: 'CUSTOMCODE', // Should be uppercased
        }),
      })
    })

    it('should reject duplicate code', async () => {
      mockPrisma.invite.findUnique.mockResolvedValue(mockInvite)

      const result = await createInvite({ code: 'TESTCODE' })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invite code already exists')
    })
  })

  describe('getInvites', () => {
    it('should return all invites for admin', async () => {
      const invites = [mockInvite, { ...mockInvite, id: 'invite-456', code: 'OTHER' }]
      mockPrisma.invite.findMany.mockResolvedValue(invites)

      const result = await getInvites()

      expect(result.success).toBe(true)
      expect(result.data).toEqual(invites)
    })
  })

  describe('deleteInvite', () => {
    it('should delete invite', async () => {
      mockPrisma.invite.delete.mockResolvedValue(mockInvite)

      const result = await deleteInvite('invite-123')

      expect(result.success).toBe(true)
      expect(mockPrisma.invite.delete).toHaveBeenCalledWith({
        where: { id: 'invite-123' },
      })
    })
  })
})
