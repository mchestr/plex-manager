/**
 * The /discord/link page loads the member's link status and renders the
 * checklist with only non-secret integration fields (P1.1, P6.11, UI-01).
 */

import { render, screen } from '@testing-library/react'
import { mockReset } from 'jest-mock-extended'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { buildUser } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import DiscordLinkPage from '@/app/(app)/discord/link/page'
import { getDiscordIntegration, getDiscordLinkStatus } from '@/lib/discord/integration'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/brand', () => ({ serverName: jest.fn().mockResolvedValue('Northfield Plex') }))

jest.mock('next/navigation', () => ({
  redirect: jest.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))

jest.mock('@/lib/discord/integration', () => ({
  getDiscordLinkStatus: jest.fn(),
  getDiscordIntegration: jest.fn(),
}))

const checklistProps: Record<string, unknown>[] = []
jest.mock('@/components/discord/link-checklist', () => ({
  DiscordLinkChecklist: (props: Record<string, unknown>) => {
    checklistProps.push(props)
    return <div data-testid="discord-link-panel" data-connect-url={String(props.connectUrl)} />
  },
}))

const mockSession = getServerSession as jest.Mock
const mockStatus = getDiscordLinkStatus as jest.Mock
const mockIntegration = getDiscordIntegration as jest.Mock

const integrationRow = {
  id: 'discord',
  isEnabled: true,
  clientId: 'client-id-value',
  clientSecret: 'client-secret-value',
  botToken: 'bot-token-value',
  guildId: 'guild-1',
  serverInviteCode: 'invite123',
  instructions: 'Say hi in #general',
  platformName: 'Plex Wrapped',
}

describe('DiscordLinkPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockReset(prismaMock)
    checklistProps.length = 0
    mockStatus.mockResolvedValue({ isEnabled: true, connection: null, isOnServer: null })
    mockIntegration.mockResolvedValue(integrationRow)
    prismaMock.user.findUnique.mockResolvedValue(
      buildUser({ id: 'user-1', plexUserId: 'plex-1', email: 'morgan@mail.example', name: 'Morgan' })
    )
  })

  it('redirects to the home page without a session', async () => {
    mockSession.mockResolvedValue(null)

    await expect(DiscordLinkPage()).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/')
    expect(mockStatus).not.toHaveBeenCalled()
  })

  it('renders the checklist with the fixed connect URL and the Plex account', async () => {
    mockSession.mockResolvedValue({ user: { id: 'user-1' } })

    render(await DiscordLinkPage())

    expect(mockStatus).toHaveBeenCalledWith('user-1')
    expect(mockIntegration).toHaveBeenCalledWith(true)
    // The (app) layout renders the route's one main#main (P3.2).
    expect(screen.queryByRole('main')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Link your Discord account' })).toBeInTheDocument()
    expect(screen.getByText(/Member role in the Northfield Plex Discord/)).toBeInTheDocument()
    expect(screen.getByTestId('discord-link-panel')).toHaveAttribute(
      'data-connect-url',
      '/discord/connect?redirect=%2Fdiscord%2Flink'
    )
    expect(checklistProps[0]).toMatchObject({
      isEnabled: true,
      connection: null,
      plexAccount: 'morgan@mail.example',
      serverName: 'Northfield Plex',
      instructions: 'Say hi in #general',
      serverInviteCode: 'invite123',
    })
  })

  it('passes no Plex account for a member without a Plex link', async () => {
    mockSession.mockResolvedValue({ user: { id: 'user-1' } })
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'user-1', plexUserId: null }))

    render(await DiscordLinkPage())

    expect(checklistProps[0]).toMatchObject({ plexAccount: null })
  })

  it('serializes no secret integration field into the checklist props', async () => {
    mockSession.mockResolvedValue({ user: { id: 'user-1' } })

    render(await DiscordLinkPage())

    const serialized = JSON.stringify(checklistProps)
    for (const leaked of ['clientSecret', 'clientId', 'botToken', 'client-secret-value', 'client-id-value', 'bot-token-value']) {
      expect(serialized).not.toContain(leaked)
    }
  })

  it('passes null integration fields when no integration is configured', async () => {
    mockSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockStatus.mockResolvedValue({ isEnabled: false, connection: null, isOnServer: null })
    mockIntegration.mockResolvedValue(null)

    render(await DiscordLinkPage())

    expect(checklistProps[0]).toMatchObject({ isEnabled: false, instructions: null, serverInviteCode: null })
  })
})
