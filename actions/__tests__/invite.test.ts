/**
 * Tests for actions/invite.ts - invite validation and processing
 *
 * These tests cover:
 * - Basic invite CRUD operations
 * - Race condition prevention with atomic transactions
 * - Transaction conflict retry logic (P2034)
 * - Compensating transactions (rollback) on Plex failures
 * - Audit logging for security-sensitive events
 */

import {
  validateInvite,
  processInvite,
  processJellyfinInvite,
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
import { createJellyfinUser, setJellyfinUserPolicy } from '@/lib/connections/jellyfin'
import { logAuditEvent, AuditEventType } from '@/lib/security/audit-log'
import { Prisma } from '@/lib/generated/prisma/client'
import type { Invite, PlexServer } from '@/lib/generated/prisma/client'
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
    jellyfinServer: {
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

jest.mock('@/lib/connections/jellyfin', () => ({
  createJellyfinUser: jest.fn(),
  setJellyfinUserPolicy: jest.fn(),
  deleteJellyfinUser: jest.fn(),
}))

jest.mock('@/lib/security/audit-log', () => ({
  logAuditEvent: jest.fn(),
  AuditEventType: {
    INVITE_CONSUMED: 'INVITE_CONSUMED',
    INVITE_PLEX_FAILURE: 'INVITE_PLEX_FAILURE',
    INVITE_JELLYFIN_FAILURE: 'INVITE_JELLYFIN_FAILURE',
    INVITE_ROLLBACK: 'INVITE_ROLLBACK',
    INVITE_ROLLBACK_FAILED: 'INVITE_ROLLBACK_FAILED',
    INVITE_TRANSACTION_CONFLICT: 'INVITE_TRANSACTION_CONFLICT',
  },
}))

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>
const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockGetPlexUserInfo = getPlexUserInfo as jest.MockedFunction<typeof getPlexUserInfo>
const mockInviteUserToPlexServer = inviteUserToPlexServer as jest.MockedFunction<
  typeof inviteUserToPlexServer
>
const mockAcceptPlexInvite = acceptPlexInvite as jest.MockedFunction<typeof acceptPlexInvite>
const mockCreateJellyfinUser = createJellyfinUser as jest.MockedFunction<typeof createJellyfinUser>
const mockSetJellyfinUserPolicy = setJellyfinUserPolicy as jest.MockedFunction<
  typeof setJellyfinUserPolicy
>
const mockLogAuditEvent = logAuditEvent as jest.MockedFunction<typeof logAuditEvent>

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

  describe('processInvite - rollback and audit logging', () => {
    beforeEach(() => {
      mockGetPlexUserInfo.mockResolvedValue({ success: true, data: mockPlexUser })
      mockPrisma.plexServer.findFirst.mockResolvedValue(mockPlexServer)
      mockAcceptPlexInvite.mockResolvedValue({ success: true })

      // Mock successful transactions by default
      mockPrisma.$transaction.mockImplementation(async (fn) => {
        if (typeof fn === 'function') {
          const txClient = {
            invite: {
              findUnique: jest.fn().mockResolvedValue(mockInvite),
              update: jest.fn().mockResolvedValue({ ...mockInvite, useCount: 1 }),
            },
            user: {
              findUnique: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue({ id: 'user-1' }),
              update: jest.fn().mockResolvedValue({ id: 'user-1' }),
            },
            inviteUsage: {
              create: jest.fn().mockResolvedValue({}),
            },
          }
          return fn(txClient as Prisma.TransactionClient)
        }
        return Promise.resolve()
      })
    })

    it('should process invite successfully and log audit event', async () => {
      mockInviteUserToPlexServer.mockResolvedValue({ success: true, inviteID: 12345 })

      const result = await processInvite('TESTCODE', 'plex-auth-token')

      expect(result.success).toBe(true)
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        AuditEventType.INVITE_CONSUMED,
        'system',
        expect.objectContaining({
          inviteId: 'invite-123',
          inviteCode: 'TESTCODE',
        })
      )
    })

    it('should rollback invite when Plex invite fails', async () => {
      mockInviteUserToPlexServer.mockResolvedValue({
        success: false,
        error: 'Plex server unavailable',
      })

      const result = await processInvite('TESTCODE', 'plex-auth-token')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Plex server unavailable')

      // Should log the failure
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        AuditEventType.INVITE_PLEX_FAILURE,
        'system',
        expect.objectContaining({
          stage: 'invite_to_server',
        })
      )

      // Should attempt rollback
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        AuditEventType.INVITE_ROLLBACK,
        'system',
        expect.objectContaining({
          inviteId: 'invite-123',
          reason: 'Plex server unavailable',
        })
      )
    })

    it('should rollback invite when accept invite fails', async () => {
      mockInviteUserToPlexServer.mockResolvedValue({ success: true, inviteID: 12345 })
      mockAcceptPlexInvite.mockRejectedValue(new Error('Accept failed'))

      const result = await processInvite('TESTCODE', 'plex-auth-token')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Accept failed')

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        AuditEventType.INVITE_PLEX_FAILURE,
        'system',
        expect.objectContaining({
          stage: 'accept_invite',
        })
      )
    })
  })

  describe('invite redemption exempts the user from the subscription gate', () => {
    // Transaction-scoped client shared by every prisma.$transaction callback so
    // the user create/update calls can be asserted on.
    const tx = {
      invite: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      inviteUsage: {
        create: jest.fn(),
      },
    }

    /**
     * Run processInvite under fake timers so the 2s Plex propagation delay
     * resolves immediately instead of slowing the suite down.
     */
    async function runProcessInvite(code: string, token: string) {
      jest.useFakeTimers()
      try {
        const promise = processInvite(code, token)
        await jest.runAllTimersAsync()
        return await promise
      } finally {
        jest.useRealTimers()
      }
    }

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation(async (fn) =>
        typeof fn === 'function' ? fn(tx as unknown as Prisma.TransactionClient) : Promise.resolve()
      )
      mockGetPlexUserInfo.mockResolvedValue({ success: true, data: mockPlexUser })
      mockPrisma.plexServer.findFirst.mockResolvedValue(mockPlexServer)
      mockInviteUserToPlexServer.mockResolvedValue({ success: true, inviteID: 12345 })
      mockAcceptPlexInvite.mockResolvedValue({ success: true })
      tx.invite.findUnique.mockResolvedValue(mockInvite)
      tx.invite.update.mockResolvedValue({ ...mockInvite, useCount: 1 })
      tx.inviteUsage.create.mockResolvedValue({})
    })

    it('marks a newly created user exempt', async () => {
      tx.user.findUnique.mockResolvedValue(null)
      tx.user.create.mockResolvedValue({ id: 'user-1' })

      const result = await runProcessInvite('TESTCODE', 'plex-auth-token')

      expect(result).toEqual({ success: true })
      expect(tx.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          plexUserId: mockPlexUser.id,
          isExempt: true,
          exemptReason: 'invite',
        }),
      })
    })

    it('marks an existing non-exempt user exempt on redemption', async () => {
      tx.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        isExempt: false,
        exemptReason: null,
      })
      tx.user.update.mockResolvedValue({ id: 'user-1' })

      const result = await runProcessInvite('TESTCODE', 'plex-auth-token')

      expect(result).toEqual({ success: true })
      expect(tx.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isExempt: true, exemptReason: 'invite' }),
        })
      )
    })

    it('does not overwrite an existing exemption reason', async () => {
      tx.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        isExempt: true,
        exemptReason: 'grandfathered',
      })
      tx.user.update.mockResolvedValue({ id: 'user-1' })

      const result = await runProcessInvite('TESTCODE', 'plex-auth-token')

      expect(result).toEqual({ success: true })
      const updateData = tx.user.update.mock.calls[0][0].data
      expect(updateData).not.toHaveProperty('isExempt')
      expect(updateData).not.toHaveProperty('exemptReason')
    })

    it('marks a newly created Jellyfin user exempt', async () => {
      const jellyfinInvite = { ...mockInvite, serverType: 'JELLYFIN' }
      tx.invite.findUnique.mockResolvedValue(jellyfinInvite)
      tx.invite.update.mockResolvedValue({ ...jellyfinInvite, useCount: 1 })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(mockPrisma as any).jellyfinServer.findFirst.mockResolvedValue({
        id: 'jf-server-1',
        url: 'https://jellyfin.example.com',
        apiKey: 'jf-api-key',
        publicUrl: null,
        isActive: true,
      })
      mockCreateJellyfinUser.mockResolvedValue({ success: true, userId: 'jf-user-1' })
      mockSetJellyfinUserPolicy.mockResolvedValue({ success: true })
      tx.user.findUnique.mockResolvedValue(null)
      tx.user.create.mockResolvedValue({ id: 'user-1' })

      const result = await processJellyfinInvite('TESTCODE', {
        username: 'newuser',
        password: 'password123',
      })

      expect(result.success).toBe(true)
      expect(tx.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          jellyfinUserId: 'jf-user-1',
          isExempt: true,
          exemptReason: 'invite',
        }),
      })
    })
  })

  describe('Transaction Conflict Handling (P2034)', () => {
    beforeEach(() => {
      mockGetPlexUserInfo.mockResolvedValue({ success: true, data: mockPlexUser })
      mockPrisma.plexServer.findFirst.mockResolvedValue(mockPlexServer)
      mockInviteUserToPlexServer.mockResolvedValue({ success: true, inviteID: 12345 })
      mockAcceptPlexInvite.mockResolvedValue({ success: true })
    })

    it('should retry on transaction conflict (P2034) and succeed', async () => {
      let callCount = 0

      mockPrisma.$transaction.mockImplementation(async (fn) => {
        callCount++
        if (typeof fn === 'function') {
          if (callCount === 1) {
            // First call fails with P2034
            const error = new Prisma.PrismaClientKnownRequestError('Transaction conflict', {
              code: 'P2034',
              clientVersion: '5.0.0',
            })
            throw error
          }

          // Subsequent calls succeed
          const txClient = {
            invite: {
              findUnique: jest.fn().mockResolvedValue(mockInvite),
              update: jest.fn().mockResolvedValue({ ...mockInvite, useCount: 1 }),
            },
            user: {
              findUnique: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue({ id: 'user-1' }),
              update: jest.fn().mockResolvedValue({ id: 'user-1' }),
            },
            inviteUsage: {
              create: jest.fn().mockResolvedValue({}),
            },
          }
          return fn(txClient as Prisma.TransactionClient)
        }
        return Promise.resolve()
      })

      const result = await processInvite('TESTCODE', 'plex-auth-token')

      expect(result.success).toBe(true)
      expect(callCount).toBeGreaterThanOrEqual(2) // At least 2 attempts

      // Should log the transaction conflict
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        AuditEventType.INVITE_TRANSACTION_CONFLICT,
        'system',
        expect.objectContaining({
          inviteCode: 'TESTCODE',
          attempt: 1,
        })
      )
    })

    it('should fail after max retries on persistent transaction conflict', async () => {
      const error = new Prisma.PrismaClientKnownRequestError('Transaction conflict', {
        code: 'P2034',
        clientVersion: '5.0.0',
      })

      // Make the transaction always fail with P2034
      mockPrisma.$transaction.mockRejectedValue(error)

      const result = await processInvite('TESTCODE', 'plex-auth-token')

      expect(result.success).toBe(false)
      // The error bubbles up through the catch block
      expect(result.error).toBeDefined()
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

    it('should require admin access', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Unauthorized'))

      await expect(createInvite({})).rejects.toThrow('Unauthorized')
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

    it('should require admin access', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Unauthorized'))

      await expect(getInvites()).rejects.toThrow('Unauthorized')
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

    it('should require admin access', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Unauthorized'))

      await expect(deleteInvite('invite-123')).rejects.toThrow('Unauthorized')
    })

    it('should handle non-existent invite', async () => {
      mockPrisma.invite.delete.mockRejectedValue(new Error('Record not found'))

      const result = await deleteInvite('nonexistent')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to delete invite')
    })
  })
})
