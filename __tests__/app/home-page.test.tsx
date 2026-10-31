/**
 * The home page resolves the RewindCard on the server (P6.9, P10.21) inside
 * HomePage: the session's member id and admin flag go to the card resolver,
 * and a null model renders no card. The loaders are stubbed, and the card is
 * a stub that records its props. The heading order is h1, then h2s.
 */

import { render, screen } from '@testing-library/react'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import Home from '@/app/(app)/page'
import { MemberPass } from '@/components/auth/member-pass'
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
    service: 'plex',
    announcements: [],
    announcementsSeenAt: null,
    quickLinks: { media: [{ service: 'plex', serverName: 'Test Plex', url: null }], requestsUrl: null, discord: null },
    watchlist: null,
    hasSubscription: false,
    supportChannelUrl: null,
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
jest.mock('@/components/auth/member-pass', () => ({
  MemberPass: jest.fn(() => <div data-testid="member-pass-stub" />),
}))

const MODEL: RewindCardModel = {
  state: { kind: 'not-started', year: 2026 },
  archive: [],
  name: 'Northfield Plex Rewind 2026',
  settings: { timeZone: 'America/Chicago', locale: 'en-US' },
}

const props = (query: Record<string, string | string[]> = {}) => ({ searchParams: Promise.resolve(query) })

function signIn(isAdmin = false) {
  ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'user-1', isAdmin } })
}

// The page streams the home behind a Suspense skeleton; render the async child directly.
async function renderHome() {
  const page = await Home(props())
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
    const page = await Home(props())
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

describe('Home page signed out', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getServerSession as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue({ name: 'Test Plex', url: 'https://plex.example.com' })
    ;(prisma.jellyfinServer.findFirst as jest.Mock).mockResolvedValue(null)
    ;(prisma.discordIntegration.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.overseerr.findFirst as jest.Mock).mockResolvedValue(null)
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue(null)
  })

  const passProps = () => jest.mocked(MemberPass).mock.calls.at(-1)?.[0]

  it('renders the member pass with the options that are configured', async () => {
    render(await Home(props()))

    expect(screen.getByTestId('member-pass-stub')).toBeInTheDocument()
    expect(passProps()).toMatchObject({ plex: true, jellyfin: false, callbackUrl: undefined })
  })

  it('hands a same-origin callbackUrl to the pass', async () => {
    render(await Home(props({ callbackUrl: '/admin' })))

    expect(passProps()?.callbackUrl).toBe('/admin')
  })

  it.each(['https://evil.example/admin', '//evil.example', '/\\evil.example', 'javascript:alert(1)'])(
    'drops the off-site callbackUrl %s',
    async (callbackUrl) => {
      render(await Home(props({ callbackUrl })))

      expect(passProps()?.callbackUrl).toBeUndefined()
    }
  )

  it('shows a StatusScreen when no media server is configured', async () => {
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(null)

    render(await Home(props()))

    expect(screen.getByTestId('status-screen')).toBeInTheDocument()
    expect(screen.queryByTestId('member-pass-stub')).not.toBeInTheDocument()
  })
})

describe('Home page callbackUrl when signed in', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    signIn(true)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue({ name: 'Test Plex', url: 'https://plex.example.com' })
    ;(prisma.jellyfinServer.findFirst as jest.Mock).mockResolvedValue(null)
    ;(prisma.discordIntegration.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.overseerr.findFirst as jest.Mock).mockResolvedValue(null)
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue(null)
    jest.mocked(requestRewindCardModel).mockResolvedValue(null)
  })

  it('follows a same-origin callbackUrl', async () => {
    await expect(Home(props({ callbackUrl: '/admin' }))).rejects.toThrow('NEXT_REDIRECT /admin')
  })

  it('stays home for an off-site callbackUrl', async () => {
    await expect(Home(props({ callbackUrl: 'https://evil.example' }))).resolves.toBeDefined()

    expect(redirect).not.toHaveBeenCalled()
  })
})
