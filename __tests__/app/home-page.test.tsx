/**
 * The home page decides Rewind eligibility on the server and hands it, through
 * the real UserDashboard, to the Rewind card (P0.17: RWP-08, FR-48).
 *
 * Eligibility is asked with the session's member id and the `plexUserId` from
 * the database row, and the first-watch date is read only for a member with a
 * Plex identity. The dashboard's other cards are stubbed, and the Rewind card
 * is a stub that records its props.
 */

import { render, screen } from '@testing-library/react'
import { getServerSession } from 'next-auth'

import Home from '@/app/(app)/page'
import { WrappedCard } from '@/components/dashboard/wrapped-card'
import { getFirstWatchDate } from '@/lib/connections/tautulli-first-watch'
import { prisma } from '@/lib/prisma'
import { getRewindEligibility } from '@/lib/wrapped/eligibility'
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
  getActiveAnnouncements: jest.fn(async () => []),
}))

jest.mock('@/actions/prometheus-status', () => ({
  getPrometheusStatus: jest.fn(async () => undefined),
}))

jest.mock('@/lib/connections/tautulli-first-watch', () => ({
  getFirstWatchDate: jest.fn(),
}))

jest.mock('@/lib/wrapped/eligibility', () => ({
  getRewindEligibility: jest.fn(),
}))

jest.mock('@/components/dashboard/wrapped-card', () => ({
  WrappedCard: jest.fn(() => <div data-testid="wrapped-card-stub" />),
}))

jest.mock('@/components/dashboard/announcements-card', () => ({ AnnouncementsCard: () => null }))
jest.mock('@/components/dashboard/discord-card', () => ({ DiscordCard: () => null }))
jest.mock('@/components/dashboard/media-server-link-card', () => ({ MediaServerLinkCard: () => null }))
jest.mock('@/components/dashboard/requests-card', () => ({ RequestsCard: () => null }))
jest.mock('@/components/dashboard/status-background', () => ({ StatusFooter: () => null }))
jest.mock('@/components/watchlist/sync-settings-card', () => ({ WatchlistSyncCard: () => null }))
jest.mock('@/components/auth/service-sign-in-toggle', () => ({ ServiceSignInToggle: () => null }))
jest.mock('@/components/subscription/subscription-status-view', () => ({ SubscriptionStatusView: () => null }))

const CREATED_AT = new Date('2026-01-15T10:00:00.000Z')

function signInWith(user: { plexUserId: string | null; primaryAuthService: 'plex' | 'jellyfin' }) {
  ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'user-1', isAdmin: false } })
  ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({
    onboardingStatus: { plex: true, jellyfin: true },
    primaryAuthService: user.primaryAuthService,
    createdAt: CREATED_AT,
    plexUserId: user.plexUserId,
    jellyfinUserId: user.primaryAuthService === 'jellyfin' ? 'jf-1' : null,
  })
}

/** The props the Rewind card was last rendered with. */
function wrappedCardProps() {
  const calls = (WrappedCard as unknown as jest.Mock).mock.calls
  return calls[calls.length - 1][0]
}

describe('Home page Rewind eligibility', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue({ name: 'Test Plex', url: 'https://plex.example.com' })
    ;(prisma.jellyfinServer.findFirst as jest.Mock).mockResolvedValue(null)
    ;(prisma.discordIntegration.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.overseerr.findFirst as jest.Mock).mockResolvedValue(null)
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue(null)
  })

  it("asks with the member's id and plexUserId and hands the answer to the Rewind card", async () => {
    signInWith({ plexUserId: '4242', primaryAuthService: 'plex' })
    ;(getFirstWatchDate as jest.Mock).mockResolvedValue({
      success: true,
      firstWatchDate: '2021-03-04T00:00:00.000Z',
    })
    ;(getRewindEligibility as jest.Mock).mockResolvedValue({ eligible: false, reason: 'NO_TAUTULLI_MATCH' })

    render(await Home())

    expect(getRewindEligibility).toHaveBeenCalledTimes(1)
    expect(getRewindEligibility).toHaveBeenCalledWith({ id: 'user-1', plexUserId: '4242' })
    expect(getFirstWatchDate).toHaveBeenCalledWith('4242')
    expect(screen.getByTestId('wrapped-card-stub')).toBeInTheDocument()
    expect(wrappedCardProps()).toEqual({
      userId: 'user-1',
      memberSince: '2021-03-04T00:00:00.000Z',
      rewindEligibility: { eligible: false, reason: 'NO_TAUTULLI_MATCH' },
    })
  })

  it('asks for a Jellyfin-only member with no plexUserId, and reads no first-watch date', async () => {
    signInWith({ plexUserId: null, primaryAuthService: 'jellyfin' })
    ;(getRewindEligibility as jest.Mock).mockResolvedValue({ eligible: false, reason: 'NO_PLEX_IDENTITY' })

    render(await Home())

    expect(getRewindEligibility).toHaveBeenCalledWith({ id: 'user-1', plexUserId: null })
    expect(getFirstWatchDate).not.toHaveBeenCalled()
    expect(wrappedCardProps()).toEqual({
      userId: 'user-1',
      memberSince: CREATED_AT.toISOString(),
      rewindEligibility: { eligible: false, reason: 'NO_PLEX_IDENTITY' },
    })
  })

  it('hands an eligible answer through for a Jellyfin sign-in with a linked Plex identity', async () => {
    signInWith({ plexUserId: '4242', primaryAuthService: 'jellyfin' })
    ;(getFirstWatchDate as jest.Mock).mockResolvedValue({ success: false })
    ;(getRewindEligibility as jest.Mock).mockResolvedValue({ eligible: true })

    render(await Home())

    expect(getRewindEligibility).toHaveBeenCalledWith({ id: 'user-1', plexUserId: '4242' })
    expect(wrappedCardProps().rewindEligibility).toEqual({ eligible: true })
  })
})
