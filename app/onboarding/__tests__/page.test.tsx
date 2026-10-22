/**
 * /onboarding follows the member's own service (P11.10): a Jellyfin member
 * gets the Jellyfin guides, whatever a stale stored value says, and a member
 * with both accounts gets the one they joined with.
 */

import { render, screen } from '@testing-library/react'
import { mockReset } from 'jest-mock-extended'
import { getServerSession } from 'next-auth'

import { buildConfig, buildJellyfinServer, buildUser } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import OnboardingPage from '@/app/onboarding/page'
import type { User } from '@/lib/generated/prisma/client'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/brand', () => ({ serverName: jest.fn().mockResolvedValue('Northfield Plex') }))
jest.mock('@/actions/onboarding', () => ({ completeOnboarding: jest.fn() }))
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showError: jest.fn(), showSuccess: jest.fn() }) }))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  redirect: jest.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))

async function renderFor(user: Partial<User>) {
  prismaMock.user.findUnique.mockResolvedValue(buildUser(user))
  render(await OnboardingPage({ searchParams: Promise.resolve({}) }))
}

beforeEach(() => {
  jest.clearAllMocks()
  mockReset(prismaMock)
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: 'member-1' } })
  prismaMock.overseerr.findFirst.mockResolvedValue(null)
  prismaMock.discordIntegration.findUnique.mockResolvedValue(null)
  prismaMock.discordConnection.findUnique.mockResolvedValue(null)
  prismaMock.jellyfinServer.findFirst.mockResolvedValue(buildJellyfinServer({ name: 'Basement Jellyfin' }))
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ rewindEnabled: false }))
})

describe('OnboardingPage', () => {
  it('gives a Jellyfin member the Jellyfin guides, named after the Jellyfin server', async () => {
    await renderFor({ plexUserId: null, jellyfinUserId: 'jf-1', primaryAuthService: 'jellyfin' })

    expect(screen.getByTestId('onboarding-service-jellyfin')).toBeInTheDocument()
    expect(screen.getByTestId('onboarding-wizard-subheading')).toHaveTextContent('Basement Jellyfin')
  })

  it('follows the linked account over a stale stored value', async () => {
    await renderFor({ plexUserId: null, jellyfinUserId: 'jf-1', primaryAuthService: 'plex' })

    expect(screen.getByTestId('onboarding-service-jellyfin')).toBeInTheDocument()
  })

  it('gives a member with both accounts the service they joined with', async () => {
    await renderFor({ plexUserId: 'plex-1', jellyfinUserId: 'jf-1', primaryAuthService: 'jellyfin' })
    expect(screen.getByTestId('onboarding-service-jellyfin')).toBeInTheDocument()
  })

  it('gives a Plex member the Plex guides', async () => {
    await renderFor({ plexUserId: 'plex-1', jellyfinUserId: null, primaryAuthService: 'plex' })

    expect(screen.getByTestId('onboarding-service-plex')).toBeInTheDocument()
    expect(screen.getByTestId('onboarding-wizard-subheading')).toHaveTextContent('Northfield Plex')
  })
})
