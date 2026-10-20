/**
 * Tests for actions/invite.ts and lib/invites/ - invite validation and processing
 *
 * These tests cover:
 * - Basic invite CRUD operations
 * - Race condition prevention with atomic transactions
 * - Transaction conflict retry logic (P2034)
 * - Compensating transactions (rollback) on Plex failures
 * - Audit logging for security-sensitive events
 * - Matching Plex redemptions by plexUserId only, never by email (SEC-08)
 * - Zod validation of Jellyfin invite credentials
 * - Invite listings carry only public user fields, never plexAuthToken (SEC-18)
 */

import {
  validateInvite,
  processJellyfinInvite,
  createInvite,
  getInvites,
  getInviteDetails,
  deleteInvite,
} from '@/actions/invite'
import { requireAdmin } from '@/lib/admin'
import { redeemPlexInvite } from '@/lib/invites/plex-redemption'
import {
  getPlexUserInfo,
  inviteUserToPlexServer,
  acceptPlexInvite,
} from '@/lib/connections/plex'
import { createJellyfinUser, deleteJellyfinUser, setJellyfinUserPolicy } from '@/lib/connections/jellyfin'
import { logAuditEvent, AuditEventType } from '@/lib/security/audit-log'
import { actionClientIp, consume } from '@/lib/security/rate-limit'
import { RATE_LIMITED_MESSAGE } from '@/lib/security/rate-limit-messages'
import { Prisma } from '@/lib/generated/prisma/client'
import type { Invite, JellyfinServer, PlexServer } from '@/lib/generated/prisma/client'
import { getServerSession, type Session } from 'next-auth'
import { publicUserSelect } from '@/lib/dto/user'
import { assertNoSecretKeys } from '@/__tests__/utils/assert-no-secret-keys'
import { applyPrismaShape } from '@/__tests__/utils/prisma-shape'
import { makePrismaInviteWithUsages, INVITEE_PLEX_AUTH_TOKEN } from '@/__tests__/utils/test-builders'
import { mockReset } from 'jest-mock-extended'
import { asTransactionClient, prismaMock } from '@/__tests__/helpers/prisma-mock'
import { buildInvite } from '@/__tests__/helpers/factories'

// Mock dependencies
jest.mock('@/lib/admin', () => ({
  requireAdmin: jest.fn(),
}))

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

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

jest.mock('@/lib/security/rate-limit', () => ({
  consume: jest.fn(),
  actionClientIp: jest.fn(),
}))

const mockWarn = jest.fn()
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: (...args: unknown[]) => mockWarn(...args),
  }),
}))

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>
const mockConsume = consume as jest.MockedFunction<typeof consume>
const mockActionClientIp = actionClientIp as jest.MockedFunction<typeof actionClientIp>
const mockPrisma = prismaMock
const mockGetPlexUserInfo = getPlexUserInfo as jest.MockedFunction<typeof getPlexUserInfo>
const mockInviteUserToPlexServer = inviteUserToPlexServer as jest.MockedFunction<
  typeof inviteUserToPlexServer
>
const mockAcceptPlexInvite = acceptPlexInvite as jest.MockedFunction<typeof acceptPlexInvite>
const mockCreateJellyfinUser = createJellyfinUser as jest.MockedFunction<typeof createJellyfinUser>
const mockSetJellyfinUserPolicy = setJellyfinUserPolicy as jest.MockedFunction<
  typeof setJellyfinUserPolicy
>
const mockDeleteJellyfinUser = deleteJellyfinUser as jest.MockedFunction<typeof deleteJellyfinUser>
const mockLogAuditEvent = logAuditEvent as jest.MockedFunction<typeof logAuditEvent>
const mockGetServerSession = jest.mocked(getServerSession)

/** The Plex redemption runs inside the Plex sign-in's authorize (P4.8); the Jellyfin action takes one input object. */
const redeemPlex = (code: string, plexAuthToken: string) => redeemPlexInvite(code, plexAuthToken)
const redeemJellyfin = (code: string, credentials: { username: string; password: string }) =>
  processJellyfinInvite({ code, credentials })

describe('invite actions', () => {
  const mockSession: Session = {
    user: { id: 'admin-123', name: 'Admin', email: 'admin@test.com', isAdmin: true },
    expires: new Date(Date.now() + 86400000).toISOString(),
  }

  const mockInvite: Invite = buildInvite({
    id: 'invite-123',
    code: 'TESTCODE',
    maxUses: 1,
    useCount: 0,
    expiresAt: new Date(Date.now() + 86400000), // 1 day from now
    createdBy: 'admin-123',
    createdAt: new Date(),
    librarySectionIds: null,
    allowDownloads: false,
  })

  const mockPlexServer: PlexServer = {
    id: 'server-123',
    name: 'Test Server',
    url: 'http://localhost:32400',
    publicUrl: null,
    token: 'test-token',
    adminPlexUserId: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const jellyfinServerRow: JellyfinServer = {
    id: 'jf-server-1',
    name: 'Jellyfin',
    url: 'https://jellyfin.example.com',
    publicUrl: null,
    apiKey: 'jf-api-key',
    adminUserId: null,
    isActive: true,
    enabledForLogin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockPlexUser = {
    id: 'plex-user-123',
    username: 'testuser',
    email: 'test@example.com',
  }

  const CLIENT_IP = '203.0.113.7'
  const RATE_LIMITED_RESULT = { success: false, code: 'RATE_LIMITED', error: RATE_LIMITED_MESSAGE, retryAfterSec: 600 }

  beforeEach(() => {
    jest.clearAllMocks()
    mockRequireAdmin.mockResolvedValue(mockSession)
    mockGetServerSession.mockResolvedValue(mockSession)
    mockActionClientIp.mockResolvedValue(CLIENT_IP)
    mockConsume.mockResolvedValue({ ok: true })
  })

  /**
   * Run the Plex redemption under fake timers so the 2s Plex propagation delay
   * resolves immediately instead of slowing the suite down.
   */
  async function runProcessInvite(code: string, token: string) {
    jest.useFakeTimers()
    try {
      const promise = redeemPlex(code, token)
      await jest.runAllTimersAsync()
      return await promise
    } finally {
      jest.useRealTimers()
    }
  }

  describe('rate limits (invite:validate, invite:redeem)', () => {
    function limitTo(limited: string) {
      mockConsume.mockImplementation(async (name) =>
        name === limited ? { ok: false, retryAfterSec: 600 } : { ok: true }
      )
    }

    it('spends invite:validate for the client IP on each lookup', async () => {
      mockPrisma.invite.findUnique.mockResolvedValue(mockInvite)

      await validateInvite('TESTCODE')

      expect(mockConsume).toHaveBeenCalledWith('invite:validate', CLIENT_IP)
    })

    it('refuses a rate-limited lookup before reading the invite', async () => {
      limitTo('invite:validate')

      const result = await validateInvite('FRIENDS')

      expect(result).toEqual(RATE_LIMITED_RESULT)
      expect(mockPrisma.invite.findUnique).not.toHaveBeenCalled()
    })

    it('refuses a rate-limited Jellyfin redemption before contacting Jellyfin or consuming the invite', async () => {
      limitTo('invite:redeem')

      const result = await redeemJellyfin('TESTCODE', { username: 'newuser', password: 'password123' })

      expect(result).toEqual(RATE_LIMITED_RESULT)
      expect(mockConsume).toHaveBeenCalledWith('invite:redeem', CLIENT_IP)
      expect(mockPrisma.jellyfinServer.findFirst).not.toHaveBeenCalled()
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
      expect(mockCreateJellyfinUser).not.toHaveBeenCalled()
    })

    it.each(['A B', '../x', 'X'.repeat(65), ''])('refuses the code %p on every invite action before any lookup', async (code) => {
      await expect(validateInvite(code)).resolves.toMatchObject({ success: false, code: 'VALIDATION' })
      await expect(redeemJellyfin(code, { username: 'newuser', password: 'password123' })).resolves.toMatchObject({
        success: false,
        code: 'VALIDATION',
      })
      expect(mockPrisma.invite.findUnique).not.toHaveBeenCalled()
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    it('does not spend the redemption limit on a lookup', async () => {
      limitTo('invite:redeem')
      mockPrisma.invite.findUnique.mockResolvedValue(mockInvite)

      const result = await validateInvite('TESTCODE')

      expect(result.success).toBe(true)
    })
  })

  describe('validateInvite', () => {
    it('should return success for valid invite', async () => {
      mockPrisma.invite.findUnique.mockResolvedValue(mockInvite)

      const result = await validateInvite('TESTCODE')

      // Only what the invite page reads (SEC-56)
      expect(result).toEqual({ success: true, data: { serverType: mockInvite.serverType, expiresAt: mockInvite.expiresAt } })
      expect(result.success && Object.keys(result.data)).toEqual(['serverType', 'expiresAt'])
    })

    it('should return error for non-existent invite', async () => {
      mockPrisma.invite.findUnique.mockResolvedValue(null)

      const result = await validateInvite('INVALID')

      expect(result.success).toBe(false)
      expect(!result.success && result.error).toBe('Invalid invite code')
    })

    it('should return error for expired invite', async () => {
      const expiredInvite = {
        ...mockInvite,
        expiresAt: new Date(Date.now() - 86400000), // 1 day ago
      }
      mockPrisma.invite.findUnique.mockResolvedValue(expiredInvite)

      const result = await validateInvite('TESTCODE')

      expect(result.success).toBe(false)
      expect(!result.success && result.error).toBe('Invite has expired')
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
      expect(!result.success && result.error).toBe('Invite has reached maximum uses')
    })
  })

  describe('redeemPlexInvite - atomic transaction behavior', () => {
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
        return fn(asTransactionClient(mockTx))
      })

      const result = await redeemPlex('TESTCODE', 'plex-auth-token')

      expect(result.success).toBe(true)
      expect(mockPrisma.$transaction).toHaveBeenCalled()
      // The first transaction should be validateAndUseInvite with Serializable isolation
      expect(capturedOptions[0]?.isolationLevel).toBe('Serializable')
    })

    it('succeeds without spending another use when this Plex account already redeemed the code (P4.8)', async () => {
      mockPrisma.inviteUsage.findFirst.mockResolvedValue({ id: 'usage-1', inviteId: mockInvite.id, userId: 'user-1', usedAt: new Date() })

      const result = await redeemPlex('TESTCODE', 'plex-auth-token')

      expect(result).toEqual({ success: true, data: null })
      expect(mockPrisma.inviteUsage.findFirst).toHaveBeenCalledWith({
        where: { invite: { code: 'TESTCODE' }, user: { plexUserId: mockPlexUser.id } },
        select: { id: true },
      })
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
      expect(mockInviteUserToPlexServer).not.toHaveBeenCalled()
    })

    it('should reject invite that has already been used', async () => {
      const usedInvite = { ...mockInvite, useCount: 1 }

      mockPrisma.$transaction.mockImplementation(async (fn) => {
        const mockTx = {
          invite: {
            findUnique: jest.fn().mockResolvedValue(usedInvite),
          },
        }
        return fn(asTransactionClient(mockTx))
      })

      const result = await redeemPlex('TESTCODE', 'plex-auth-token')

      expect(result.success).toBe(false)
      expect(!result.success && result.error).toBe('Invite has reached maximum uses')
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
        return fn(asTransactionClient(mockTx))
      })

      const result = await redeemPlex('TESTCODE', 'plex-auth-token')

      expect(result.success).toBe(false)
      expect(!result.success && result.error).toBe('Invite has expired')
    })

    it('should fail if Plex user info cannot be retrieved', async () => {
      mockGetPlexUserInfo.mockResolvedValue({
        success: false,
        error: 'Invalid token',
      })

      const result = await redeemPlex('TESTCODE', 'invalid-token')

      expect(result).toMatchObject({ success: false, code: 'UPSTREAM_UNAVAILABLE' })
      expect(JSON.stringify(result)).not.toContain('Invalid token')
      // Transaction should not be called since we fail early
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    it('should fail if no active Plex server configured', async () => {
      mockPrisma.plexServer.findFirst.mockResolvedValue(null)

      const result = await redeemPlex('TESTCODE', 'plex-auth-token')

      expect(result.success).toBe(false)
      expect(!result.success && result.error).toBe('No active Plex server configured')
      // Transaction should not be called since we fail early
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })
  })

  describe('redeemPlexInvite - rollback and audit logging', () => {
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
          return fn(asTransactionClient(txClient))
        }
        return Promise.resolve()
      })
    })

    it('should process invite successfully and log audit event', async () => {
      mockInviteUserToPlexServer.mockResolvedValue({ success: true, inviteID: 12345 })

      const result = await redeemPlex('TESTCODE', 'plex-auth-token')

      expect(result.success).toBe(true)
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        AuditEventType.INVITE_CONSUMED,
        'system',
        expect.objectContaining({
          inviteId: 'invite-123',
          inviteCodePrefix: 'TE',
        })
      )
    })

    it('should rollback invite when Plex invite fails', async () => {
      mockInviteUserToPlexServer.mockResolvedValue({
        success: false,
        error: 'Plex server unavailable',
      })

      const result = await redeemPlex('TESTCODE', 'plex-auth-token')

      // The upstream reason goes to the audit log, never to the caller (SEC-20)
      expect(result).toEqual({ success: false, code: 'UPSTREAM_UNAVAILABLE', error: "We couldn't finish setting up your access. Please try again or ask the server owner." })

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

      const result = await redeemPlex('TESTCODE', 'plex-auth-token')

      expect(result).toEqual({ success: false, code: 'UPSTREAM_UNAVAILABLE', error: "We couldn't finish setting up your access. Please try again or ask the server owner." })

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

      expect(result).toEqual({ success: true, data: null })
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

      expect(result).toEqual({ success: true, data: null })
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

      expect(result).toEqual({ success: true, data: null })
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

      const result = await redeemJellyfin('TESTCODE', {
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

  describe('Plex redemption never links by email (SEC-08)', () => {
    const tx = {
      invite: { findUnique: jest.fn(), update: jest.fn() },
      user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      inviteUsage: { create: jest.fn() },
    }

    const victim = { id: 'plex-victim', username: 'victim', email: 'victim@example.com' }

    /** A row created by the old Jellyfin sign-in, which stored the username as its email. */
    const preClaimedRow = {
      id: 'jellyfin-row',
      email: 'victim@example.com',
      jellyfinUserId: 'jf-eve',
      plexUserId: null,
      isExempt: false,
    }

    /** The P2002 that the pg driver adapter raises for a duplicate value. */
    function uniqueViolation(constraint: { index: string } | { fields: string[] }) {
      return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.10.1',
        meta: {
          modelName: 'User',
          driverAdapterError: {
            name: 'DriverAdapterError',
            cause: { originalCode: '23505', kind: 'UniqueConstraintViolation', constraint, table: 'User' },
          },
        },
      })
    }

    function lookedUpByEmail() {
      return tx.user.findUnique.mock.calls.some(
        ([args]: [{ where: Record<string, unknown> }]) => 'email' in args.where
      )
    }

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation(async (fn) =>
        typeof fn === 'function' ? fn(tx as unknown as Prisma.TransactionClient) : Promise.resolve()
      )
      mockGetPlexUserInfo.mockResolvedValue({ success: true, data: victim })
      mockPrisma.plexServer.findFirst.mockResolvedValue(mockPlexServer)
      mockInviteUserToPlexServer.mockResolvedValue({ success: true, inviteID: 12345 })
      mockAcceptPlexInvite.mockResolvedValue({ success: true })
      tx.invite.findUnique.mockResolvedValue(mockInvite)
      tx.invite.update.mockResolvedValue({ ...mockInvite, useCount: 1 })
      tx.inviteUsage.create.mockResolvedValue({})
      tx.user.findUnique.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
        where.email === preClaimedRow.email ? preClaimedRow : null
      )
    })

    it('creates a separate row while a Jellyfin row holds the same email', async () => {
      tx.user.create.mockResolvedValue({ id: 'victim-row' })

      const result = await runProcessInvite('TESTCODE', 'plex-auth-token')

      expect(result).toEqual({ success: true, data: null })
      expect(tx.user.findUnique).toHaveBeenCalledWith({ where: { plexUserId: 'plex-victim' } })
      expect(lookedUpByEmail()).toBe(false)
      expect(tx.user.update).not.toHaveBeenCalled()
      expect(tx.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ plexUserId: 'plex-victim', email: 'victim@example.com' }),
      })
      expect(tx.inviteUsage.create).toHaveBeenCalledWith({
        data: { inviteId: 'invite-123', userId: 'victim-row' },
      })
    })

    it.each([
      ['the constraint name', { index: 'User_email_key' }],
      ['the column', { fields: ['email'] }],
    ])('retries once with email: null when the create conflicts on email (reported by %s)', async (_label, constraint) => {
      tx.user.create
        .mockRejectedValueOnce(uniqueViolation(constraint))
        .mockResolvedValueOnce({ id: 'victim-row' })
      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: preClaimedRow.id })

      const result = await runProcessInvite('TESTCODE', 'plex-auth-token')

      expect(result).toEqual({ success: true, data: null })
      expect(tx.user.create).toHaveBeenCalledTimes(2)
      expect(tx.user.create.mock.calls[1][0].data).toMatchObject({
        plexUserId: 'plex-victim',
        email: null,
        emailVerified: null,
      })
      // Claiming the invite, the failed write and the retry each get a transaction.
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3)
      expect(tx.inviteUsage.create).toHaveBeenCalledTimes(1)
      expect(tx.inviteUsage.create).toHaveBeenCalledWith({
        data: { inviteId: 'invite-123', userId: 'victim-row' },
      })
      expect(mockWarn).toHaveBeenCalledWith('invite.email_conflict', {
        existingUserId: 'jellyfin-row',
        plexUserId: 'plex-victim',
      })
      expect(mockLogAuditEvent).not.toHaveBeenCalledWith(
        AuditEventType.INVITE_ROLLBACK,
        expect.anything(),
        expect.anything()
      )
    })

    it("keeps an existing Plex row's email when updating it to the new address conflicts", async () => {
      tx.user.findUnique.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
        where.plexUserId === 'plex-victim' ? { id: 'victim-row', isExempt: true } : null
      )
      tx.user.update
        .mockRejectedValueOnce(uniqueViolation({ index: 'User_email_key' }))
        .mockResolvedValueOnce({ id: 'victim-row' })
      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: preClaimedRow.id })

      const result = await runProcessInvite('TESTCODE', 'plex-auth-token')

      expect(result).toEqual({ success: true, data: null })
      expect(tx.user.update.mock.calls[0][0].data).toMatchObject({ email: 'victim@example.com' })
      const retryData = tx.user.update.mock.calls[1][0].data
      expect(retryData).not.toHaveProperty('email')
      expect(retryData).not.toHaveProperty('emailVerified')
      expect(tx.user.create).not.toHaveBeenCalled()
    })

    it('does not retry a conflict on another unique column', async () => {
      tx.user.create.mockRejectedValue(uniqueViolation({ index: 'User_plexUserId_key' }))

      const result = await runProcessInvite('TESTCODE', 'plex-auth-token')

      expect(result.success).toBe(false)
      expect(tx.user.create).toHaveBeenCalledTimes(1)
      expect(mockWarn).not.toHaveBeenCalledWith('invite.email_conflict', expect.anything())
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        AuditEventType.INVITE_ROLLBACK,
        'system',
        expect.objectContaining({ inviteId: 'invite-123' })
      )
    })
  })

  describe('processJellyfinInvite - credential validation', () => {
    const tx = {
      invite: { findUnique: jest.fn(), update: jest.fn() },
      user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      inviteUsage: { create: jest.fn() },
    }
    const jellyfinInvite = { ...mockInvite, serverType: 'JELLYFIN' }

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation(async (fn) =>
        typeof fn === 'function' ? fn(tx as unknown as Prisma.TransactionClient) : Promise.resolve()
      )
      ;(mockPrisma.jellyfinServer.findFirst as jest.Mock).mockResolvedValue({
        id: 'jf-server-1',
        url: 'https://jellyfin.example.com',
        apiKey: 'jf-api-key',
        publicUrl: null,
        isActive: true,
      })
      tx.invite.findUnique.mockResolvedValue(jellyfinInvite)
      tx.invite.update.mockResolvedValue({ ...jellyfinInvite, useCount: 1 })
      tx.user.findUnique.mockResolvedValue(null)
      tx.user.create.mockResolvedValue({ id: 'user-1' })
      tx.inviteUsage.create.mockResolvedValue({})
      mockCreateJellyfinUser.mockResolvedValue({ success: true, userId: 'jf-user-1' })
      mockSetJellyfinUserPolicy.mockResolvedValue({ success: true })
    })

    it.each(['a@b.com', 'ab', 'has space', 'a'.repeat(33)])(
      'rejects the username %p without consuming the invite',
      async (username) => {
        const result = await redeemJellyfin('TESTCODE', { username, password: 'password123' })

        expect(result).toMatchObject({
          success: false,
          code: 'VALIDATION',
          error: 'Username must be 3 to 32 characters: letters, numbers, dots, dashes or underscores',
        })
        expect(mockPrisma.jellyfinServer.findFirst).not.toHaveBeenCalled()
        expect(mockPrisma.$transaction).not.toHaveBeenCalled()
        expect(mockCreateJellyfinUser).not.toHaveBeenCalled()
      }
    )

    it.each([
      ['shorter than 8 characters', 'short12', 'Password must be at least 8 characters'],
      ['longer than 256 characters', 'p'.repeat(257), 'Password must be at most 256 characters'],
    ])('rejects a password %s without consuming the invite', async (_label, password, error) => {
      const result = await redeemJellyfin('TESTCODE', { username: 'jane.doe-2', password })

      expect(result).toMatchObject({ success: false, code: 'VALIDATION', error })
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
      expect(mockCreateJellyfinUser).not.toHaveBeenCalled()
    })

    it('accepts jane.doe-2 and creates the account under the trimmed name', async () => {
      const result = await redeemJellyfin('TESTCODE', {
        username: '  jane.doe-2 ',
        password: 'password123',
      })

      expect(result).toEqual({
        success: true,
        // publicUrl is unset, and the internal URL never goes to the member
        data: { jellyfinUserId: 'jf-user-1', username: 'jane.doe-2', serverUrl: null },
      })
      expect(mockCreateJellyfinUser).toHaveBeenCalledWith(
        { url: 'https://jellyfin.example.com', apiKey: 'jf-api-key' },
        'jane.doe-2',
        'password123'
      )
      expect(tx.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: 'jane.doe-2', jellyfinUserId: 'jf-user-1' }),
      })
    })
  })

  describe('an invite redeems only through its own service (SEC-29)', () => {
    const tx = {
      invite: { findUnique: jest.fn(), update: jest.fn() },
      user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      inviteUsage: { create: jest.fn() },
    }

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation(async (fn) =>
        typeof fn === 'function' ? fn(asTransactionClient(tx)) : Promise.resolve()
      )
      mockGetPlexUserInfo.mockResolvedValue({ success: true, data: mockPlexUser })
      mockPrisma.plexServer.findFirst.mockResolvedValue(mockPlexServer)
      mockPrisma.jellyfinServer.findFirst.mockResolvedValue(jellyfinServerRow)
    })

    it('refuses a Jellyfin code on the Plex path before consuming it, sharing or exempting', async () => {
      tx.invite.findUnique.mockResolvedValue({ ...mockInvite, serverType: 'JELLYFIN' })

      const result = await redeemPlex('TESTCODE', 'plex-auth-token')

      expect(result).toEqual({
        success: false,
        code: 'INVITE_WRONG_SERVICE',
        error: 'This invite is for Jellyfin',
      })
      expect(tx.invite.update).not.toHaveBeenCalled()
      expect(mockPrisma.invite.updateMany).not.toHaveBeenCalled()
      expect(mockInviteUserToPlexServer).not.toHaveBeenCalled()
      expect(mockAcceptPlexInvite).not.toHaveBeenCalled()
      expect(tx.user.create).not.toHaveBeenCalled()
      expect(tx.user.update).not.toHaveBeenCalled()
    })

    it('refuses a Plex code on the Jellyfin path before consuming it or creating an account', async () => {
      tx.invite.findUnique.mockResolvedValue(mockInvite)

      const result = await redeemJellyfin('TESTCODE', { username: 'newuser', password: 'password123' })

      expect(result).toEqual({
        success: false,
        code: 'INVITE_WRONG_SERVICE',
        error: 'This invite is for Plex',
      })
      expect(tx.invite.update).not.toHaveBeenCalled()
      expect(mockPrisma.invite.updateMany).not.toHaveBeenCalled()
      expect(mockCreateJellyfinUser).not.toHaveBeenCalled()
      expect(tx.user.create).not.toHaveBeenCalled()
    })

    it('reports an unknown code as INVITE_INVALID', async () => {
      tx.invite.findUnique.mockResolvedValue(null)

      const result = await redeemPlex('NOPE', 'plex-auth-token')

      expect(result).toEqual({ success: false, code: 'INVITE_INVALID', error: 'Invalid invite code' })
    })
  })

  describe('processJellyfinInvite compensation (GAP-28)', () => {
    const LIB_A = 'f137a2dd21bbc1b99aa5c0f6bf02a805'
    const GENERIC_ERROR = 'Your account could not be created. Please try again.'
    const tx = {
      invite: { findUnique: jest.fn(), update: jest.fn() },
      user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      inviteUsage: { create: jest.fn() },
    }
    const credentials = { username: 'newuser', password: 'password123' }

    function serveInvite(jellyfinLibraryIds: string | null = JSON.stringify([LIB_A])) {
      const invite = { ...mockInvite, serverType: 'JELLYFIN' as const, jellyfinLibraryIds }
      tx.invite.findUnique.mockResolvedValue(invite)
      tx.invite.update.mockResolvedValue({ ...invite, useCount: 1 })
    }

    function expectInviteRestored() {
      expect(mockPrisma.invite.updateMany).toHaveBeenCalledWith({
        where: { id: 'invite-123', useCount: { gt: 0 } },
        data: { useCount: { decrement: 1 } },
      })
    }

    function auditCalls(type: string) {
      return mockLogAuditEvent.mock.calls.filter(([event]) => event === type).map(([, , details]) => details)
    }

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation(async (fn) =>
        typeof fn === 'function' ? fn(asTransactionClient(tx)) : Promise.resolve()
      )
      mockPrisma.jellyfinServer.findFirst.mockResolvedValue(jellyfinServerRow)
      serveInvite()
      tx.user.findUnique.mockResolvedValue(null)
      tx.user.create.mockResolvedValue({ id: 'user-1' })
      tx.inviteUsage.create.mockResolvedValue({})
      mockCreateJellyfinUser.mockResolvedValue({ success: true, userId: 'jf-user-1' })
      mockSetJellyfinUserPolicy.mockResolvedValue({ success: true })
      mockDeleteJellyfinUser.mockResolvedValue({ success: true })
    })

    it('applies the libraries disabled, records the member, and enables the account last', async () => {
      const result = await redeemJellyfin('TESTCODE', credentials)

      expect(result.success).toBe(true)
      expect(mockSetJellyfinUserPolicy).toHaveBeenCalledTimes(2)
      expect(mockSetJellyfinUserPolicy.mock.calls[0][2]).toEqual({
        libraryIds: [LIB_A],
        allowDownloads: false,
        enableRemoteAccess: true,
        isDisabled: true,
      })
      expect(mockSetJellyfinUserPolicy.mock.calls[1][2]).toMatchObject({ libraryIds: [LIB_A], isDisabled: false })

      const [disableOrder, enableOrder] = mockSetJellyfinUserPolicy.mock.invocationCallOrder
      const recordOrder = tx.inviteUsage.create.mock.invocationCallOrder[0]
      expect(mockCreateJellyfinUser.mock.invocationCallOrder[0]).toBeLessThan(disableOrder)
      expect(disableOrder).toBeLessThan(recordOrder)
      expect(recordOrder).toBeLessThan(enableOrder)
      expect(mockDeleteJellyfinUser).not.toHaveBeenCalled()
      expect(mockPrisma.invite.updateMany).not.toHaveBeenCalled()
    })

    it('disables, then deletes the account and restores the invite when the database write fails', async () => {
      tx.user.create.mockRejectedValue(new Error('relation "User" does not exist'))

      const result = await redeemJellyfin('TESTCODE', credentials)

      expect(result).toEqual({ success: false, code: 'INTERNAL', error: GENERIC_ERROR })
      expect(mockSetJellyfinUserPolicy).toHaveBeenCalledTimes(1)
      expect(mockSetJellyfinUserPolicy.mock.calls[0][2]).toMatchObject({ isDisabled: true })
      expect(mockDeleteJellyfinUser).toHaveBeenCalledWith(
        { url: jellyfinServerRow.url, apiKey: jellyfinServerRow.apiKey },
        'jf-user-1'
      )
      expect(mockSetJellyfinUserPolicy.mock.invocationCallOrder[0]).toBeLessThan(
        mockDeleteJellyfinUser.mock.invocationCallOrder[0]
      )
      expectInviteRestored()
      expect(auditCalls(AuditEventType.INVITE_ROLLBACK_FAILED)).toEqual([])
    })

    it('restores the invite when the delete fails but the account is already disabled', async () => {
      tx.user.create.mockRejectedValue(new Error('db down'))
      mockDeleteJellyfinUser.mockResolvedValue({ success: false, error: 'Failed to delete user' })

      const result = await redeemJellyfin('TESTCODE', credentials)

      expect(result).toEqual({ success: false, code: 'INTERNAL', error: GENERIC_ERROR })
      // Only the step-2 disable: the account is already confirmed disabled
      expect(mockSetJellyfinUserPolicy).toHaveBeenCalledTimes(1)
      expectInviteRestored()
      expect(auditCalls(AuditEventType.INVITE_JELLYFIN_FAILURE)).toContainEqual(
        expect.objectContaining({ stage: 'compensate', jellyfinUserId: 'jf-user-1' })
      )
    })

    it('keeps the invite consumed and audits the Jellyfin id when deleting and disabling both fail', async () => {
      mockSetJellyfinUserPolicy.mockResolvedValue({ success: false, error: 'Failed to set user permissions' })
      mockDeleteJellyfinUser.mockResolvedValue({ success: false, error: 'Failed to delete user' })

      const result = await redeemJellyfin('TESTCODE', credentials)

      expect(result).toEqual({ success: false, code: 'INTERNAL', error: GENERIC_ERROR })
      expect(mockDeleteJellyfinUser).toHaveBeenCalledTimes(1)
      // The step-2 policy call, then the compensating disable
      expect(mockSetJellyfinUserPolicy).toHaveBeenCalledTimes(2)
      expect(mockSetJellyfinUserPolicy.mock.calls[1][2]).toMatchObject({ isDisabled: true })
      expect(mockPrisma.invite.updateMany).not.toHaveBeenCalled()
      expect(auditCalls(AuditEventType.INVITE_ROLLBACK_FAILED)).toEqual([
        expect.objectContaining({ inviteId: 'invite-123', jellyfinUserId: 'jf-user-1' }),
      ])
      expect(tx.user.create).not.toHaveBeenCalled()
    })

    it('restores the invite when the policy fails but the delete succeeds', async () => {
      mockSetJellyfinUserPolicy.mockResolvedValue({ success: false, error: 'Failed to set user permissions: Bad Request' })

      const result = await redeemJellyfin('TESTCODE', credentials)

      expect(result).toEqual({ success: false, code: 'INTERNAL', error: GENERIC_ERROR })
      expect(mockDeleteJellyfinUser).toHaveBeenCalledTimes(1)
      expectInviteRestored()
    })

    it('compensates an account left behind by an unexpected throw', async () => {
      mockSetJellyfinUserPolicy.mockRejectedValue(new Error('socket hang up at 10.0.0.5'))

      const result = await redeemJellyfin('TESTCODE', credentials)

      expect(result).toEqual({ success: false, code: 'INTERNAL', error: GENERIC_ERROR })
      expect(mockDeleteJellyfinUser).toHaveBeenCalledWith(expect.anything(), 'jf-user-1')
      expectInviteRestored()
    })

    it.each([
      ['not JSON', 'not json'],
      ['not 32-hex ids', JSON.stringify(['../../Users'])],
      ['not an array', JSON.stringify({ id: LIB_A })],
    ])('creates no account and restores the invite when the library ids are %s', async (_label, raw) => {
      serveInvite(raw)

      const result = await redeemJellyfin('TESTCODE', credentials)

      expect(result).toEqual({ success: false, code: 'INTERNAL', error: GENERIC_ERROR })
      expect(mockCreateJellyfinUser).not.toHaveBeenCalled()
      expectInviteRestored()
    })

    it('leaves a recorded account disabled and asks for the owner when enabling fails', async () => {
      mockSetJellyfinUserPolicy
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, error: 'Failed to set user permissions' })

      const result = await redeemJellyfin('TESTCODE', credentials)

      expect(result).toEqual({
        success: false,
        code: 'INTERNAL',
        error: 'Your account was created. Ask the server owner to enable it.',
      })
      expect(tx.inviteUsage.create).toHaveBeenCalled()
      expect(mockDeleteJellyfinUser).not.toHaveBeenCalled()
      expect(mockPrisma.invite.updateMany).not.toHaveBeenCalled()
      expect(auditCalls(AuditEventType.INVITE_JELLYFIN_FAILURE)).toContainEqual(
        expect.objectContaining({ stage: 'enable', jellyfinUserId: 'jf-user-1' })
      )
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
          return fn(asTransactionClient(txClient))
        }
        return Promise.resolve()
      })

      const result = await redeemPlex('TESTCODE', 'plex-auth-token')

      expect(result.success).toBe(true)
      expect(callCount).toBeGreaterThanOrEqual(2) // At least 2 attempts

      // Should log the transaction conflict
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        AuditEventType.INVITE_TRANSACTION_CONFLICT,
        'system',
        expect.objectContaining({
          inviteCodePrefix: 'TE',
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

      const result = await redeemPlex('TESTCODE', 'plex-auth-token')

      expect(result.success).toBe(false)
      // The error bubbles up through the catch block
      expect(!result.success && result.error).toBeDefined()
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
      expect(!result.success && result.error).toBe('Invite code already exists')
    })

    it('should require admin access', async () => {
      mockGetServerSession.mockResolvedValue({ ...mockSession, user: { ...mockSession.user, isAdmin: false } })

      await expect(createInvite({})).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' })
      expect(mockPrisma.invite.create).not.toHaveBeenCalled()
    })

    it.each([
      ['a custom code with symbols', { code: 'AB&CD=1' }],
      ['a custom code that is too short', { code: 'ABC' }],
      ['an ambiguous character', { code: 'ABCDE0' }],
      ['zero uses', { maxUses: 0 }],
      ['too many uses', { maxUses: 1001 }],
      ['fractional uses', { maxUses: 1.5 }],
      ['an unknown expiry', { expiresIn: '999y' }],
      ['an unknown server type', { serverType: 'EMBY' }],
      ['more than 100 libraries', { librarySectionIds: Array.from({ length: 101 }, (_, i) => i) }],
      ['a library id that is not an integer', { librarySectionIds: [1.5] }],
    ])('refuses %s (SEC-56)', async (_label, input) => {
      const result = await createInvite(input as Parameters<typeof createInvite>[0])

      expect(result).toMatchObject({ success: false, code: 'VALIDATION' })
      expect(mockPrisma.invite.create).not.toHaveBeenCalled()
    })

    it.each([
      ['a generated code', {}],
      ['an upper-cased custom code', { code: ' friends2 ' }],
      ['every expiry option', { expiresIn: 'never', maxUses: 1000 }],
    ])('accepts %s', async (_label, input) => {
      mockPrisma.invite.findUnique.mockResolvedValue(null)
      mockPrisma.invite.create.mockResolvedValue(mockInvite)

      const result = await createInvite(input as Parameters<typeof createInvite>[0])

      expect(result.success).toBe(true)
    })
  })

  describe('getInvites', () => {
    it('should return all invites for admin', async () => {
      const invites = [mockInvite, { ...mockInvite, id: 'invite-456', code: 'OTHER' }]
      mockPrisma.invite.findMany.mockResolvedValue(invites)

      const result = await getInvites()

      expect(result.success).toBe(true)
      if (!result.success) throw new Error(result.error)
      expect(result.data).toEqual(invites)
    })

    it('should require admin access', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Unauthorized'))

      await expect(getInvites()).rejects.toThrow('Unauthorized')
    })
  })

  describe('invite queries send only public user fields (SEC-18)', () => {
    const publicUsagesInclude = { usages: { include: { user: { select: publicUserSelect } } } }

    /** Answer each query by applying its own select/include to rows holding plexAuthToken. */
    function serveInviteRowsWithSecrets() {
      const rows = [makePrismaInviteWithUsages(), makePrismaInviteWithUsages({ id: 'invite-2', code: 'OTHER' })]
      mockPrisma.invite.findMany.mockImplementation(((args: Parameters<typeof applyPrismaShape>[1]) =>
        Promise.resolve(rows.map((row) => applyPrismaShape(row, args)))) as never)
      mockPrisma.invite.findUnique.mockImplementation(((args: Parameters<typeof applyPrismaShape>[1]) =>
        Promise.resolve(applyPrismaShape(rows[0], args))) as never)
    }

    function expectNoSecrets(result: unknown) {
      const serialised = JSON.stringify(result)
      expect(serialised).not.toContain('plexAuthToken')
      expect(serialised).not.toContain(INVITEE_PLEX_AUTH_TOKEN)
      assertNoSecretKeys(JSON.parse(serialised))
    }

    it('getInvites selects publicUserSelect for usages.user', async () => {
      serveInviteRowsWithSecrets()

      await getInvites()

      expect(mockPrisma.invite.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        include: publicUsagesInclude,
      })
    })

    it('getInviteDetails selects publicUserSelect for usages.user and keeps the usage order', async () => {
      serveInviteRowsWithSecrets()

      await getInviteDetails('invite-1')

      expect(mockPrisma.invite.findUnique).toHaveBeenCalledWith({
        where: { id: 'invite-1' },
        include: {
          usages: { include: { user: { select: publicUserSelect } }, orderBy: { usedAt: 'desc' } },
        },
      })
    })

    it('getInvites returns no token field and only id, name, email and image per user', async () => {
      serveInviteRowsWithSecrets()

      const result = await getInvites()

      expect(result.success).toBe(true)
      expectNoSecrets(result)
      if (!result.success) throw new Error(result.error)
      expect(result.data).toHaveLength(2)
      expect(result.data[0].usages[0].user).toEqual({
        id: 'user-1',
        name: 'Invited Member',
        email: 'member@example.com',
        image: 'https://plex.tv/users/member/avatar',
      })
    })

    it('getInviteDetails returns no token field and only id, name, email and image per user', async () => {
      serveInviteRowsWithSecrets()

      const result = await getInviteDetails('invite-1')

      expect(result.success).toBe(true)
      expectNoSecrets(result)
      if (!result.success) throw new Error(result.error)
      expect(Object.keys(result.data.usages[0].user).sort()).toEqual(['email', 'id', 'image', 'name'])
    })

    it('getInviteDetails reports a missing invite', async () => {
      mockPrisma.invite.findUnique.mockResolvedValue(null)

      await expect(getInviteDetails('missing')).resolves.toEqual({ success: false, error: 'Invite not found' })
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
      expect(!result.success && result.error).toBe('Failed to delete invite')
    })
  })
})
