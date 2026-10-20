import { render, screen } from '@testing-library/react'
import { getServerSession } from 'next-auth'

import SubscribeSuccessPage from '@/app/subscribe/success/page'
import { prisma } from '@/lib/prisma'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

jest.mock('@/lib/brand', () => ({ serverName: jest.fn().mockResolvedValue('Northfield Plex') }))
jest.mock('next-auth/react', () => ({ signOut: jest.fn() }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }))

beforeEach(() => mockReset(prismaMock))

const mockGetServerSession = getServerSession as jest.MockedFunction<
  typeof getServerSession
>
const mockSubscriptionFindUnique = prisma.subscription.findUnique as jest.Mock

const userSession = {
  user: { id: 'user-1', name: 'User', email: 'user@test.com', isAdmin: false },
  expires: new Date(Date.now() + 86400000).toISOString(),
} as never

async function renderPage() {
  const ui = await SubscribeSuccessPage()
  return render(<>{ui}</>)
}

describe('SubscribeSuccessPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetServerSession.mockResolvedValue(userSession)
  })

  it('shows the accepted state when the invite has been accepted', async () => {
    mockSubscriptionFindUnique.mockResolvedValue({ plexInviteStatus: 'accepted' })

    await renderPage()

    expect(screen.getByTestId('subscribe-success-accepted')).toBeInTheDocument()
    // PublicShell's Sign out escape for the signed-in member (UI-37)
    expect(screen.getByTestId('public-shell-sign-out')).toBeInTheDocument()
    expect(
      screen.queryByTestId('subscribe-success-pending')
    ).not.toBeInTheDocument()
  })

  it('shows the pending state when the invite is pending acceptance', async () => {
    mockSubscriptionFindUnique.mockResolvedValue({ plexInviteStatus: 'pending' })

    await renderPage()

    expect(screen.getByTestId('subscribe-success-pending')).toBeInTheDocument()
    expect(
      screen.queryByTestId('subscribe-success-accepted')
    ).not.toBeInTheDocument()
  })

  it('shows the provisioning state when the invite has only been sent', async () => {
    mockSubscriptionFindUnique.mockResolvedValue({ plexInviteStatus: 'sent' })

    await renderPage()

    expect(
      screen.getByTestId('subscribe-success-provisioning')
    ).toBeInTheDocument()
  })

  it('shows the provisioning state when there is no subscription row yet', async () => {
    mockSubscriptionFindUnique.mockResolvedValue(null)

    await renderPage()

    expect(
      screen.getByTestId('subscribe-success-provisioning')
    ).toBeInTheDocument()
  })

  it('shows the provisioning state when unauthenticated (no session)', async () => {
    mockGetServerSession.mockResolvedValue(null)

    await renderPage()

    expect(
      screen.getByTestId('subscribe-success-provisioning')
    ).toBeInTheDocument()
    expect(mockSubscriptionFindUnique).not.toHaveBeenCalled()
    expect(screen.queryByTestId('public-shell-sign-out')).not.toBeInTheDocument()
  })
})
