/**
 * The admin invites reads (P10.1): each status filter's `where` (a field
 * reference for used up), the search and server filters, the sorts, and no
 * token in what the detail read returns (P0.18, SEC-18).
 */

import { mockReset } from 'jest-mock-extended'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { assertNoSecretKeys } from '@/__tests__/utils/assert-no-secret-keys'
import { applyPrismaShape } from '@/__tests__/utils/prisma-shape'
import { INVITEE_PLEX_AUTH_TOKEN, makePrismaInviteWithUsages } from '@/__tests__/utils/test-builders'
import { inviteStatus, parseInviteFilter } from '@/lib/admin/invites/filter'
import { getInviteDetail, inviteStatusWhere, listInvites } from '@/lib/admin/invites/queries'
import { publicUserSelect } from '@/lib/dto/user'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/invites/pass', () => ({
  invitePassSelect: { code: true, serverType: true, maxUses: true, useCount: true, expiresAt: true, createdBy: true },
}))

const NOW = new Date('2026-10-22T12:00:00Z')
const notExpired = { OR: [{ expiresAt: null }, { expiresAt: { gte: NOW } }] }

beforeEach(() => {
  mockReset(prismaMock)
  jest.useFakeTimers({ now: NOW })
})

afterEach(() => jest.useRealTimers())

describe('inviteStatusWhere', () => {
  const maxUses = () => prismaMock.invite.fields.maxUses

  it('reads expired as a past expiry', () => {
    expect(inviteStatusWhere('expired', NOW)).toEqual({ kind: 'ADMIN', expiresAt: { lt: NOW } })
  })

  it('compares the two columns through a field reference for used up', () => {
    const where = inviteStatusWhere('usedUp', NOW)
    expect(where).toEqual({ kind: 'ADMIN', AND: [notExpired, { useCount: { gte: maxUses() } }] })
  })

  it('reads active as neither expired nor used up', () => {
    expect(inviteStatusWhere('active', NOW)).toEqual({ kind: 'ADMIN', AND: [notExpired, { useCount: { lt: maxUses() } }] })
  })

  it('adds only the admin kind for all, so no affiliate invite is listed or counted', () => {
    expect(inviteStatusWhere('all', NOW)).toEqual({ kind: 'ADMIN' })
  })
})

describe('parseInviteFilter and inviteStatus', () => {
  it('defaults every filter to all and drops unknown values', () => {
    expect(parseInviteFilter({})).toEqual({ q: '', status: 'all', server: 'all' })
    expect(parseInviteFilter({ status: 'revoked', server: 'emby', q: '  audit ' })).toEqual({ q: 'audit', status: 'all', server: 'all' })
    expect(parseInviteFilter({ status: 'usedUp', server: ['jellyfin', 'plex'] })).toMatchObject({ status: 'usedUp', server: 'jellyfin' })
  })

  it('reads expired before used up', () => {
    const past = new Date('2026-01-01T00:00:00Z')
    expect(inviteStatus({ expiresAt: past, useCount: 5, maxUses: 5 }, NOW)).toBe('expired')
    expect(inviteStatus({ expiresAt: null, useCount: 5, maxUses: 5 }, NOW)).toBe('usedUp')
    expect(inviteStatus({ expiresAt: null, useCount: 4, maxUses: 5 }, NOW)).toBe('active')
  })
})

describe('listInvites', () => {
  it('combines the filters, searches the upper-cased code and pages with a stable order', async () => {
    prismaMock.invite.count.mockResolvedValueOnce(30).mockResolvedValueOnce(42)
    prismaMock.invite.findMany.mockResolvedValue([])

    const result = await listInvites({ q: 'audit', status: 'expired', server: 'jellyfin', page: 2, pageSize: 25, sort: { id: 'code', desc: false } })

    const where = { AND: [{ kind: 'ADMIN', expiresAt: { lt: NOW } }, { serverType: 'JELLYFIN' }, { code: { contains: 'AUDIT' } }] }
    expect(prismaMock.invite.count).toHaveBeenNthCalledWith(1, { where })
    expect(prismaMock.invite.count).toHaveBeenNthCalledWith(2, { where: { kind: 'ADMIN' } })
    expect(prismaMock.invite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, orderBy: [{ code: 'asc' }, { id: 'asc' }], skip: 25, take: 25 })
    )
    expect(result).toEqual({ rows: [], total: 30, all: 42 })
  })

  it('clamps a page past the end and sorts expiry with never last', async () => {
    prismaMock.invite.count.mockResolvedValue(3)
    prismaMock.invite.findMany.mockResolvedValue([])

    await listInvites({ q: '', status: 'all', server: 'all', page: 9, pageSize: 25, sort: { id: 'expires', desc: false } })

    expect(prismaMock.invite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }], skip: 0 })
    )
  })

  it('selects only the row columns and adds each status', async () => {
    prismaMock.invite.count.mockResolvedValue(1)
    prismaMock.invite.findMany.mockImplementation(((args: Parameters<typeof applyPrismaShape>[1]) =>
      Promise.resolve([applyPrismaShape(makePrismaInviteWithUsages({ useCount: 5 }), args)])) as never)

    const { rows } = await listInvites({ q: '', status: 'all', server: 'all', page: 1, pageSize: 25, sort: { id: 'created', desc: true } })

    expect(rows).toEqual([
      {
        id: 'invite-1',
        code: 'TESTCODE',
        serverType: 'PLEX',
        useCount: 5,
        maxUses: 5,
        expiresAt: new Date('2099-12-31T00:00:00Z'),
        createdAt: new Date('2026-10-01T00:00:00Z'),
        status: 'usedUp',
      },
    ])
  })
})

describe('getInviteDetail', () => {
  it('returns the usages with only public user fields, newest first', async () => {
    prismaMock.invite.findUnique.mockImplementation(((args: Parameters<typeof applyPrismaShape>[1]) =>
      Promise.resolve(applyPrismaShape(makePrismaInviteWithUsages(), args))) as never)

    const detail = await getInviteDetail('invite-1')

    const args = prismaMock.invite.findUnique.mock.calls[0][0]
    expect(args.where).toEqual({ id: 'invite-1', kind: 'ADMIN' })
    expect(args.select?.usages).toEqual({
      select: { id: true, usedAt: true, user: { select: publicUserSelect } },
      orderBy: { usedAt: 'desc' },
    })
    const serialised = JSON.stringify(detail)
    expect(serialised).not.toContain('plexAuthToken')
    expect(serialised).not.toContain(INVITEE_PLEX_AUTH_TOKEN)
    assertNoSecretKeys(JSON.parse(serialised))
    expect(detail?.status).toBe('active')
    expect(Object.keys(detail?.usages[0].user ?? {}).sort()).toEqual(['email', 'id', 'image', 'name'])
  })

  it('returns null for a missing invite', async () => {
    prismaMock.invite.findUnique.mockResolvedValue(null)

    await expect(getInviteDetail('missing')).resolves.toBeNull()
  })
})
