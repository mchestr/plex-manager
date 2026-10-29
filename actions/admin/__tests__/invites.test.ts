/**
 * @jest-environment node
 *
 * createInvite and deleteInvite (P10.1, BP-30): admin only, Zod-checked
 * (SEC-56), a duplicate code refused on the code field, and both revalidate
 * the list and the detail page. Both are audited without the code and spend
 * the `admin:invites` limit (P11.5).
 */

import { mockReset } from 'jest-mock-extended'
import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'

import { buildInvite } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { createInvite, deleteInvite } from '@/actions/admin/invites'
import { Prisma } from '@/lib/generated/prisma/client'
import { consume } from '@/lib/security/rate-limit'
import { AuditEventType, logAuditEvent } from '@/lib/security/audit-log'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/security/rate-limit', () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock('@/lib/security/audit-log', () => ({
  ...jest.requireActual('@/lib/security/audit-log'),
  logAuditEvent: jest.fn(),
}))

const ADMIN = { user: { id: 'admin-1', isAdmin: true }, expires: '2099-01-01T00:00:00Z' }
const send = createInvite as (input: unknown) => ReturnType<typeof createInvite>

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue(ADMIN)
  jest.mocked(consume).mockResolvedValue({ ok: true, remaining: 29 } as never)
  prismaMock.invite.findUnique.mockResolvedValue(null)
  prismaMock.invite.create.mockResolvedValue(buildInvite({ id: 'invite-1', code: 'NEWCODE1' }))
})

describe('createInvite', () => {
  it('refuses a signed-out caller and a member', async () => {
    jest.mocked(getServerSession).mockResolvedValue(null)
    await expect(createInvite({})).resolves.toMatchObject({ success: false, code: 'UNAUTHENTICATED' })

    jest.mocked(getServerSession).mockResolvedValue({ ...ADMIN, user: { id: 'member-1', isAdmin: false } })
    await expect(createInvite({})).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' })
    expect(prismaMock.invite.create).not.toHaveBeenCalled()
  })

  it('creates a Plex invite with a generated code, then revalidates the list and the detail page', async () => {
    const result = await createInvite({ maxUses: 5 })

    expect(result).toMatchObject({ success: true, data: { id: 'invite-1', code: 'NEWCODE1' } })
    expect(prismaMock.invite.create.mock.calls[0][0].select).toEqual({ id: true, code: true })
    const { data } = prismaMock.invite.create.mock.calls[0][0]
    expect(data).toMatchObject({ serverType: 'PLEX', createdBy: 'admin-1', maxUses: 5, librarySectionIds: null, jellyfinLibraryIds: null })
    expect(data.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
    expect(revalidatePath).toHaveBeenCalledWith('/admin/invites')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/invites/invite-1')
  })

  it('audits the new invite without its code, and spends the admin:invites limit by admin', async () => {
    await createInvite({ code: 'FRIENDS2', maxUses: 3, expiresIn: 'never' })

    expect(consume).toHaveBeenCalledWith('admin:invites', 'admin-1')
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.INVITE_CREATED, 'admin-1', {
      inviteId: 'invite-1',
      serverType: 'PLEX',
      maxUses: 3,
      expiresAt: null,
      customCode: true,
    })
    expect(JSON.stringify(jest.mocked(logAuditEvent).mock.calls)).not.toContain('FRIENDS2')
  })

  it('refuses a rate-limited admin before creating anything', async () => {
    jest.mocked(consume).mockResolvedValue({ ok: false, retryAfterSec: 60 } as never)

    await expect(createInvite({})).resolves.toMatchObject({ success: false, code: 'RATE_LIMITED', retryAfterSec: 60 })
    expect(prismaMock.invite.create).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it('upper-cases a custom code and keeps only the libraries of its server type', async () => {
    await createInvite({ code: ' friends2 ', serverType: 'JELLYFIN', jellyfinLibraryIds: ['abc'], librarySectionIds: [1], allowDownloads: true })

    expect(prismaMock.invite.create.mock.calls[0][0].data).toMatchObject({
      code: 'FRIENDS2',
      serverType: 'JELLYFIN',
      jellyfinLibraryIds: '["abc"]',
      librarySectionIds: null,
      allowDownloads: false,
    })
  })

  it('expires in 48 hours by default and never with never', async () => {
    const before = Date.now()
    await createInvite({})
    const expiresAt = prismaMock.invite.create.mock.calls[0][0].data.expiresAt as Date
    expect(expiresAt.getTime() - before).toBeGreaterThanOrEqual(48 * 3600_000 - 1000)
    expect(expiresAt.getTime() - before).toBeLessThanOrEqual(48 * 3600_000 + 1000)

    await createInvite({ expiresIn: 'never' })
    expect(prismaMock.invite.create.mock.calls[1][0].data.expiresAt).toBeNull()
  })

  it('refuses a duplicate code on the code field', async () => {
    prismaMock.invite.findUnique.mockResolvedValue(buildInvite({ code: 'TAKENCODE' }))

    await expect(createInvite({ code: 'TAKENCODE' })).resolves.toEqual({
      success: false,
      code: 'CONFLICT',
      error: 'That code is already in use',
      fieldErrors: { code: ['That code is already in use'] },
    })
    expect(prismaMock.invite.create).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
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
    await expect(send(input)).resolves.toMatchObject({ success: false, code: 'VALIDATION' })
    expect(prismaMock.invite.create).not.toHaveBeenCalled()
  })
})

describe('deleteInvite', () => {
  it('refuses a member', async () => {
    jest.mocked(getServerSession).mockResolvedValue({ ...ADMIN, user: { id: 'member-1', isAdmin: false } })

    await expect(deleteInvite({ id: 'invite-1' })).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' })
    expect(prismaMock.invite.delete).not.toHaveBeenCalled()
  })

  it('deletes the invite, audits it and revalidates the list and the detail page', async () => {
    prismaMock.invite.delete.mockResolvedValue(buildInvite({ id: 'invite-1', serverType: 'JELLYFIN', useCount: 2 }))

    await expect(deleteInvite({ id: 'invite-1' })).resolves.toEqual({ success: true, data: null })
    expect(prismaMock.invite.delete).toHaveBeenCalledWith({
      where: { id: 'invite-1', kind: 'ADMIN' },
      select: { id: true, serverType: true, useCount: true },
    })
    expect(consume).toHaveBeenCalledWith('admin:invites', 'admin-1')
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.INVITE_DELETED, 'admin-1', {
      inviteId: 'invite-1',
      serverType: 'JELLYFIN',
      useCount: 2,
    })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/invites')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/invites/invite-1')
  })

  it('refuses a rate-limited admin before deleting', async () => {
    jest.mocked(consume).mockResolvedValue({ ok: false, retryAfterSec: 30 } as never)

    await expect(deleteInvite({ id: 'invite-1' })).resolves.toMatchObject({ success: false, code: 'RATE_LIMITED' })
    expect(prismaMock.invite.delete).not.toHaveBeenCalled()
  })

  it('reports an invite that is already gone', async () => {
    prismaMock.invite.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', { code: 'P2025', clientVersion: 'test' })
    )

    await expect(deleteInvite({ id: 'gone' })).resolves.toMatchObject({ success: false, code: 'NOT_FOUND' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('reports an affiliate invite id as not found', async () => {
    prismaMock.invite.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', { code: 'P2025', clientVersion: 'test' })
    )

    await expect(deleteInvite({ id: 'affiliate-invite' })).resolves.toMatchObject({ success: false, code: 'NOT_FOUND' })
    expect(prismaMock.invite.delete).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'affiliate-invite', kind: 'ADMIN' } }))
  })

  it('refuses an empty id', async () => {
    await expect(deleteInvite({ id: '' })).resolves.toMatchObject({ success: false, code: 'VALIDATION' })
  })
})
