import { mockReset } from 'jest-mock-extended'

import { buildConfig, buildPlexWrapped, buildUser } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { getAppShellData, initialsFor } from '@/lib/member/shell'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/brand', () => ({ serverName: jest.fn().mockResolvedValue('Northfield Plex') }))
jest.mock('@/lib/wrapped/season', () => ({ getSeasonYear: jest.fn().mockResolvedValue(2026) }))

type Integration = Awaited<ReturnType<typeof prismaMock.discordIntegration.findUnique>>
type Connection = Awaited<ReturnType<typeof prismaMock.discordConnection.findUnique>>

function setup({
  rewindEnabled = false,
  rewindAudience = 'admins',
  completed = false,
  discord = 'off' as 'off' | 'on' | 'linked',
} = {}) {
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ rewindEnabled, rewindAudience }))
  prismaMock.plexWrapped.findFirst.mockResolvedValue(completed ? buildPlexWrapped({ status: 'completed' }) : null)
  prismaMock.user.findUnique.mockResolvedValue(buildUser({ name: 'Theo Marsh', email: 'theo@example.com' }))
  prismaMock.discordIntegration.findUnique.mockResolvedValue(
    (discord === 'off' ? null : { isEnabled: true, clientId: 'id', clientSecret: 'secret' }) as Integration
  )
  prismaMock.discordConnection.findUnique.mockResolvedValue(
    (discord === 'linked' ? { username: 'theo.marsh' } : null) as Connection
  )
}

beforeEach(() => mockReset(prismaMock))

const labels = async (session = { id: 'u1', isAdmin: false }) =>
  (await getAppShellData(session)).nav.map((item) => item.label)

describe('getAppShellData', () => {
  it('shows Rewind when the season is open to everyone', async () => {
    setup({ rewindEnabled: true, rewindAudience: 'all' })
    await expect(labels()).resolves.toEqual(['Home', 'Rewind 2026'])
  })

  it('shows Rewind to admins while the audience is admins only', async () => {
    setup({ rewindEnabled: true })
    await expect(labels()).resolves.toEqual(['Home'])
    await expect(labels({ id: 'u1', isAdmin: true })).resolves.toEqual(['Home', 'Rewind 2026'])
  })

  it('shows Rewind to a member with a completed Rewind while the season is off', async () => {
    setup({ completed: true })
    await expect(labels()).resolves.toEqual(['Home', 'Rewind 2026'])
  })

  it.each([
    ['off', undefined],
    ['on', null],
    ['linked', 'theo.marsh'],
  ] as const)('gives the Discord handle %s as %s', async (discord, handle) => {
    setup({ discord })
    const { user, serverName } = await getAppShellData({ id: 'u1', isAdmin: false })

    expect(serverName).toBe('Northfield Plex')
    expect(user).toMatchObject({ name: 'Theo Marsh', email: 'theo@example.com', initials: 'TM' })
    expect(user.discordHandle).toBe(handle)
    expect('discordHandle' in user).toBe(handle !== undefined)
  })
})

describe('initialsFor', () => {
  it.each([
    ['Theo Marsh', 'TM'],
    ['émile zola durand', 'ÉZ'],
    ['plexfan', 'P'],
    ['  ', '?'],
  ])('%j gives %s', (name, initials) => {
    expect(initialsFor(name)).toBe(initials)
  })
})
