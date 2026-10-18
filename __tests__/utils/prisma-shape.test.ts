import { applyPrismaShape } from '@/__tests__/utils/prisma-shape'
import { makePrismaInviteWithUsages, INVITEE_PLEX_AUTH_TOKEN } from '@/__tests__/utils/test-builders'

describe('applyPrismaShape', () => {
  const invite = makePrismaInviteWithUsages()

  it('returns only scalar columns when no relation is asked for', () => {
    const result = applyPrismaShape(invite, { orderBy: { createdAt: 'desc' } })

    expect(result).not.toHaveProperty('usages')
    expect(result).toMatchObject({ id: 'invite-1', code: 'TESTCODE', expiresAt: invite.expiresAt })
  })

  it('returns every scalar of a relation set to true, as Prisma does', () => {
    const result = applyPrismaShape(invite, { include: { usages: { include: { user: true } } } })

    expect(result.usages).toEqual([
      expect.objectContaining({ id: 'usage-1', user: expect.objectContaining({ plexAuthToken: INVITEE_PLEX_AUTH_TOKEN }) }),
    ])
  })

  it('keeps only the selected fields of a nested select', () => {
    const result = applyPrismaShape(invite, {
      include: { usages: { include: { user: { select: { id: true, name: true } } }, orderBy: { usedAt: 'desc' } } },
    })

    expect(result.usages).toEqual([
      {
        id: 'usage-1',
        inviteId: 'invite-1',
        userId: 'user-1',
        usedAt: invite.usages[0].usedAt,
        user: { id: 'user-1', name: 'Invited Member' },
      },
    ])
  })

  it('applies a top-level select and skips fields set to false', () => {
    expect(applyPrismaShape(invite, { select: { id: true, code: false, usages: { select: { id: true } } } })).toEqual({
      id: 'invite-1',
      usages: [{ id: 'usage-1' }],
    })
  })
})
