/**
 * The home page resolves the RewindCard on the server (P6.9, P10.21) inside
 * HomePage: the session's member id and admin flag go to the card resolver,
 * and a null model renders no card. The loaders are stubbed, and the card is
 * a stub that records its props. The heading order is h1, then h2s.
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

jest.mock('@/lib/member/home-data', () => ({
  getHomeData: jest.fn(async () => ({
    serverName: 'Test Plex',
    greeting: 'Good evening, Morgan',
    since: "You've been watching on Test Plex since March 2024.",
    service: 'plex',
    announcements: [],
    announcementsSeenAt: null,
    quickLinks: { media: { service: 'plex', serverName: 'Test Plex', url: null }, requestsUrl: null, discord: null },
    watchlist: null,
    hasSubscription: false,
    supportChannelUrl: null,
    uptime: { isConfigured: false, serviceName: '', segments: [], overallStatus: 'unknown' },
    format: { timeZone: 'UTC', locale: 'en-US' },
  })),
}))

jest.mock('@/lib/rewind/home-card', () => ({
  requestRewindCardModel: jest.fn(),
}))

jest.mock('@/components/dashboard/rewind-card', () => ({
  RewindCard: jest.fn(() => <div data-testid="rewind-card-stub" />),
}))

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
}

// The page streams the home behind a Suspense skeleton; render the async child directly.
async function renderHome() {
  const page = await Home()
  const home = page.props.children
  render(await home.type(home.props))
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

    await renderHome()

    expect(requestRewindCardModel).toHaveBeenCalledWith('user-1', true)
    expect(screen.getByTestId('rewind-card-stub')).toBeInTheDocument()
    expect(jest.mocked(RewindCard).mock.calls.at(-1)?.[0]).toEqual(MODEL)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Good evening, Morgan')
  })

  it('streams the signed-in home behind the home skeleton', async () => {
    signIn()
    const page = await Home()
    render(<>{page.props.fallback}</>)

    expect(screen.getByTestId('home-skeleton')).toBeInTheDocument()
  })

  it('renders no card when the resolver returns null', async () => {
    signIn()
    jest.mocked(requestRewindCardModel).mockResolvedValue(null)

    await renderHome()

    expect(requestRewindCardModel).toHaveBeenCalledWith('user-1', false)
    expect(screen.queryByTestId('rewind-card-stub')).not.toBeInTheDocument()
  })
})
