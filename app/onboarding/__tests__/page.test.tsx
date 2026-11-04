/**
 * /onboarding gives a member the Plex guides, named after the server.
 */

import { render, screen } from '@testing-library/react'
import { mockReset } from 'jest-mock-extended'
import { getServerSession } from 'next-auth'

import { buildConfig, buildUser } from '@/__tests__/helpers/factories'
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
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ rewindEnabled: false }))
})

describe('OnboardingPage', () => {
  it('gives a Plex member the Plex guides', async () => {
    await renderFor({ plexUserId: 'plex-1', primaryAuthService: 'plex' })

    expect(screen.getByTestId('onboarding-service-plex')).toBeInTheDocument()
    expect(screen.getByTestId('onboarding-wizard-subheading')).toHaveTextContent('Northfield Plex')
  })
})
