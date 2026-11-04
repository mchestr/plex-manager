/**
 * @jest-environment node
 */

/**
 * The user detail header's service fields (P11.10): the linked services, the
 * member's own service, and who invited them.
 */

import { mockReset } from 'jest-mock-extended'

import { buildUser } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { getUserDetailHeader } from '@/lib/admin/user-detail'

jest.mock('server-only', () => ({}))
jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/connections/plex', () => ({ checkUserServerAccess: jest.fn() }))
jest.mock('@/lib/admin/active-runs', () => ({ activeRunStarts: jest.fn(async () => new Map()) }))

const MEMBER = { ...buildUser({ id: 'member-1', plexUserId: 'plex-1', primaryAuthService: 'plex' }), subscription: null, plexWrapped: [], discordConnection: null, affiliateJoin: null }

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  prismaMock.user.findUnique.mockResolvedValue(MEMBER)
  prismaMock.plexServer.findFirst.mockResolvedValue(null)
  prismaMock.config.findUnique.mockResolvedValue(null)
})

describe('getUserDetailHeader: services', () => {
  it("gives a Plex member's services", async () => {
    await expect(getUserDetailHeader('member-1', 2026)).resolves.toMatchObject({ services: ['plex'], primaryService: 'plex', plexAccess: 'unknown' })
  })

  it('lists no service for a member without a Plex account', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...MEMBER, plexUserId: null })
    await expect(getUserDetailHeader('member-1', 2026)).resolves.toMatchObject({ services: [], primaryService: 'plex' })
  })

  it('names the affiliate who invited the member', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...MEMBER, affiliateJoin: { affiliate: { id: 'sam', name: 'Sam', email: null, affiliateApplications: [] } } } as never)
    await expect(getUserDetailHeader('member-1', 2026)).resolves.toMatchObject({ invitedBy: { id: 'sam', name: 'Sam', approved: false } })
  })
})
