/**
 * The /invites page: a 404 unless affiliate invites are on and the member
 * has a Plex id, and the standing from stored hours without a Tautulli read.
 */

import { render, screen } from '@testing-library/react'
import { mockReset } from 'jest-mock-extended'
import { getServerSession } from 'next-auth'
import { notFound, redirect } from 'next/navigation'

import { buildConfig, buildPlexServer, buildUser } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import InvitesPage from '@/app/(app)/invites/page'
import InvitesLoading from '@/app/(app)/invites/loading'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('next/navigation', () => ({
  ...require('@/__tests__/helpers/url-router').navigationModule,
  redirect: jest.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))
jest.mock('@/actions/affiliate', () => ({ applyForAffiliate: jest.fn(), createAffiliateInvite: jest.fn(), cancelAffiliateInvite: jest.fn() }))
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))

const SWITCH_ON = { affiliateInvitesEnabled: true, affiliateLibrarySectionIds: [1], affiliatePlexMachineId: 'machine-1', affiliateTiers: null }

beforeEach(() => {
  jest.clearAllMocks()
  mockReset(prismaMock)
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: 'member-1' } })
  prismaMock.config.findUnique.mockResolvedValue(buildConfig(SWITCH_ON))
  prismaMock.plexServer.findFirst.mockResolvedValue(buildPlexServer({ machineIdentifier: 'machine-1' }))
  prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', plexUserId: '42', watchHours: 23 }))
  prismaMock.affiliateApplication.findUnique.mockResolvedValue(null)
  prismaMock.affiliateApplication.findFirst.mockResolvedValue(null)
})

describe('InvitesPage', () => {
  it('shows the standing from the stored hours', async () => {
    render(await InvitesPage())
    expect(screen.getByRole('heading', { level: 1, name: 'Invites' })).toBeInTheDocument()
    expect(screen.getByTestId('invites-standing')).toHaveAttribute('data-state', 'below_bar')
    expect(screen.getByTestId('invites-standing')).toHaveTextContent('You had 23 h at the last check; you can apply at more than 50 h.')
  })

  it('is a 404 while the switch is off', async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ ...SWITCH_ON, affiliateInvitesEnabled: false }))
    await expect(InvitesPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalled()
  })

  it('is a 404 for a member without a Plex id', async () => {
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', plexUserId: null }))
    await expect(InvitesPage()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('sends a signed-out visitor home', async () => {
    jest.mocked(getServerSession).mockResolvedValue(null)
    await expect(InvitesPage()).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/')
  })
})

describe('InvitesLoading', () => {
  it('marks the page busy', () => {
    render(<InvitesLoading />)
    expect(screen.getByTestId('invites-loading')).toHaveAttribute('aria-busy', 'true')
  })
})
