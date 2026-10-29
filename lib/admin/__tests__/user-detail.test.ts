/**
 * @jest-environment node
 */

/**
 * The user detail header's service fields (P11.10): the linked services, the
 * member's own service, and their Jellyfin access read live.
 */

import { mockReset } from 'jest-mock-extended'

import { buildJellyfinServer, buildUser } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { getUserDetailHeader } from '@/lib/admin/user-detail'
import { getJellyfinUserById } from '@/lib/connections/jellyfin-users'

jest.mock('server-only', () => ({}))
jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/connections/jellyfin-users', () => ({ getJellyfinUserById: jest.fn() }))
jest.mock('@/lib/connections/plex', () => ({ checkUserServerAccess: jest.fn() }))
jest.mock('@/lib/admin/active-runs', () => ({ activeRunStarts: jest.fn(async () => new Map()) }))

const JELLYFIN_MEMBER = { ...buildUser({ id: 'jf-member', plexUserId: null, jellyfinUserId: 'jf-1', primaryAuthService: 'jellyfin' }), subscription: null, plexWrapped: [], discordConnection: null, affiliateJoin: null }

function jellyfinAnswers(result: Awaited<ReturnType<typeof getJellyfinUserById>>) {
  jest.mocked(getJellyfinUserById).mockResolvedValue(result)
}

const user = (disabled: boolean) => ({ Id: 'jf-1', Name: 'jo', HasPassword: true, HasConfiguredPassword: true, Policy: { IsAdministrator: false, IsDisabled: disabled } })

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  prismaMock.user.findUnique.mockResolvedValue(JELLYFIN_MEMBER)
  prismaMock.plexServer.findFirst.mockResolvedValue(null)
  prismaMock.jellyfinServer.findFirst.mockResolvedValue(buildJellyfinServer())
  prismaMock.config.findUnique.mockResolvedValue(null)
})

describe('getUserDetailHeader: services', () => {
  it("gives a Jellyfin member's services, ID and enabled access", async () => {
    jellyfinAnswers({ success: true, data: user(false) })

    await expect(getUserDetailHeader('jf-member', 2026)).resolves.toMatchObject({
      jellyfinUserId: 'jf-1',
      services: ['jellyfin'],
      primaryService: 'jellyfin',
      jellyfinStatus: 'enabled',
    })
    expect(getJellyfinUserById).toHaveBeenCalledWith(expect.objectContaining({ url: 'http://jellyfin.example.com:8096', apiKey: 'jellyfin-api-key' }), 'jf-1')
  })

  it.each([
    ['disabled', { success: true, data: user(true) }],
    ['missing', { success: false, error: 'User not found', notFound: true }],
    ['unknown', { success: false, error: 'Error fetching user: timeout' }],
  ] as const)('reads %s access', async (status, result) => {
    jellyfinAnswers(result)
    await expect(getUserDetailHeader('jf-member', 2026)).resolves.toMatchObject({ jellyfinStatus: status })
  })

  it('names the affiliate who invited the member', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...JELLYFIN_MEMBER, affiliateJoin: { affiliate: { id: 'sam', name: 'Sam', email: null, affiliateApplications: [] } } } as never)
    await expect(getUserDetailHeader('jf-member', 2026)).resolves.toMatchObject({ invitedBy: { id: 'sam', name: 'Sam', approved: false } })
  })

  it('is unknown without an active Jellyfin server, and null for a Plex-only member', async () => {
    prismaMock.jellyfinServer.findFirst.mockResolvedValue(null)
    await expect(getUserDetailHeader('jf-member', 2026)).resolves.toMatchObject({ jellyfinStatus: 'unknown' })

    prismaMock.user.findUnique.mockResolvedValue({ ...JELLYFIN_MEMBER, plexUserId: 'plex-1', jellyfinUserId: null, primaryAuthService: 'plex' })
    await expect(getUserDetailHeader('jf-member', 2026)).resolves.toMatchObject({ services: ['plex'], primaryService: 'plex', jellyfinStatus: null })
    expect(getJellyfinUserById).not.toHaveBeenCalled()
  })
})
