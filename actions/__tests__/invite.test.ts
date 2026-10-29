/**
 * Tests for actions/invite.ts and lib/invites/ - invite validation and processing
 *
 * These tests cover:
 * - Jellyfin redemption through processJellyfinInvite
 * - Race condition prevention with atomic transactions
 * - Transaction conflict retry logic (P2034)
 * - Compensating transactions (rollback) on Plex failures
 * - Audit logging for security-sensitive events
 * - Matching Plex redemptions by plexUserId only, never by email (SEC-08)
 * - Zod validation of Jellyfin invite credentials
 */

import { processJellyfinInvite, redeemJellyfinInviteForm } from '@/actions/invite'
import { idleFormState } from '@/lib/actions/form-state'
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
import { mockReset } from 'jest-mock-extended'
import { asTransactionClient, prismaMock } from '@/__tests__/helpers/prisma-mock'
import { buildInvite, buildUser } from '@/__tests__/helpers/factories'
import { screenAffiliateRedeemer } from '@/lib/affiliates/redemption-gate'

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
    AFFILIATE_REDEMPTION_REFUSED: 'AFFILIATE_REDEMPTION_REFUSED',
  },
}))

jest.mock('@/lib/affiliates/redemption-gate', () => ({
  ...jest.requireActual('@/lib/affiliates/redemption-gate'),
  screenAffiliateRedeemer: jest.fn(),
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
    machineIdentifier: null,
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

  describe('rate limits (invite:redeem)', () => {
    function limitTo(limited: string) {
      mockConsume.mockImplementation(async (name) =>
        name === limited ? { ok: false, retryAfterSec: 600 } : { ok: true }
      )
    }

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
      await expect(redeemJellyfin(code, { username: 'newuser', password: 'password123' })).resolves.toMatchObject({
        success: false,
        code: 'VALIDATION',
      })
      expect(mockPrisma.invite.findUnique).not.toHaveBeenCalled()
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
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

    it('refuses a disabled account before it spends a use, shares the server or sets an exemption', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(buildUser({ plexUserId: mockPlexUser.id, disabledAt: new Date() }))

      const result = await redeemPlex('TESTCODE', 'plex-token')

      expect(result).toEqual({ success: false, code: 'FORBIDDEN', error: 'This account is disabled.' })
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
      expect(mockInviteUserToPlexServer).not.toHaveBeenCalled()
      expect(mockAcceptPlexInvite).not.toHaveBeenCalled()
      expect(mockPrisma.user.update).not.toHaveBeenCalled()
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

  describe('redeemPlexInvite - record, share, rollback and audit logging', () => {
    const PLEX_REDEEM_FAILED = "We couldn't finish setting up your access. Please try again or ask the server owner."

    // One transaction client for every prisma.$transaction callback, so the record and its undo can be asserted on
    const tx = {
      invite: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      inviteUsage: { create: jest.fn(), delete: jest.fn() },
      config: { findUnique: jest.fn() },
      plexServer: { findFirst: jest.fn() },
      affiliateApplication: { findUnique: jest.fn() },
    }

    const auditedWith = (type: AuditEventType) =>
      mockLogAuditEvent.mock.calls.filter(([event]) => event === type).map(([, , details]) => details)

    beforeEach(() => {
      mockGetPlexUserInfo.mockResolvedValue({ success: true, data: mockPlexUser })
      mockPrisma.plexServer.findFirst.mockResolvedValue(mockPlexServer)
      mockInviteUserToPlexServer.mockResolvedValue({ success: true, inviteID: 12345 })
      mockAcceptPlexInvite.mockResolvedValue({ success: true })
      mockPrisma.$transaction.mockImplementation(async (fn) =>
        typeof fn === 'function' ? fn(asTransactionClient(tx)) : Promise.resolve()
      )
      tx.invite.findUnique.mockResolvedValue(mockInvite)
      tx.invite.update.mockResolvedValue({ ...mockInvite, useCount: 1 })
      tx.user.findUnique.mockResolvedValue(null)
      tx.user.create.mockResolvedValue({ id: 'user-1' })
      tx.user.update.mockResolvedValue({ id: 'user-1' })
      tx.user.delete.mockResolvedValue({ id: 'user-1' })
      tx.inviteUsage.create.mockResolvedValue({ id: 'usage-1' })
      tx.inviteUsage.delete.mockResolvedValue({ id: 'usage-1' })
    })

    it('should process invite successfully and log audit event', async () => {
      const result = await runProcessInvite('TESTCODE', 'plex-auth-token')

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

    it('records the member and the use before it shares the server', async () => {
      const result = await runProcessInvite('TESTCODE', 'plex-auth-token')

      expect(result).toEqual({ success: true, data: null })
      expect(tx.inviteUsage.create).toHaveBeenCalledWith({
        data: { inviteId: 'invite-123', userId: 'user-1' },
        select: { id: true },
      })
      expect(tx.inviteUsage.create.mock.invocationCallOrder[0]).toBeLessThan(
        mockInviteUserToPlexServer.mock.invocationCallOrder[0]!
      )
    })

    it('shares nothing and restores the use when the record fails', async () => {
      tx.inviteUsage.create.mockRejectedValueOnce(new Error('write failed'))

      const result = await runProcessInvite('TESTCODE', 'plex-auth-token')

      expect(result).toEqual({ success: false, code: 'INTERNAL', error: PLEX_REDEEM_FAILED })
      expect(mockInviteUserToPlexServer).not.toHaveBeenCalled()
      expect(auditedWith(AuditEventType.INVITE_PLEX_FAILURE)).toEqual([
        expect.objectContaining({ stage: 'record_usage' }),
      ])
      expect(auditedWith(AuditEventType.INVITE_ROLLBACK)).toEqual([expect.objectContaining({ inviteId: 'invite-123' })])
    })

    it('deletes the row it created and restores the use when the share fails', async () => {
      mockInviteUserToPlexServer.mockResolvedValue({ success: false, error: 'Plex server unavailable' })

      const result = await runProcessInvite('TESTCODE', 'plex-auth-token')

      // The upstream reason goes to the audit log, never to the caller (SEC-20)
      expect(result).toEqual({ success: false, code: 'UPSTREAM_UNAVAILABLE', error: PLEX_REDEEM_FAILED })
      expect(auditedWith(AuditEventType.INVITE_PLEX_FAILURE)).toEqual([
        expect.objectContaining({ stage: 'invite_to_server' }),
      ])
      expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } })
      expect(mockPrisma.invite.updateMany).toHaveBeenCalledWith({
        where: { id: 'invite-123', useCount: { gt: 0 } },
        data: { useCount: { decrement: 1 }, joinedAt: null, joinedUserId: null },
      })
      expect(auditedWith(AuditEventType.INVITE_ROLLBACK)).toEqual([
        expect.objectContaining({ inviteId: 'invite-123', reason: 'Plex server unavailable' }),
      ])
      expect(mockAcceptPlexInvite).not.toHaveBeenCalled()
    })

    it('removes the use and the exemption it set on an existing row when the share fails', async () => {
      tx.user.findUnique.mockResolvedValue({ id: 'user-1', isExempt: false })
      mockInviteUserToPlexServer.mockResolvedValue({ success: false, error: 'Plex server unavailable' })

      await runProcessInvite('TESTCODE', 'plex-auth-token')

      expect(tx.user.delete).not.toHaveBeenCalled()
      expect(tx.inviteUsage.delete).toHaveBeenCalledWith({ where: { id: 'usage-1' } })
      expect(tx.user.update).toHaveBeenLastCalledWith({
        where: { id: 'user-1' },
        data: { isExempt: false, exemptNote: null },
      })
      expect(auditedWith(AuditEventType.INVITE_ROLLBACK)).toHaveLength(1)
    })

    it('keeps an exemption the row already had when the share fails', async () => {
      tx.user.findUnique.mockResolvedValue({ id: 'user-1', isExempt: true })
      mockInviteUserToPlexServer.mockResolvedValue({ success: false, error: 'Plex server unavailable' })

      await runProcessInvite('TESTCODE', 'plex-auth-token')

      expect(tx.inviteUsage.delete).toHaveBeenCalledWith({ where: { id: 'usage-1' } })
      expect(tx.user.update).toHaveBeenCalledTimes(1)
      expect(tx.user.update.mock.calls[0][0].data).not.toHaveProperty('isExempt')
    })

    it('keeps the use counted and audits the row when the undo fails', async () => {
      mockInviteUserToPlexServer.mockResolvedValue({ success: false, error: 'Plex server unavailable' })
      tx.user.delete.mockRejectedValueOnce(new Error('database unavailable'))

      const result = await runProcessInvite('TESTCODE', 'plex-auth-token')

      expect(result).toMatchObject({ success: false, code: 'UPSTREAM_UNAVAILABLE' })
      expect(auditedWith(AuditEventType.INVITE_ROLLBACK_FAILED)).toEqual([
        expect.objectContaining({ inviteId: 'invite-123', userId: 'user-1', stage: 'undo_record' }),
      ])
      expect(mockPrisma.invite.updateMany).not.toHaveBeenCalled()
      expect(auditedWith(AuditEventType.INVITE_ROLLBACK)).toEqual([])
    })

    it('keeps the redemption when the accept fails, since the share exists', async () => {
      mockAcceptPlexInvite.mockRejectedValue(new Error('Accept failed'))

      const result = await runProcessInvite('TESTCODE', 'plex-auth-token')

      expect(result).toEqual({ success: true, data: null })
      expect(auditedWith(AuditEventType.INVITE_PLEX_FAILURE)).toEqual([
        expect.objectContaining({ stage: 'accept_invite', error: 'Error: Accept failed' }),
      ])
      expect(tx.user.delete).not.toHaveBeenCalled()
      expect(tx.inviteUsage.delete).not.toHaveBeenCalled()
      expect(auditedWith(AuditEventType.INVITE_ROLLBACK)).toEqual([])
    })
  })

  describe('redeemPlexInvite - affiliate invites', () => {
    const affiliateInvite = buildInvite({
      id: 'aff-invite-1',
      code: 'AFFCODE1',
      kind: 'AFFILIATE',
      affiliateUserId: 'affiliate-1',
      label: 'for my brother',
      maxUses: 1,
      expiresAt: new Date(Date.now() + 86400000),
      librarySectionIds: '[1,2]',
    })
    const SWITCH_ON = { affiliateInvitesEnabled: true, affiliateLibrarySectionIds: [1, 2], affiliatePlexMachineId: 'machine-1' }

    const tx = {
      invite: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      inviteUsage: { create: jest.fn(), delete: jest.fn() },
      config: { findUnique: jest.fn() },
      plexServer: { findFirst: jest.fn() },
      affiliateApplication: { findUnique: jest.fn() },
    }

    const auditedRefusals = () =>
      mockLogAuditEvent.mock.calls.filter(([event]) => event === AuditEventType.AFFILIATE_REDEMPTION_REFUSED).map(([, , details]) => details)

    beforeEach(() => {
      mockGetPlexUserInfo.mockResolvedValue({ success: true, data: mockPlexUser })
      mockPrisma.plexServer.findFirst.mockResolvedValue(mockPlexServer)
      mockPrisma.invite.findUnique.mockResolvedValue(affiliateInvite)
      mockInviteUserToPlexServer.mockResolvedValue({ success: true, inviteID: 12345 })
      mockAcceptPlexInvite.mockResolvedValue({ success: true })
      jest.mocked(screenAffiliateRedeemer).mockResolvedValue(null)
      mockPrisma.$transaction.mockImplementation(async (fn) =>
        typeof fn === 'function' ? fn(asTransactionClient(tx)) : Promise.resolve()
      )
      tx.invite.findUnique.mockResolvedValue(affiliateInvite)
      tx.invite.update.mockResolvedValue({ ...affiliateInvite, useCount: 1 })
      tx.config.findUnique.mockResolvedValue(SWITCH_ON)
      tx.plexServer.findFirst.mockResolvedValue({ machineIdentifier: 'machine-1' })
      tx.affiliateApplication.findUnique.mockResolvedValue({ status: 'APPROVED' })
      // The affiliate is read by id, the redeeming account by its Plex id
      tx.user.findUnique.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
        where.id === 'affiliate-1' ? { disabledAt: null } : null
      )
      tx.user.create.mockResolvedValue({ id: 'invitee-1' })
      tx.inviteUsage.create.mockResolvedValue({ id: 'usage-1' })
    })

    it('screens the account before the use is counted and audits a refusal against the affiliate', async () => {
      jest.mocked(screenAffiliateRedeemer).mockResolvedValue({ code: 'INVITE_ALREADY_MEMBER', reason: 'had_access' })

      const result = await redeemPlex('AFFCODE1', 'plex-auth-token')

      expect(result).toEqual({ success: false, code: 'INVITE_ALREADY_MEMBER', error: "You're already a member. Sign in instead." })
      expect(screenAffiliateRedeemer).toHaveBeenCalledWith(mockPlexUser, mockPlexServer)
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
      expect(mockInviteUserToPlexServer).not.toHaveBeenCalled()
      expect(auditedRefusals()).toEqual([{ inviteId: 'aff-invite-1', reason: 'had_access', targetUserId: 'affiliate-1' }])
    })

    it('does not screen an admin invite', async () => {
      mockPrisma.invite.findUnique.mockResolvedValue(mockInvite)
      tx.invite.findUnique.mockResolvedValue(mockInvite)
      tx.invite.update.mockResolvedValue({ ...mockInvite, useCount: 1 })

      await runProcessInvite('TESTCODE', 'plex-auth-token')

      expect(screenAffiliateRedeemer).not.toHaveBeenCalled()
      expect(tx.user.create.mock.calls[0][0].data).toMatchObject({ exemptNote: 'Joined by invite' })
    })

    it('joins with the member-invite exemption, writes the join record and clears the label', async () => {
      const result = await runProcessInvite('AFFCODE1', 'plex-auth-token')

      expect(result).toEqual({ success: true, data: null })
      expect(tx.invite.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'aff-invite-1' },
        data: { useCount: { increment: 1 }, joinedAt: expect.any(Date), label: null },
      })
      expect(tx.user.create.mock.calls[0][0].data).toMatchObject({ isExempt: true, exemptNote: 'Joined by member invite' })
      expect(tx.invite.update).toHaveBeenNthCalledWith(2, { where: { id: 'aff-invite-1' }, data: { joinedUserId: 'invitee-1' } })
      expect(mockInviteUserToPlexServer).toHaveBeenCalledWith(
        expect.anything(),
        mockPlexUser.email,
        { librarySectionIds: [1, 2], allowDownloads: false }
      )
      expect(auditedRefusals()).toEqual([])
    })

    it.each([
      ['switch_off', () => tx.config.findUnique.mockResolvedValue({ ...SWITCH_ON, affiliateInvitesEnabled: false })],
      ['switch_off', () => tx.plexServer.findFirst.mockResolvedValue({ machineIdentifier: 'another-server' })],
      ['cancelled', () => tx.invite.findUnique.mockResolvedValue({ ...affiliateInvite, cancelledAt: new Date() })],
      ['no_libraries', () => tx.invite.findUnique.mockResolvedValue({ ...affiliateInvite, librarySectionIds: '[]' })],
      ['not_affiliate', () => tx.affiliateApplication.findUnique.mockResolvedValue({ status: 'REVOKED' })],
      ['not_affiliate', () => tx.affiliateApplication.findUnique.mockResolvedValue(null)],
    ] as const)('refuses inside the transaction (%s) without counting the use, and audits it', async (reason, arrange) => {
      arrange()

      const result = await runProcessInvite('AFFCODE1', 'plex-auth-token')

      expect(result).toEqual({ success: false, code: 'INVITE_INVALID', error: "This invite can't be used" })
      expect(tx.invite.update).not.toHaveBeenCalled()
      expect(mockInviteUserToPlexServer).not.toHaveBeenCalled()
      expect(auditedRefusals()).toEqual([{ inviteId: 'aff-invite-1', reason, targetUserId: 'affiliate-1' }])
    })

    it('refuses an invite whose affiliate is disabled', async () => {
      tx.user.findUnique.mockResolvedValue({ disabledAt: new Date() })

      const result = await runProcessInvite('AFFCODE1', 'plex-auth-token')

      expect(result).toMatchObject({ success: false, code: 'INVITE_INVALID' })
      expect(auditedRefusals()).toEqual([expect.objectContaining({ reason: 'not_affiliate' })])
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

    it('marks a newly created user exempt, as a Plex member (P11.10)', async () => {
      tx.user.findUnique.mockResolvedValue(null)
      tx.user.create.mockResolvedValue({ id: 'user-1' })

      const result = await runProcessInvite('TESTCODE', 'plex-auth-token')

      expect(result).toEqual({ success: true, data: null })
      expect(tx.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          plexUserId: mockPlexUser.id,
          primaryAuthService: 'plex',
          isExempt: true,
          exemptNote: 'Joined by invite',
        }),
      })
    })

    it('marks an existing non-exempt user exempt on redemption', async () => {
      tx.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        isExempt: false,
        exemptNote: null,
      })
      tx.user.update.mockResolvedValue({ id: 'user-1' })

      const result = await runProcessInvite('TESTCODE', 'plex-auth-token')

      expect(result).toEqual({ success: true, data: null })
      expect(tx.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isExempt: true, exemptNote: 'Joined by invite' }),
        })
      )
    })

    it('does not overwrite an existing exemption note', async () => {
      tx.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        isExempt: true,
        exemptNote: 'IT support',
      })
      tx.user.update.mockResolvedValue({ id: 'user-1' })

      const result = await runProcessInvite('TESTCODE', 'plex-auth-token')

      expect(result).toEqual({ success: true, data: null })
      const updateData = tx.user.update.mock.calls[0][0].data
      expect(updateData).not.toHaveProperty('isExempt')
      expect(updateData).not.toHaveProperty('exemptNote')
    })

    it('marks a newly created Jellyfin user exempt, as a Jellyfin member (P11.10)', async () => {
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
          primaryAuthService: 'jellyfin',
          isExempt: true,
          exemptNote: 'Joined by invite',
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
        select: { id: true },
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
        select: { id: true },
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
      expect(mockInviteUserToPlexServer).not.toHaveBeenCalled()
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

    // P10.7: the invite page's <form action>
    function formData(fields: Record<string, string>) {
      const form = new FormData()
      for (const [name, value] of Object.entries(fields)) form.set(name, value)
      return form
    }

    it('refuses mismatched passwords on the form, keeping the username and no password', async () => {
      const state = await redeemJellyfinInviteForm(
        idleFormState(),
        formData({ code: 'TESTCODE', username: 'jane.doe-2', password: 'password123', confirmPassword: 'password456' })
      )

      expect(state).toEqual({
        status: 'error',
        data: null,
        error: 'Passwords do not match',
        fieldErrors: { confirmPassword: ['Passwords do not match'] },
        values: { username: 'jane.doe-2' },
      })
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    it('puts a bad username on its field', async () => {
      const state = await redeemJellyfinInviteForm(
        idleFormState(),
        formData({ code: 'TESTCODE', username: 'a@b.com', password: 'password123', confirmPassword: 'password123' })
      )

      expect(state.status).toBe('error')
      expect(state.fieldErrors.username).toEqual([
        'Username must be 3 to 32 characters: letters, numbers, dots, dashes or underscores',
      ])
      expect(state.values).toEqual({ username: 'a@b.com' })
      expect(mockCreateJellyfinUser).not.toHaveBeenCalled()
    })

    it('redeems through processJellyfinInvite and returns its data', async () => {
      const state = await redeemJellyfinInviteForm(
        idleFormState(),
        formData({ code: 'TESTCODE', username: ' jane.doe-2 ', password: 'password123', confirmPassword: 'password123' })
      )

      expect(state).toMatchObject({
        status: 'success',
        error: null,
        data: { jellyfinUserId: 'jf-user-1', username: 'jane.doe-2', serverUrl: null },
      })
      expect(mockCreateJellyfinUser).toHaveBeenCalledWith(expect.anything(), 'jane.doe-2', 'password123')
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
        data: { useCount: { decrement: 1 }, joinedAt: null, joinedUserId: null },
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
})
