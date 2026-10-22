/**
 * Security tests for admin server actions
 * Tests that admin-only actions properly enforce authorization
 */

import { requireAdmin } from '@/lib/admin'
import {
  setLLMDisabled,
  getLLMUsageRecords,
  getLLMUsageById,
  setUserDisabled,
  updateUserAdminStatus,
} from '@/actions/admin'
import { getConfig } from '@/actions/admin/admin-config'
import { prisma } from '@/lib/prisma'
import { AuditEventType, logAuditEvent } from '@/lib/security/audit-log'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { buildUser } from '@/__tests__/helpers/factories'

jest.mock('@/lib/security/audit-log', () => ({
  ...jest.requireActual('@/lib/security/audit-log'),
  logAuditEvent: jest.fn(),
}))

jest.mock('next/cache', () => ({
  ...jest.requireActual('next/cache'),
  revalidatePath: jest.fn(),
  updateTag: jest.fn(),
}))

// Mock dependencies
jest.mock('@/lib/admin', () => ({
  requireAdmin: jest.fn(),
  getAdminStatus: jest.fn(),
}))

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
  unstable_rethrow: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({ authOptions: {} }))

const mockAdminSession = {
  user: {
    id: 'admin-user-id',
    email: 'admin@example.com',
    name: 'Admin User',
    isAdmin: true,
  },
}

describe('Admin Actions Security', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getConfig', () => {
    it('should require admin to get config', async () => {
      ;(requireAdmin as jest.Mock).mockResolvedValue(mockAdminSession)
      ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({
        id: 'config',
        llmDisabled: false,
        updatedAt: new Date(),
        updatedBy: null,
      })

      const result = await getConfig()

      expect(requireAdmin).toHaveBeenCalled()
      expect(result).toBeTruthy()
      expect(result.id).toBe('config')
    })

    it('should create config with defaults if not exists (admin only)', async () => {
      ;(requireAdmin as jest.Mock).mockResolvedValue(mockAdminSession)
      ;(prisma.config.findUnique as jest.Mock).mockResolvedValue(null)
      ;(prisma.config.create as jest.Mock).mockResolvedValue({
        id: 'config',
        llmDisabled: false,
        updatedAt: new Date(),
        updatedBy: null,
      })

      const result = await getConfig()

      expect(requireAdmin).toHaveBeenCalled()
      // getConfig selects only non-secret columns so decrypted Stripe secrets
      // are never returned to callers.
      expect(prisma.config.create).toHaveBeenCalledWith({
        data: {
          id: 'config',
          llmDisabled: false,
          wrappedEnabled: true,
        },
        select: expect.objectContaining({
          stripeEnabled: true,
          stripePriceIds: true,
        }),
      })
      expect(result.id).toBe('config')
    })

    it('should reject non-admin user', async () => {
      ;(requireAdmin as jest.Mock).mockImplementation(() => {
        redirect('/')
        throw new Error('Not admin')
      })

      await expect(getConfig()).rejects.toThrow()
      expect(prisma.config.findUnique).not.toHaveBeenCalled()
      expect(prisma.config.create).not.toHaveBeenCalled()
    })

    it('should reject unauthenticated user', async () => {
      ;(requireAdmin as jest.Mock).mockImplementation(() => {
        redirect('/')
        throw new Error('Unauthenticated')
      })

      await expect(getConfig()).rejects.toThrow()
      expect(prisma.config.findUnique).not.toHaveBeenCalled()
      expect(prisma.config.create).not.toHaveBeenCalled()
    })
  })

  describe('setLLMDisabled', () => {
    it('should allow admin to update LLM disabled setting, and audit it', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(mockAdminSession)
      ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({ llmDisabled: false })
      ;(prisma.config.upsert as jest.Mock).mockResolvedValue({ id: 'config' })

      const result = await setLLMDisabled(true)

      expect(result).toEqual({ success: true, data: null })
      expect(prisma.config.upsert).toHaveBeenCalledWith({
        where: { id: 'config' },
        update: {
          llmDisabled: true,
          updatedBy: 'admin-user-id',
        },
        create: {
          id: 'config',
          llmDisabled: true,
          updatedBy: 'admin-user-id',
        },
        // Nothing of the row reaches the client
        select: { id: true },
      })
      expect(logAuditEvent).toHaveBeenCalledWith(
        AuditEventType.CONFIG_CHANGED,
        'admin-user-id',
        expect.objectContaining({ section: 'llm', changedFields: ['llmDisabled'] })
      )
    })

    it('should reject non-admin user', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue({ ...mockAdminSession, user: { ...mockAdminSession.user, isAdmin: false } })

      await expect(setLLMDisabled(true)).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' })
      expect(prisma.config.upsert).not.toHaveBeenCalled()
    })
  })

  describe('getLLMUsageRecords', () => {
    it('should allow admin to get LLM usage records', async () => {
      ;(requireAdmin as jest.Mock).mockResolvedValue(mockAdminSession)
      ;(prisma.lLMUsage.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'usage-1',
          userId: 'user-1',
          provider: 'openai',
          model: 'gpt-4',
          cost: 0.01,
          totalTokens: 1000,
        },
      ])
      ;(prisma.lLMUsage.count as jest.Mock).mockResolvedValue(1)

      const result = await getLLMUsageRecords(1, 50)

      expect(requireAdmin).toHaveBeenCalled()
      expect(result.records).toHaveLength(1)
      expect(result.pagination.total).toBe(1)
    })

    it('should reject non-admin user', async () => {
      ;(requireAdmin as jest.Mock).mockImplementation(() => {
        redirect('/')
        throw new Error('Not admin')
      })

      await expect(getLLMUsageRecords(1, 50)).rejects.toThrow()
      expect(prisma.lLMUsage.findMany).not.toHaveBeenCalled()
    })

    it('should filter by userId when provided', async () => {
      ;(requireAdmin as jest.Mock).mockResolvedValue(mockAdminSession)
      ;(prisma.lLMUsage.findMany as jest.Mock).mockResolvedValue([])
      ;(prisma.lLMUsage.count as jest.Mock).mockResolvedValue(0)

      await getLLMUsageRecords(1, 50, 'user-1')

      expect(prisma.lLMUsage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
        })
      )
    })
  })

  describe('getLLMUsageById', () => {
    it('should allow admin to get LLM usage by ID', async () => {
      ;(requireAdmin as jest.Mock).mockResolvedValue(mockAdminSession)
      ;(prisma.lLMUsage.findUnique as jest.Mock).mockResolvedValue({
        id: 'usage-1',
        userId: 'user-1',
        provider: 'openai',
        model: 'gpt-4',
        cost: 0.01,
        totalTokens: 1000,
      })

      const result = await getLLMUsageById('usage-1')

      expect(requireAdmin).toHaveBeenCalled()
      expect(result).toBeTruthy()
      expect(result?.id).toBe('usage-1')
    })

    it('should reject non-admin user', async () => {
      ;(requireAdmin as jest.Mock).mockImplementation(() => {
        redirect('/')
        throw new Error('Not admin')
      })

      await expect(getLLMUsageById('usage-1')).rejects.toThrow()
      expect(prisma.lLMUsage.findUnique).not.toHaveBeenCalled()
    })
  })

  // P4.7 (SEC-10, SEC-12): roles set in the UI stick, so the owner and the
  // last admin cannot be demoted, and a demotion ends the user's sessions.
  describe('updateUserAdminStatus', () => {
    const bump = { where: { id: 'member-1' }, data: { sessionVersion: { increment: 1 } } }

    beforeEach(() => {
      ;(requireAdmin as jest.Mock).mockResolvedValue(mockAdminSession)
      prismaMock.plexServer.findFirst.mockResolvedValue({ adminPlexUserId: 'plex-owner' } as never)
      prismaMock.user.count.mockResolvedValue(2)
      prismaMock.user.updateMany.mockResolvedValue({ count: 1 })
    })

    it('refuses to demote the Plex server owner', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', isAdmin: true, plexUserId: 'plex-owner' }))

      const result = await updateUserAdminStatus('member-1', false)

      expect(result).toMatchObject({ success: false, code: 'OWNER' })
      expect(prismaMock.user.update).not.toHaveBeenCalled()
    })

    it('refuses to demote the last admin', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', isAdmin: true, plexUserId: 'plex-other' }))
      prismaMock.user.count.mockResolvedValue(1)

      const result = await updateUserAdminStatus('member-1', false)

      expect(result).toMatchObject({ success: false, code: 'LAST_ADMIN' })
      expect(prismaMock.user.update).not.toHaveBeenCalled()
    })

    it('refuses to demote the caller', async () => {
      const result = await updateUserAdminStatus(mockAdminSession.user.id, false)

      expect(result).toMatchObject({ success: false, code: 'SELF' })
    })

    it('demotes another admin and ends their sessions', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', isAdmin: true, plexUserId: 'plex-other' }))

      const result = await updateUserAdminStatus('member-1', false)

      expect(result).toEqual({ success: true })
      expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: 'member-1' }, data: { isAdmin: false } })
      expect(prismaMock.user.updateMany).toHaveBeenCalledWith(bump)
      expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.SESSIONS_REVOKED, 'admin-user-id', {
        targetUserId: 'member-1',
        reason: 'demoted',
      })
    })

    it('promotes without ending sessions', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', isAdmin: false }))

      await expect(updateUserAdminStatus('member-1', true)).resolves.toEqual({ success: true })

      expect(prismaMock.user.updateMany).not.toHaveBeenCalled()
    })
  })

  describe('setUserDisabled', () => {
    const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>

    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({ ...mockAdminSession, expires: '' })
      prismaMock.plexServer.findFirst.mockResolvedValue({ adminPlexUserId: 'plex-owner' } as never)
      prismaMock.user.updateMany.mockResolvedValue({ count: 1 })
    })

    it('refuses a signed-out caller', async () => {
      mockGetServerSession.mockResolvedValue(null)

      await expect(setUserDisabled({ userId: 'member-1', disabled: true })).resolves.toMatchObject({
        success: false,
        code: 'UNAUTHENTICATED',
      })
      expect(prismaMock.user.update).not.toHaveBeenCalled()
    })

    it('refuses a member', async () => {
      mockGetServerSession.mockResolvedValue({ user: { id: 'member-2', isAdmin: false }, expires: '' })

      await expect(setUserDisabled({ userId: 'member-1', disabled: true })).resolves.toMatchObject({
        success: false,
        code: 'FORBIDDEN',
      })
      expect(prismaMock.user.update).not.toHaveBeenCalled()
    })

    it('disables a member, audits it and ends their sessions', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', plexUserId: 'plex-member' }))

      await expect(setUserDisabled({ userId: 'member-1', disabled: true })).resolves.toEqual({ success: true, data: null })

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'member-1' },
        data: { disabledAt: expect.any(Date) },
      })
      expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'member-1' },
        data: { sessionVersion: { increment: 1 } },
      })
      expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.USER_DISABLED, 'admin-user-id', {
        targetUserId: 'member-1',
      })
      expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.SESSIONS_REVOKED, 'admin-user-id', {
        targetUserId: 'member-1',
        reason: 'disabled',
      })
    })

    it('enables a disabled member without ending sessions', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', disabledAt: new Date() }))

      await expect(setUserDisabled({ userId: 'member-1', disabled: false })).resolves.toEqual({ success: true, data: null })

      expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: 'member-1' }, data: { disabledAt: null } })
      expect(prismaMock.user.updateMany).not.toHaveBeenCalled()
      expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.USER_ENABLED, 'admin-user-id', {
        targetUserId: 'member-1',
      })
    })

    it('refuses the caller themself', async () => {
      const result = await setUserDisabled({ userId: mockAdminSession.user.id, disabled: true })

      expect(result).toMatchObject({ success: false, code: 'SELF' })
      expect(prismaMock.user.update).not.toHaveBeenCalled()
    })

    it('refuses the Plex server owner', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'owner-1', plexUserId: 'plex-owner' }))

      const result = await setUserDisabled({ userId: 'owner-1', disabled: true })

      expect(result).toMatchObject({ success: false, code: 'OWNER' })
      expect(prismaMock.user.update).not.toHaveBeenCalled()
    })

    it('refuses a missing user', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null)

      const result = await setUserDisabled({ userId: 'gone-1', disabled: true })

      expect(result).toMatchObject({ success: false, code: 'NOT_FOUND' })
      expect(prismaMock.user.update).not.toHaveBeenCalled()
    })

    it('rejects malformed input', async () => {
      const result = await setUserDisabled({ userId: '', disabled: true })

      expect(result).toMatchObject({ success: false, code: 'VALIDATION' })
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
    })
  })
})

