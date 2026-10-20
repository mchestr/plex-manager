import { render, screen } from '@testing-library/react'

import { SubscriptionBanners } from '@/components/subscription/subscription-banners'

// ManageSubscriptionButton (rendered inside the past-due banner) imports the
// server action; mock it so importing the tree doesn't drag in real deps.
jest.mock('@/actions/subscription', () => ({
  openBillingPortal: jest.fn(),
}))

// useToast is used by ManageSubscriptionButton; mock it so SubscriptionBanners
// can render without a surrounding ToastProvider (which would otherwise add its
// own container element and defeat the "renders nothing" assertion).
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

describe('SubscriptionBanners', () => {
  it('shows the past-due banner with a manage-payment action', () => {
    render(<SubscriptionBanners notice="past-due" />)

    expect(screen.getByTestId('subscription-banners')).toBeInTheDocument()
    expect(screen.getByTestId('past-due-banner')).toBeInTheDocument()
    expect(screen.getByTestId('past-due-manage-payment')).toBeInTheDocument()
    expect(screen.queryByTestId('pending-invite-banner')).not.toBeInTheDocument()
  })

  it('shows the pending-invite notice', () => {
    render(<SubscriptionBanners notice="pending-invite" />)

    expect(screen.getByTestId('pending-invite-banner')).toBeInTheDocument()
    expect(screen.getByText(/accept it to finish setting up/i)).toBeInTheDocument()
    expect(screen.queryByTestId('past-due-banner')).not.toBeInTheDocument()
  })
})
