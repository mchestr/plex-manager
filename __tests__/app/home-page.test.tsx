/**
 * The home page resolves the RewindCard on the server (P6.9) and hands it,
 * through the real UserDashboard, as a slot: the session's member id and
 * admin flag go to the card resolver, and a null model renders no card.
 * The dashboard's other cards are stubbed, and the card is a stub that
 * records its props.
 */

import { render, screen } from '@testing-library/react'
import { getServerSession } from 'next-auth'

import Home from '@/app/(app)/page'
import { RewindCard } from '@/components/dashboard/rewind-card'
import { prisma } from '@/lib/prisma'
import { requestRewindCardModel, type RewindCardModel } from '@/lib/rewind/home-card'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('next-auth/react', () => ({
  signOut: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  }),
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

jest.mock('@/actions/announcements', () => ({
  getActiveAnnouncements: jest.fn(async () => ({ success: true, data: [] })),
}))

jest.mock('@/actions/prometheus-status', () => ({
  getPrometheusStatus: jest.fn(async () => ({ success: false, code: 'INTERNAL', error: 'off' })),
}))

jest.mock('@/lib/rewind/home-card', () => ({
  requestRewindCardModel: jest.fn(),
}))

jest.mock('@/components/dashboard/rewind-card', () => ({
  RewindCard: jest.fn(() => <div data-testid="rewind-card-stub" />),
}))

jest.mock('@/components/dashboard/announcements-card', () => ({ AnnouncementsCard: () => null }))
jest.mock('@/components/dashboard/discord-card', () => ({ DiscordCard: () => null }))
jest.mock('@/components/dashboard/media-server-link-card', () => ({ MediaServerLinkCard: () => null }))
jest.mock('@/components/dashboard/requests-card', () => ({ RequestsCard: () => null }))
jest.mock('@/components/dashboard/status-background', () => ({ StatusFooter: () => null }))
jest.mock('@/components/watchlist/sync-settings-card', () => ({ WatchlistSyncCard: () => null }))
jest.mock('@/components/auth/service-sign-in-toggle', () => ({ ServiceSignInToggle: () => null }))

const MODEL: RewindCardModel = {
  state: { kind: 'not-started', year: 2026 },
  archive: [],
  name: 'Northfield Plex Rewind 2026',
  settings: { timeZone: 'America/Chicago', locale: 'en-US' },
}

function signIn(isAdmin = false) {
  ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'user-1', isAdmin } })
  ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({
    onboardingStatus: { plex: true, jellyfin: true },
    primaryAuthService: 'plex',
  })
}

describe('Home page RewindCard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue({ name: 'Test Plex', url: 'https://plex.example.com' })
    ;(prisma.jellyfinServer.findFirst as jest.Mock).mockResolvedValue(null)
    ;(prisma.discordIntegration.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.overseerr.findFirst as jest.Mock).mockResolvedValue(null)
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue(null)
  })

  it("resolves the card for the session's member and renders it with the model", async () => {
    signIn(true)
    jest.mocked(requestRewindCardModel).mockResolvedValue(MODEL)

    render(await Home())

    expect(requestRewindCardModel).toHaveBeenCalledWith('user-1', true)
    expect(screen.getByTestId('rewind-card-stub')).toBeInTheDocument()
    expect(jest.mocked(RewindCard).mock.calls.at(-1)?.[0]).toEqual(MODEL)
  })

  it('renders no card when the resolver returns null', async () => {
    signIn()
    jest.mocked(requestRewindCardModel).mockResolvedValue(null)

    render(await Home())

    expect(requestRewindCardModel).toHaveBeenCalledWith('user-1', false)
    expect(screen.queryByTestId('rewind-card-stub')).not.toBeInTheDocument()
  })
})
