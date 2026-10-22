/**
 * @jest-environment node
 */

/**
 * `removeMember` and `previewMemberRemoval` (P11.13): the typed name must
 * match the member's display name, the Plex server owner is refused, the
 * preview is a dry run, and the action spends its own rate limit.
 */

import { mockReset } from 'jest-mock-extended'
import { getServerSession } from 'next-auth'

import { previewMemberRemoval, removeMember } from '@/actions/admin/member-access'
import { buildUser } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { revokeServiceAccess } from '@/lib/members/access-actions'
import { countInventory, loadEraseSubject, type InventoryCounts } from '@/lib/members/erase-inventory'
import { isPlexServerOwner } from '@/lib/members/owner'
import { consume } from '@/lib/security/rate-limit'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn(), unstable_cache: (fn: () => unknown) => fn }))
jest.mock('@/lib/security/rate-limit', () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock('@/lib/members/owner', () => ({ isPlexServerOwner: jest.fn() }))
jest.mock('@/lib/discord/integration', () => ({ clearDiscordRoleForUser: jest.fn() }))
jest.mock('@/lib/members/access-actions', () => ({ revokeServiceAccess: jest.fn() }))
jest.mock('@/lib/members/erase-inventory', () => ({
  loadEraseSubject: jest.fn(),
  countInventory: jest.fn(),
  deleteInventory: jest.fn(),
}))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const MEMBER = { ...buildUser({ id: 'member-1', name: 'Morgan Lee', plexUserId: 'plex-1', isAdmin: false }), subscription: null, discordConnection: null }

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: 'admin-1', isAdmin: true }, expires: '' })
  jest.mocked(consume).mockResolvedValue({ ok: true })
  jest.mocked(isPlexServerOwner).mockResolvedValue(false)
  jest.mocked(loadEraseSubject).mockResolvedValue({ userId: 'member-1', discordUserIds: [], wrappedIds: [], generationIds: [] })
  jest.mocked(countInventory).mockResolvedValue({ user: 1 } as unknown as InventoryCounts)
  prismaMock.user.findUnique.mockResolvedValue(MEMBER as never)
  prismaMock.user.count.mockResolvedValue(2)
  prismaMock.rewindGeneration.count.mockResolvedValue(0)
})

describe('removeMember', () => {
  it('returns VALIDATION for a wrong name and touches nothing', async () => {
    const result = await removeMember({ userId: 'member-1', confirmName: 'Morgan' })

    expect(result).toMatchObject({ success: false, code: 'VALIDATION', fieldErrors: { confirmName: expect.any(Array) } })
    expect(revokeServiceAccess).not.toHaveBeenCalled()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('refuses the Plex server owner even with the right name', async () => {
    jest.mocked(isPlexServerOwner).mockResolvedValue(true)

    const result = await removeMember({ userId: 'member-1', confirmName: ' morgan lee ' })

    expect(result).toMatchObject({ success: false, code: 'OWNER', error: 'The Plex server owner cannot be removed.' })
    expect(revokeServiceAccess).not.toHaveBeenCalled()
  })

  it('spends the admin:remove-member limit per admin', async () => {
    jest.mocked(consume).mockResolvedValue({ ok: false, retryAfterSec: 60 })

    await expect(removeMember({ userId: 'member-1', confirmName: 'Morgan Lee' })).resolves.toMatchObject({ code: 'RATE_LIMITED' })
    expect(consume).toHaveBeenCalledWith('admin:remove-member', 'admin-1')
  })

  it('refuses a member caller', async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: 'member-2', isAdmin: false }, expires: '' })

    await expect(removeMember({ userId: 'member-1', confirmName: 'Morgan Lee' })).resolves.toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('previewMemberRemoval', () => {
  it('returns the dry run without any external call', async () => {
    const result = await previewMemberRemoval({ userId: 'member-1' })

    expect(result).toEqual({
      success: true,
      data: { dryRun: true, plan: { cancelStripe: false, services: ['plex'], discordLinked: false }, counts: { user: 1 }, outcome: null },
    })
    expect(revokeServiceAccess).not.toHaveBeenCalled()
  })
})
