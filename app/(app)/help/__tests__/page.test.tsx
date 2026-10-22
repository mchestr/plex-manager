/**
 * The /help page (P10.22, UI-30, UI-34): the guides for the member's own
 * service, the requests guide only with a public URL, and no admin hints.
 */

import { render, screen } from '@testing-library/react'
import { mockReset } from 'jest-mock-extended'
import { getServerSession } from 'next-auth'

import { buildUser } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import HelpPage from '@/app/(app)/help/page'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/brand', () => ({ serverName: jest.fn().mockResolvedValue('Northfield Plex') }))
jest.mock('next/navigation', () => ({
  redirect: jest.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))

type Overseerr = Awaited<ReturnType<typeof prismaMock.overseerr.findFirst>>
type Integration = Awaited<ReturnType<typeof prismaMock.discordIntegration.findUnique>>
type Jellyfin = Awaited<ReturnType<typeof prismaMock.jellyfinServer.findFirst>>

function setup({ service = 'plex' as 'plex' | 'jellyfin', publicUrl = null as string | null, discord = false } = {}) {
  prismaMock.user.findUnique.mockResolvedValue(
    buildUser(service === 'jellyfin' ? { primaryAuthService: 'jellyfin', plexUserId: null, jellyfinUserId: 'jf-1' } : {})
  )
  prismaMock.overseerr.findFirst.mockResolvedValue({ publicUrl } as Overseerr)
  prismaMock.jellyfinServer.findFirst.mockResolvedValue({ name: 'Basement Jellyfin' } as Jellyfin)
  prismaMock.discordIntegration.findUnique.mockResolvedValue(
    (discord
      ? {
          isEnabled: true,
          clientId: 'id',
          clientSecret: 'secret',
          guildId: 'g1',
          supportChannelId: 'c1',
          serverInviteCode: 'abc',
          instructions: null,
        }
      : null) as Integration
  )
  prismaMock.discordConnection.findUnique.mockResolvedValue(null)
}

beforeEach(() => {
  jest.clearAllMocks()
  mockReset(prismaMock)
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: 'member-1' } })
})

describe('HelpPage', () => {
  it('gives a Jellyfin member Jellyfin steps that never say Plex', async () => {
    setup({ service: 'jellyfin', publicUrl: 'https://requests.example.com', discord: true })

    const { container } = render(await HelpPage())

    expect(screen.getByTestId('playback-guide')).toHaveTextContent('Jellyfin')
    expect(container).toHaveTextContent('Basement Jellyfin')
    expect(container.textContent).not.toMatch(/plex/i)
  })

  it('renders the sections at their anchors, with the support channel and invite', async () => {
    setup({ publicUrl: 'https://requests.example.com', discord: true })

    const { container } = render(await HelpPage())

    expect(container.querySelector('#playback')).not.toBeNull()
    expect(container.querySelector('#requests')).not.toBeNull()
    expect(container.querySelector('#support')).not.toBeNull()
    expect(screen.getByTestId('requests-guide-link')).toHaveAttribute('href', 'https://requests.example.com/')
    expect(screen.getByTestId('support-guide-channel')).toHaveAttribute('href', 'https://discord.com/channels/g1/c1')
    expect(screen.getByTestId('support-guide-join')).toHaveAttribute('href', 'https://discord.gg/abc')
    expect(screen.getByTestId('support-guide-link-discord')).toHaveAttribute('href', '/discord/link')
  })

  it('hides the requests guide without a public URL, and Discord when it is off', async () => {
    setup()

    const { container } = render(await HelpPage())

    expect(container.querySelector('#requests')).toBeNull()
    expect(screen.queryByTestId('requests-guide')).not.toBeInTheDocument()
    expect(screen.queryByTestId('support-guide-discord')).not.toBeInTheDocument()
    expect(screen.getByTestId('support-guide')).toHaveTextContent('Include the title')
  })

  it('never shows admin hints', async () => {
    setup({ publicUrl: 'https://requests.example.com', discord: true })

    const { container } = render(await HelpPage())

    expect(container.textContent).not.toMatch(/Admin\s*>/)
    expect(container.textContent).not.toMatch(/overseerr/i)
  })
})
