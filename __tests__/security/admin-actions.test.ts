/**
 * Security tests for admin server actions and loaders (P11.5): actions refuse
 * signed-out and non-admin callers with `UNAUTHENTICATED` and `FORBIDDEN`
 * without a throw; loaders throw the digests the error boundaries read.
 */

import { setLLMDisabled } from '@/actions/admin/admin-config'
import { runMemberActivityNow, setMemberInactivityExcluded, updateInactivitySettings } from '@/actions/admin/inactivity'
import { getLLMUsageRecords, getLLMUsageById } from '@/lib/data/llm-usage'
import { setUserDisabled, setUserRole, updateUserAdminStatus } from '@/actions/admin/admin-users'
import { getConfig } from '@/lib/data/admin-settings'
import { prisma } from '@/lib/prisma'
import { AuditEventType, logAuditEvent } from '@/lib/security/audit-log'
import { assertPermission } from '@/lib/admin'
import { authErrorKind } from '@/lib/auth-errors'
import { getServerSession } from 'next-auth'
import { mockReset } from 'jest-mock-extended'
import { asTransactionClient, prismaMock } from '@/__tests__/helpers/prisma-mock'
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

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

// The inactivity actions queue a job or run the sweep; a refused caller reaches neither.
jest.mock('@/lib/queue/client', () => ({ addJob: jest.fn() }))
jest.mock('@/lib/inactivity/run', () => ({ runMemberActivity: jest.fn() }))

beforeEach(() => mockReset(prismaMock))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
  unstable_rethrow: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({ authOptions: {} }))

const asAdmin = () => (getServerSession as jest.Mock).mockResolvedValue(mockAdminSession)
const asMember = () =>
  (getServerSession as jest.Mock).mockResolvedValue({ ...mockAdminSession, user: { ...mockAdminSession.user, isAdmin: false } })
const signedOut = () => (getServerSession as jest.Mock).mockResolvedValue(null)

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
      asAdmin()
      ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({
        id: 'config',
        llmDisabled: false,
        updatedAt: new Date(),
        updatedBy: null,
      })

      const result = await getConfig()

      expect(getServerSession).toHaveBeenCalled()
      expect(result).toBeTruthy()
      expect(result.id).toBe('config')
    })

    it('should create config with defaults if not exists (admin only)', async () => {
      asAdmin()
      ;(prisma.config.findUnique as jest.Mock).mockResolvedValue(null)
      ;(prisma.config.create as jest.Mock).mockResolvedValue({
        id: 'config',
        llmDisabled: false,
        updatedAt: new Date(),
        updatedBy: null,
      })

      const result = await getConfig()

      expect(getServerSession).toHaveBeenCalled()
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
      asMember()

      await expect(getConfig()).rejects.toMatchObject({ digest: 'PM_FORBIDDEN' })
      expect(prisma.config.findUnique).not.toHaveBeenCalled()
      expect(prisma.config.create).not.toHaveBeenCalled()
    })

    it('should reject unauthenticated user', async () => {
      signedOut()

      await expect(getConfig()).rejects.toMatchObject({ digest: 'PM_UNAUTHENTICATED' })
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
      asAdmin()
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

      const result = await getLLMUsageRecords({ page: 1, pageSize: 50 })

      expect(getServerSession).toHaveBeenCalled()
      expect(result.records).toHaveLength(1)
      expect(result.pagination.total).toBe(1)
    })

    it('should reject non-admin user', async () => {
      asMember()

      await expect(getLLMUsageRecords({ page: 1, pageSize: 50 })).rejects.toMatchObject({ digest: 'PM_FORBIDDEN' })
      expect(prisma.lLMUsage.findMany).not.toHaveBeenCalled()
    })

    it('should filter by userId when provided', async () => {
      asAdmin()
      ;(prisma.lLMUsage.findMany as jest.Mock).mockResolvedValue([])
      ;(prisma.lLMUsage.count as jest.Mock).mockResolvedValue(0)

      await getLLMUsageRecords({ page: 1, pageSize: 50, userId: 'user-1' })

      expect(prisma.lLMUsage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
        })
      )
    })
  })

  describe('getLLMUsageById', () => {
    it('should allow admin to get LLM usage by ID', async () => {
      asAdmin()
      ;(prisma.lLMUsage.findUnique as jest.Mock).mockResolvedValue({
        id: 'usage-1',
        userId: 'user-1',
        provider: 'openai',
        model: 'gpt-4',
        cost: 0.01,
        totalTokens: 1000,
      })

      const result = await getLLMUsageById('usage-1')

      expect(getServerSession).toHaveBeenCalled()
      expect(result).toBeTruthy()
      expect(result?.id).toBe('usage-1')
    })

    it('should reject non-admin user', async () => {
      asMember()

      await expect(getLLMUsageById('usage-1')).rejects.toMatchObject({ digest: 'PM_FORBIDDEN' })
      expect(prisma.lLMUsage.findUnique).not.toHaveBeenCalled()
    })
  })

  // P4.7 (SEC-10, SEC-12): roles set in the UI stick, so the owner and the
  // last admin cannot be demoted, and a demotion ends the user's sessions.
  describe('updateUserAdminStatus', () => {
    const bump = { where: { id: 'member-1' }, data: { sessionVersion: { increment: 1 } } }

    // Each write made inside a transaction, with that transaction's number, so a test can tell which share one
    let transaction = 0
    let open = false
    const transactional: string[] = []

    beforeEach(() => {
      asAdmin()
      prismaMock.plexServer.findFirst.mockResolvedValue({ adminPlexUserId: 'plex-owner' } as never)
      prismaMock.user.count.mockResolvedValue(2)
      prismaMock.user.updateMany.mockResolvedValue({ count: 1 })
      transaction = 0
      transactional.length = 0
      prismaMock.$transaction.mockImplementation(async (callback) => {
        transaction += 1
        open = true
        try {
          return await callback(asTransactionClient(prismaMock))
        } finally {
          open = false
        }
      })
      prismaMock.user.update.mockImplementation((async () => {
        if (open) transactional.push(`user.update in ${transaction}`)
        return buildUser({ id: 'member-1' })
      }) as never)
      prismaMock.chatConversation.updateMany.mockImplementation((async () => {
        if (open) transactional.push(`chatConversation.updateMany in ${transaction}`)
        return { count: 2 }
      }) as never)
    })

    it('refuses to demote the Plex server owner', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', isAdmin: true, plexUserId: 'plex-owner' }))

      const result = await updateUserAdminStatus({ userId: 'member-1', isAdmin: false })

      expect(result).toMatchObject({ success: false, code: 'OWNER' })
      expect(prismaMock.user.update).not.toHaveBeenCalled()
    })

    it('refuses to demote the last admin', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', isAdmin: true, plexUserId: 'plex-other' }))
      prismaMock.user.count.mockResolvedValue(1)

      const result = await updateUserAdminStatus({ userId: 'member-1', isAdmin: false })

      expect(result).toMatchObject({ success: false, code: 'LAST_ADMIN' })
      expect(prismaMock.user.update).not.toHaveBeenCalled()
    })

    it('refuses a signed-out caller and a member without a throw', async () => {
      signedOut()
      await expect(updateUserAdminStatus({ userId: 'member-1', isAdmin: true })).resolves.toMatchObject({
        success: false,
        code: 'UNAUTHENTICATED',
      })

      asMember()
      await expect(updateUserAdminStatus({ userId: 'member-1', isAdmin: true })).resolves.toMatchObject({
        success: false,
        code: 'FORBIDDEN',
      })
      expect(prismaMock.user.update).not.toHaveBeenCalled()
    })

    it('refuses invalid input with VALIDATION', async () => {
      const send = updateUserAdminStatus as (input: unknown) => ReturnType<typeof updateUserAdminStatus>
      await expect(send({ userId: 'member-1', isAdmin: 'yes' })).resolves.toMatchObject({ success: false, code: 'VALIDATION' })
    })

    it('refuses to demote the caller', async () => {
      const result = await updateUserAdminStatus({ userId: mockAdminSession.user.id, isAdmin: false })

      expect(result).toMatchObject({ success: false, code: 'SELF' })
    })

    it('clears the role when it promotes a user to admin', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', isAdmin: false, role: 'support' }))

      await updateUserAdminStatus({ userId: 'member-1', isAdmin: true })

      expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: 'member-1' }, data: { isAdmin: true, role: null } })
    })

    it('demotes another admin, ends their sessions and ends their assistant page conversations', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', isAdmin: true, plexUserId: 'plex-other' }))

      const result = await updateUserAdminStatus({ userId: 'member-1', isAdmin: false })

      expect(result).toEqual({ success: true, data: null })
      expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: 'member-1' }, data: { isAdmin: false } })
      expect(prismaMock.user.updateMany).toHaveBeenCalledWith(bump)
      expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.SESSIONS_REVOKED, 'admin-user-id', {
        targetUserId: 'member-1',
        reason: 'demoted',
      })
      // Answers built from admin-only tool output are not left for a role to read
      expect(prismaMock.chatConversation.updateMany).toHaveBeenCalledWith({
        where: { userId: 'member-1', endedAt: null, discordSessions: { none: {} } },
        data: { endedAt: expect.any(Date), title: null },
      })
      expect(prismaMock.chatConversationMessage.deleteMany).toHaveBeenCalledWith({
        where: { conversation: { userId: 'member-1', endedAt: { not: null } } },
      })
      // One transaction, so a failure ending them undoes the demotion and a retry does both
      expect(transactional).toEqual(['user.update in 1', 'chatConversation.updateMany in 1'])
    })

    it('reports a failure ending the conversations without auditing the demotion or ending sessions', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', isAdmin: true, plexUserId: 'plex-other' }))
      prismaMock.chatConversation.updateMany.mockRejectedValue(new Error('connection lost'))

      const result = await updateUserAdminStatus({ userId: 'member-1', isAdmin: false })

      expect(result).toMatchObject({ success: false, code: 'INTERNAL' })
      expect(logAuditEvent).not.toHaveBeenCalledWith(AuditEventType.ADMIN_PRIVILEGE_REVOKED, expect.anything(), expect.anything())
      expect(prismaMock.user.updateMany).not.toHaveBeenCalled()
    })

    it('refuses a user that does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null)

      await expect(updateUserAdminStatus({ userId: 'gone-1', isAdmin: true })).resolves.toMatchObject({ success: false, code: 'NOT_FOUND' })
    })

    it('changes nothing when the member already has that role', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', isAdmin: true }))

      await expect(updateUserAdminStatus({ userId: 'member-1', isAdmin: true })).resolves.toEqual({ success: true, data: null })

      expect(prismaMock.user.update).not.toHaveBeenCalled()
    })

    it('promotes without ending sessions', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', isAdmin: false }))

      await expect(updateUserAdminStatus({ userId: 'member-1', isAdmin: true })).resolves.toEqual({ success: true, data: null })

      expect(prismaMock.user.updateMany).not.toHaveBeenCalled()
      expect(prismaMock.chatConversation.updateMany).not.toHaveBeenCalled()
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

      await expect(setUserDisabled({ userId: 'member-1', disabled: true })).resolves.toEqual({ success: true, data: { inviterRevoked: null } })

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

    it('ends the sessions on a retry of a disable whose session end failed', async () => {
      const disabledAt = new Date('2026-10-01T10:00:00Z')
      prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', disabledAt }))
      prismaMock.auditLog.findFirst.mockResolvedValue(null)

      await expect(setUserDisabled({ userId: 'member-1', disabled: true })).resolves.toEqual({ success: true, data: { inviterRevoked: null } })

      expect(prismaMock.user.update).not.toHaveBeenCalled()
      expect(prismaMock.auditLog.findFirst).toHaveBeenCalledWith({
        where: { type: AuditEventType.SESSIONS_REVOKED, targetUserId: 'member-1', createdAt: { gte: disabledAt } },
        select: { id: true },
      })
      expect(prismaMock.user.updateMany).toHaveBeenCalledWith({ where: { id: 'member-1' }, data: { sessionVersion: { increment: 1 } } })
      expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.SESSIONS_REVOKED, 'admin-user-id', { targetUserId: 'member-1', reason: 'disabled' })
      expect(logAuditEvent).not.toHaveBeenCalledWith(AuditEventType.USER_DISABLED, expect.anything(), expect.anything())
    })

    it('stays quiet on a retry once the sessions ended for this disable', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', disabledAt: new Date() }))
      prismaMock.auditLog.findFirst.mockResolvedValue({ id: 'event-1' } as never)

      await expect(setUserDisabled({ userId: 'member-1', disabled: true })).resolves.toEqual({ success: true, data: { inviterRevoked: null } })

      expect(prismaMock.user.updateMany).not.toHaveBeenCalled()
      expect(logAuditEvent).not.toHaveBeenCalled()
    })

    it('changes nothing when the member is already in that state', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', disabledAt: null }))

      await expect(setUserDisabled({ userId: 'member-1', disabled: false })).resolves.toEqual({ success: true, data: { inviterRevoked: null } })

      expect(prismaMock.user.update).not.toHaveBeenCalled()
    })

    it('enables a disabled member without ending sessions', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', disabledAt: new Date() }))

      await expect(setUserDisabled({ userId: 'member-1', disabled: false })).resolves.toEqual({ success: true, data: { inviterRevoked: null } })

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

describe('Roles', () => {
  const asSupport = () =>
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'support-1', isAdmin: false, role: 'support' } })

  describe('setUserRole', () => {
    beforeEach(() => {
      jest.clearAllMocks()
      asAdmin()
      prismaMock.user.updateMany.mockResolvedValue({ count: 1 })
    })

    it('assigns the Support role and audits it', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', isAdmin: false, role: null }))

      const result = await setUserRole({ userId: 'member-1', role: 'support' })

      expect(result).toEqual({ success: true, data: null })
      expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: 'member-1' }, data: { role: 'support' } })
      expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.USER_ROLE_CHANGED, 'admin-user-id', {
        targetUserId: 'member-1',
        previousRole: null,
        newRole: 'support',
      })
      expect(prismaMock.user.updateMany).not.toHaveBeenCalled()
    })

    it('revokes the role, audits it and ends the user\'s sessions', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', isAdmin: false, role: 'support' }))

      const result = await setUserRole({ userId: 'member-1', role: null })

      expect(result).toEqual({ success: true, data: null })
      expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: 'member-1' }, data: { role: null } })
      expect(logAuditEvent).toHaveBeenCalledWith(
        AuditEventType.USER_ROLE_CHANGED,
        'admin-user-id',
        expect.objectContaining({ previousRole: 'support', newRole: null })
      )
      expect(prismaMock.user.updateMany).toHaveBeenCalledWith({ where: { id: 'member-1' }, data: { sessionVersion: { increment: 1 } } })
    })

    it('changes nothing when the user already has the role', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', isAdmin: false, role: 'support' }))

      await expect(setUserRole({ userId: 'member-1', role: 'support' })).resolves.toEqual({ success: true, data: null })
      expect(prismaMock.user.update).not.toHaveBeenCalled()
      expect(logAuditEvent).not.toHaveBeenCalled()
    })

    it('refuses an admin target and an unknown user', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', isAdmin: true }))
      await expect(setUserRole({ userId: 'member-1', role: 'support' })).resolves.toMatchObject({ success: false, code: 'ADMIN' })

      prismaMock.user.findUnique.mockResolvedValue(null)
      await expect(setUserRole({ userId: 'member-1', role: 'support' })).resolves.toMatchObject({ success: false, code: 'NOT_FOUND' })
      expect(prismaMock.user.update).not.toHaveBeenCalled()
    })

    it('refuses a role that does not exist', async () => {
      const send = setUserRole as (input: unknown) => ReturnType<typeof setUserRole>

      await expect(send({ userId: 'member-1', role: 'owner' })).resolves.toMatchObject({ success: false, code: 'VALIDATION' })
    })

    it('refuses signed-out callers, members and Support users, who cannot grant roles even to themselves', async () => {
      signedOut()
      await expect(setUserRole({ userId: 'member-1', role: 'support' })).resolves.toMatchObject({ success: false, code: 'UNAUTHENTICATED' })

      asMember()
      await expect(setUserRole({ userId: 'member-1', role: 'support' })).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' })

      asSupport()
      await expect(setUserRole({ userId: 'support-1', role: 'support' })).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' })
      expect(prismaMock.user.update).not.toHaveBeenCalled()
    })
  })

  describe('admin-only actions and loaders', () => {
    it('refuse a Support user', async () => {
      asSupport()

      await expect(setUserDisabled({ userId: 'member-1', disabled: true })).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' })
      await expect(updateUserAdminStatus({ userId: 'member-1', isAdmin: true })).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' })
      await expect(setLLMDisabled(true)).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' })
      await expect(getConfig()).rejects.toMatchObject({ digest: expect.any(String) })
      await expect(getLLMUsageRecords()).rejects.toMatchObject({ digest: expect.any(String) })
    })

    it('refuse a Support user the inactivity sweep: its settings, Run now and the member exclusion', async () => {
      asSupport()

      await expect(updateInactivitySettings({ enabled: true, thresholdDays: 90 })).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' })
      await expect(runMemberActivityNow({ confirmedRemovals: 1 })).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' })
      await expect(setMemberInactivityExcluded({ userId: 'member-1', excluded: true })).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' })
      expect(prismaMock.inactivitySettings.upsert).not.toHaveBeenCalled()
      expect(prismaMock.user.updateMany).not.toHaveBeenCalled()
      expect(logAuditEvent).not.toHaveBeenCalled()
    })
  })

  describe('assertPermission', () => {
    it('passes an admin and a role that holds the permission', async () => {
      asAdmin()
      await expect(assertPermission('users:read')).resolves.toBeTruthy()

      asSupport()
      await expect(assertPermission('users:read')).resolves.toBeTruthy()
    })

    it('throws the forbidden digest for a permission the role lacks and for a member', async () => {
      asSupport()
      const lacking = await assertPermission('assistant:tools:write').catch((error: Error & { digest?: string }) => error)
      expect(authErrorKind(lacking as Error & { digest?: string })).toBe('forbidden')

      asMember()
      const member = await assertPermission('users:read').catch((error: Error & { digest?: string }) => error)
      expect(authErrorKind(member as Error & { digest?: string })).toBe('forbidden')
    })

    it('throws the unauthenticated digest without a session', async () => {
      signedOut()
      const error = await assertPermission('users:read').catch((thrown: Error & { digest?: string }) => thrown)

      expect(authErrorKind(error as Error & { digest?: string })).toBe('unauthenticated')
    })
  })
})
