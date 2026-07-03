import { render, screen } from '@testing-library/react'
import { getServerSession } from 'next-auth'

import { SubscriptionStatusView } from '@/components/subscription/subscription-status-view'
import { prisma } from '@/lib/prisma'

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    subscription: {
      findUnique: jest.fn(),
    },
  },
}))

// ManageSubscriptionButton (rendered inside the view) imports the server action
// and useToast; stub the action so the tree renders in isolation.
jest.mock('@/actions/subscription', () => ({
  openBillingPortal: jest.fn(),
}))

jest.mock('@/components/ui/toast', () => {
  const actual = jest.requireActual('@/components/ui/toast')
  return {
    ...actual,
    useToast: () => ({
      showToast: jest.fn(),
      showSuccess: jest.fn(),
      showError: jest.fn(),
      showInfo: jest.fn(),
    }),
  }
})

const mockGetServerSession = getServerSession as jest.MockedFunction<
  typeof getServerSession
>
const mockSubscriptionFindUnique = prisma.subscription.findUnique as jest.Mock

const userSession = {
  user: { id: 'user-1', name: 'User', email: 'user@test.com', isAdmin: false },
  expires: new Date(Date.now() + 86400000).toISOString(),
} as never

/** Renders the async server component by awaiting its returned element. */
async function renderView() {
  const ui = await SubscriptionStatusView()
  return render(<>{ui}</>)
}

describe('SubscriptionStatusView', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetServerSession.mockResolvedValue(userSession)
  })

  it('renders nothing when there is no session', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const { container } = await renderView()

    expect(container.firstChild).toBeNull()
    expect(mockSubscriptionFindUnique).not.toHaveBeenCalled()
  })

  it('renders nothing when the user has no subscription', async () => {
    mockSubscriptionFindUnique.mockResolvedValue(null)

    const { container } = await renderView()

    expect(container.firstChild).toBeNull()
  })

  it('shows plan, active status, and a renewal date', async () => {
    mockSubscriptionFindUnique.mockResolvedValue({
      status: 'ACTIVE',
      priceId: 'Plex Access Monthly',
      currentPeriodEnd: new Date('2024-03-01T00:00:00Z'),
      cancelAtPeriodEnd: false,
    })

    await renderView()

    expect(screen.getByTestId('subscription-status-view')).toBeInTheDocument()
    expect(screen.getByTestId('subscription-status-badge')).toHaveTextContent(
      'Active'
    )
    expect(screen.getByTestId('subscription-plan')).toHaveTextContent(
      'Plex Access Monthly'
    )
    expect(screen.getByTestId('subscription-period')).toHaveTextContent(/^Renews on /)
    expect(screen.getByTestId('manage-subscription-button')).toBeInTheDocument()
  })

  it('shows "Cancels on <date>" when cancelAtPeriodEnd is true', async () => {
    mockSubscriptionFindUnique.mockResolvedValue({
      status: 'ACTIVE',
      priceId: 'price_1',
      currentPeriodEnd: new Date('2024-03-01T00:00:00Z'),
      cancelAtPeriodEnd: true,
    })

    await renderView()

    expect(screen.getByTestId('subscription-period')).toHaveTextContent(/^Cancels on /)
  })

  it('falls back gracefully when the period end is absent', async () => {
    mockSubscriptionFindUnique.mockResolvedValue({
      status: 'ACTIVE',
      priceId: 'price_1',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    })

    await renderView()

    expect(screen.getByTestId('subscription-period')).toHaveTextContent(
      'Renews at the end of the current period'
    )
  })

  it('shows a past-due badge and inline warning for a PAST_DUE subscription', async () => {
    mockSubscriptionFindUnique.mockResolvedValue({
      status: 'PAST_DUE',
      priceId: 'price_1',
      currentPeriodEnd: new Date('2024-03-01T00:00:00Z'),
      cancelAtPeriodEnd: false,
    })

    await renderView()

    expect(screen.getByTestId('subscription-status-badge')).toHaveTextContent(
      'Past due'
    )
    expect(screen.getByTestId('subscription-past-due-notice')).toBeInTheDocument()
  })

  it('shows a canceled badge for a CANCELED subscription', async () => {
    mockSubscriptionFindUnique.mockResolvedValue({
      status: 'CANCELED',
      priceId: 'price_1',
      currentPeriodEnd: new Date('2024-03-01T00:00:00Z'),
      cancelAtPeriodEnd: false,
    })

    await renderView()

    expect(screen.getByTestId('subscription-status-badge')).toHaveTextContent(
      'Canceled'
    )
  })
})
