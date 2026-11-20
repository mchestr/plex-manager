/**
 * Member removal's affiliate rows: the counts read applications, unused and
 * used affiliate invites and the invite the member joined with, and each key
 * has a label. `erase.pg.test.ts` covers the delete of unused invites. The
 * inventory also counts the member's media cleanup Keeps, by member id only.
 */

import { mockReset } from 'jest-mock-extended'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { countLines } from '@/lib/members/erase-copy'
import { countAffiliateRows } from '@/lib/members/erase-affiliates'
import { countInventory, type InventoryCounts } from '@/lib/members/erase-inventory'

jest.mock('server-only', () => ({}))
jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

describe('countAffiliateRows', () => {
  it('counts applications, unused and used affiliate invites, and the invite they joined with', async () => {
    prismaMock.affiliateApplication.count.mockResolvedValue(2)
    prismaMock.invite.count.mockResolvedValueOnce(3).mockResolvedValueOnce(4).mockResolvedValueOnce(1)

    await expect(countAffiliateRows('member-1')).resolves.toEqual({
      affiliateApplication: 2,
      affiliateInvite: 3,
      affiliateInviteKept: 4,
      affiliateJoinKept: 1,
    })
    expect(prismaMock.affiliateApplication.count).toHaveBeenCalledWith({ where: { userId: 'member-1' } })
    expect(prismaMock.invite.count.mock.calls.map(([args]) => args?.where)).toEqual([
      { kind: 'AFFILIATE', affiliateUserId: 'member-1', joinedAt: null },
      { kind: 'AFFILIATE', affiliateUserId: 'member-1', joinedAt: { not: null } },
      { joinedUserId: 'member-1' },
    ])
  })
})

describe('countInventory', () => {
  it("counts the member's Leaving soon keeps by member id, beside the affiliate rows", async () => {
    prismaMock.cleanupProtection.count.mockResolvedValue(2)
    prismaMock.affiliateApplication.count.mockResolvedValue(1)
    prismaMock.invite.count.mockResolvedValue(0)

    const counts = await countInventory({ userId: 'member-1', discordUserIds: [], wrappedIds: [], generationIds: [] })

    expect(counts).toMatchObject({ cleanupProtection: 2, affiliateApplication: 1, affiliateInvite: 0 })
    expect(prismaMock.cleanupProtection.count).toHaveBeenCalledTimes(1)
    expect(prismaMock.cleanupProtection.count).toHaveBeenCalledWith({ where: { memberId: 'member-1' } })
  })
})

describe('countLines', () => {
  it('labels the affiliate rows, deleted and kept', () => {
    const counts = { affiliateApplication: 1, affiliateInvite: 2, affiliateInviteKept: 3, affiliateJoinKept: 1 } as Partial<InventoryCounts>
    const lines = countLines(counts as InventoryCounts)

    expect(lines).toEqual([
      { key: 'affiliateApplication', label: 'Affiliate applications', count: 1 },
      { key: 'affiliateInvite', label: 'Unused affiliate invites', count: 2 },
      { key: 'affiliateInviteKept', label: 'Used affiliate invites (kept, without their name)', count: 3 },
      { key: 'affiliateJoinKept', label: 'Invite they joined with (kept, date only)', count: 1 },
    ])
  })

  it('labels the Leaving soon keeps', () => {
    const counts = { userMediaMark: 1, cleanupProtection: 3 } as Partial<InventoryCounts>

    expect(countLines(counts as InventoryCounts)).toEqual([
      { key: 'userMediaMark', label: 'Marked titles', count: 1 },
      { key: 'cleanupProtection', label: 'Leaving soon keeps', count: 3 },
    ])
  })
})
