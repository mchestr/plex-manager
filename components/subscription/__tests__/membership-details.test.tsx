import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { openBillingPortal } from '@/actions/subscription'
import { MembershipDetails } from '@/components/subscription/membership-details'
import type { Membership, MembershipSubscription } from '@/lib/member/membership'

jest.mock('@/actions/subscription', () => ({ openBillingPortal: jest.fn() }))

const showError = jest.fn()
jest.mock('@/components/ui/toast', () => {
  const actual = jest.requireActual('@/components/ui/toast')
  return { ...actual, useToast: () => ({ showToast: jest.fn(), showSuccess: jest.fn(), showError, showInfo: jest.fn() }) }
})

const settings = { timeZone: 'America/Chicago', locale: 'en-US' }

function subscription(overrides: Partial<MembershipSubscription> = {}): Membership {
  return {
    exemption: null,
    subscription: {
      status: 'ACTIVE',
      planName: 'Supporter plan',
      amount: 500,
      currency: 'usd',
      interval: 'month',
      currentPeriodEnd: new Date('2026-11-06T18:00:00Z'),
      cancelAtPeriodEnd: false,
      ...overrides,
    },
  }
}

const renderDetails = (membership: Membership) => render(<MembershipDetails membership={membership} settings={settings} />)

beforeEach(() => jest.clearAllMocks())

describe('MembershipDetails', () => {
  it('shows the plan name, Active, the renewal date, the price and Manage billing', () => {
    renderDetails(subscription())

    expect(screen.getByTestId('subscription-plan')).toHaveTextContent('Supporter plan')
    expect(screen.getByTestId('subscription-status-badge')).toHaveTextContent('Active')
    expect(screen.getByTestId('subscription-period')).toHaveTextContent('Renews November 6, 2026')
    expect(screen.getByTestId('subscription-price')).toHaveTextContent('$5.00 a month')
    const button = screen.getByTestId('manage-subscription-button')
    expect(button).toHaveTextContent('Manage billing')
    expect(button).toHaveAccessibleDescription('Opens Stripe')
  })

  it('says when a canceling plan ends, and falls back without a date', () => {
    const { unmount } = renderDetails(subscription({ cancelAtPeriodEnd: true }))
    expect(screen.getByTestId('subscription-period')).toHaveTextContent('Ends November 6, 2026')
    unmount()

    renderDetails(subscription({ currentPeriodEnd: null }))
    expect(screen.getByTestId('subscription-period')).toHaveTextContent('Renews when the current period ends')
  })

  it('shows Past due with the retry day and the payment notice', () => {
    renderDetails(subscription({ status: 'PAST_DUE' }))

    expect(screen.getByTestId('subscription-status-badge')).toHaveTextContent('Past due')
    expect(screen.getByTestId('subscription-period')).toHaveTextContent('Retrying Nov 6')
    expect(screen.getByTestId('subscription-past-due-notice')).toBeInTheDocument()
  })

  it('shows a canceled plan as Canceled', () => {
    renderDetails(subscription({ status: 'CANCELED' }))

    expect(screen.getByTestId('subscription-status-badge')).toHaveTextContent('Canceled')
    expect(screen.getByTestId('subscription-period')).toHaveTextContent('Ended November 6, 2026')
  })

  it.each([
    ['exempt', 'Exempt'],
    ['notRequired', 'Not required'],
  ] as const)('shows the %s exemption without a subscription', (exemption, label) => {
    renderDetails({ subscription: null, exemption })

    expect(screen.getByTestId('subscription-status-badge')).toHaveTextContent(label)
    expect(screen.queryByTestId('manage-subscription-button')).not.toBeInTheDocument()
  })

  it('shows a portal error inline as well as in the toast', async () => {
    const user = userEvent.setup()
    jest.mocked(openBillingPortal).mockResolvedValue({ success: false, code: 'INTERNAL', error: 'Billing is unavailable' })
    renderDetails(subscription())

    await user.click(screen.getByTestId('manage-subscription-button'))

    expect(await screen.findByTestId('manage-subscription-button-error')).toHaveTextContent('Billing is unavailable')
    expect(showError).toHaveBeenCalledWith('Billing is unavailable')
  })
})
