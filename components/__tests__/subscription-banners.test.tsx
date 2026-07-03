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

const renderBanners = (props: { pastDue: boolean; pendingInvite: boolean }) =>
  render(<SubscriptionBanners {...props} />)

describe('SubscriptionBanners', () => {
  it('renders nothing for a healthy user (no flags set)', () => {
    const { container } = renderBanners({ pastDue: false, pendingInvite: false })

    expect(container.firstChild).toBeNull()
    expect(screen.queryByTestId('subscription-banners')).not.toBeInTheDocument()
  })

  it('shows the past-due banner with a manage-payment action when pastDue', () => {
    renderBanners({ pastDue: true, pendingInvite: false })

    expect(screen.getByTestId('past-due-banner')).toBeInTheDocument()
    expect(screen.getByTestId('past-due-manage-payment')).toBeInTheDocument()
    expect(screen.queryByTestId('pending-invite-banner')).not.toBeInTheDocument()
  })

  it('shows the pending-invite notice when pendingInvite', () => {
    renderBanners({ pastDue: false, pendingInvite: true })

    expect(screen.getByTestId('pending-invite-banner')).toBeInTheDocument()
    expect(screen.getByText(/accept it to finish setting up/i)).toBeInTheDocument()
    expect(screen.queryByTestId('past-due-banner')).not.toBeInTheDocument()
  })

  it('shows both banners when both flags are set', () => {
    renderBanners({ pastDue: true, pendingInvite: true })

    expect(screen.getByTestId('past-due-banner')).toBeInTheDocument()
    expect(screen.getByTestId('pending-invite-banner')).toBeInTheDocument()
  })
})
