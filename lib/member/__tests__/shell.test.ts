import { mockReset } from 'jest-mock-extended'

import { buildUser } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { getAppShellData, initialsFor } from '@/lib/member/shell'
import { requestRewindCardModel, type RewindCardModel } from '@/lib/rewind/home-card'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/brand', () => ({ serverName: jest.fn().mockResolvedValue('Northfield Plex') }))
jest.mock('@/lib/rewind/home-card', () => ({ requestRewindCardModel: jest.fn() }))

const cardModel = jest.mocked(requestRewindCardModel)
const settings = { timeZone: 'America/Chicago', locale: 'en-US' }
const model = (state: RewindCardModel['state'], archive: RewindCardModel['archive'] = []): RewindCardModel => ({
  state,
  archive,
  name: 'Northfield Plex Rewind 2026',
  settings,
})

type Integration = Awaited<ReturnType<typeof prismaMock.discordIntegration.findUnique>>
type Connection = Awaited<ReturnType<typeof prismaMock.discordConnection.findUnique>>

function setup({ card = null as RewindCardModel | null, discord = 'off' as 'off' | 'on' | 'linked' } = {}) {
  cardModel.mockResolvedValue(card)
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
  it('hides Rewind when the home card resolves to nothing', async () => {
    setup()
    await expect(labels()).resolves.toEqual(['Home', 'Help'])
    expect(cardModel).toHaveBeenCalledWith('u1', false)
  })

  it('shows Rewind for the card year when there is something to open', async () => {
    setup({ card: model({ kind: 'generating', year: 2026 }) })
    await expect(labels({ id: 'u1', isAdmin: true })).resolves.toEqual(['Home', 'Rewind 2026', 'Help'])
    expect(cardModel).toHaveBeenCalledWith('u1', true)
  })

  it('opens the newest past year before the season, and hides Rewind with no past year', async () => {
    const teaser = { kind: 'before-season', year: 2026, opensOn: new Date('2026-12-01T06:00:00Z'), lastYear: 2025 } as const
    setup({ card: model(teaser, [{ year: 2025, ink: 'marigold', status: 'watched' }]) })
    await expect(labels()).resolves.toEqual(['Home', 'Rewind 2025', 'Help'])

    setup({ card: model({ ...teaser, lastYear: null }) })
    await expect(labels()).resolves.toEqual(['Home', 'Help'])
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

describe('getAppShellData admin area', () => {
  it.each([
    ['an admin', { isAdmin: true }, true],
    ['the Support role', { isAdmin: false, role: 'support' }, true],
    ['a member', { isAdmin: false, role: null }, false],
  ] as const)('links %s to the admin area: %p', async (_label, subject, adminArea) => {
    setup()
    expect((await getAppShellData({ id: 'u1', ...subject })).user.adminArea).toBe(adminArea)
  })
})

describe('getAppShellData membership', () => {
  it('adds Membership to the nav and the account menu when Stripe is on', async () => {
    setup()
    prismaMock.config.findUnique.mockResolvedValue({ stripeEnabled: true } as Awaited<ReturnType<typeof prismaMock.config.findUnique>>)
    const shell = await getAppShellData({ id: 'u1', isAdmin: false })

    expect(shell.nav.map((item) => item.label)).toEqual(['Home', 'Membership', 'Help'])
    expect(shell.user.membership).toBe(true)
  })

  it('keeps Membership for a past subscriber after Stripe is turned off', async () => {
    setup()
    prismaMock.subscription.findUnique.mockResolvedValue({ id: 's1' } as Awaited<ReturnType<typeof prismaMock.subscription.findUnique>>)

    expect((await getAppShellData({ id: 'u1', isAdmin: false })).user.membership).toBe(true)
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
