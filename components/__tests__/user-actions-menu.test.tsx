import { UserActionsMenu } from '@/components/admin/users/user-actions-menu'
import { fireEvent, render, screen } from '@testing-library/react'
import { makeAdminUserWithStats, makeAdminUserWithSubscription } from '../../__tests__/utils/test-builders'

// Mock child components
jest.mock('@/components/admin/users/regenerate-wrapped-button', () => ({
  RegenerateWrappedButton: () => <button>Regenerate Wrapped</button>,
}))

jest.mock('@/components/admin/users/unshare-user-button', () => ({
  UnshareUserButton: () => <button>Unshare Library</button>,
}))

jest.mock('@/components/admin/users/cancel-subscription-button', () => ({
  CancelSubscriptionButton: () => <button>Cancel Subscription</button>,
}))

jest.mock('@/components/admin/users/grant-access-button', () => ({
  GrantAccessButton: () => <button>Grant Access (Comp)</button>,
}))

jest.mock('@/components/admin/users/toggle-exempt-button', () => ({
  ToggleExemptButton: ({ isExempt }: { isExempt: boolean }) => (
    <button>{isExempt ? 'Remove Exempt' : 'Mark Exempt'}</button>
  ),
}))

/**
 * Base row helper: the actions menu receives the full admin user DTO, so we use
 * the subscription-aware builder and layer overrides for each scenario.
 */
const makeRow = (overrides: Record<string, unknown> = {}) =>
  makeAdminUserWithSubscription({
    subscriptionStatus: null,
    isExempt: false,
    stripeCustomerId: null,
    ...overrides,
  }) as any

const openMenu = () => {
  const button = screen.getByRole('button', { name: /Actions for/i })
  fireEvent.click(button)
}

describe('UserActionsMenu', () => {
  it('should render "Generating..." when status is generating for an admin with no other actions', () => {
    const user = makeRow({ wrappedStatus: 'generating', isAdmin: true, hasPlexAccess: false })
    render(<UserActionsMenu user={user} />)
    expect(screen.getByText('Generating...')).toBeInTheDocument()
  })

  it('should render actions menu button when actions available', () => {
    const user = makeRow({ wrappedStatus: 'completed' })
    render(<UserActionsMenu user={user} />)

    expect(screen.getByRole('button', { name: /Actions for/i })).toBeInTheDocument()
  })

  it('should show wrapped menu items when clicked', () => {
    const user = makeRow({ wrappedStatus: 'completed' })
    render(<UserActionsMenu user={user} />)

    openMenu()

    expect(screen.getByText('View Wrapped')).toBeInTheDocument()
    expect(screen.getByText('Regenerate Wrapped')).toBeInTheDocument()
  })

  it('should show unshare button for non-admin users with plex access', () => {
    const user = makeRow({ wrappedStatus: 'completed', isAdmin: false, hasPlexAccess: true })
    render(<UserActionsMenu user={user} />)

    openMenu()

    expect(screen.getByText('Unshare Library')).toBeInTheDocument()
  })

  it('should NOT show unshare button for admin users', () => {
    const user = makeRow({ wrappedStatus: 'completed', isAdmin: true, hasPlexAccess: true })
    render(<UserActionsMenu user={user} />)

    openMenu()

    expect(screen.queryByText('Unshare Library')).not.toBeInTheDocument()
  })

  it('should show Cancel Subscription only for active/past-due subscriptions', () => {
    const active = makeRow({ subscriptionStatus: 'ACTIVE' })
    const { rerender } = render(<UserActionsMenu user={active} />)
    openMenu()
    expect(screen.getByText('Cancel Subscription')).toBeInTheDocument()

    // Canceled subscription: no cancel action.
    fireEvent.click(document.querySelector('.fixed.inset-0')!)
    const canceled = makeRow({ subscriptionStatus: 'CANCELED' })
    rerender(<UserActionsMenu user={canceled} />)
    openMenu()
    expect(screen.queryByText('Cancel Subscription')).not.toBeInTheDocument()
  })

  it('should show Grant Access for a non-exempt non-admin and hide it once exempt', () => {
    const notExempt = makeRow({ isExempt: false, isAdmin: false })
    const { rerender } = render(<UserActionsMenu user={notExempt} />)
    openMenu()
    expect(screen.getByText('Grant Access (Comp)')).toBeInTheDocument()

    fireEvent.click(document.querySelector('.fixed.inset-0')!)
    const exempt = makeRow({ isExempt: true, isAdmin: false })
    rerender(<UserActionsMenu user={exempt} />)
    openMenu()
    expect(screen.queryByText('Grant Access (Comp)')).not.toBeInTheDocument()
  })

  it('should show the toggle-exempt item reflecting current exempt state', () => {
    const exempt = makeRow({ isExempt: true, isAdmin: false })
    render(<UserActionsMenu user={exempt} />)
    openMenu()
    expect(screen.getByText('Remove Exempt')).toBeInTheDocument()
  })

  it('should NOT show toggle-exempt for admin users', () => {
    const admin = makeRow({ isAdmin: true, wrappedStatus: 'completed' })
    render(<UserActionsMenu user={admin} />)
    openMenu()
    expect(screen.queryByText('Mark Exempt')).not.toBeInTheDocument()
    expect(screen.queryByText('Remove Exempt')).not.toBeInTheDocument()
  })

  it('should show a "View in Stripe" link using the provided (mode-aware) base URL', () => {
    const user = makeRow({ stripeCustomerId: 'cus_abc123' })
    render(
      <UserActionsMenu
        user={user}
        stripeDashboardBaseUrl="https://dashboard.stripe.com/test"
      />
    )
    openMenu()

    const link = screen.getByTestId('view-in-stripe-link')
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute(
      'href',
      'https://dashboard.stripe.com/test/customers/cus_abc123'
    )
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('should NOT show a "View in Stripe" link when stripeCustomerId is absent', () => {
    const user = makeRow({ stripeCustomerId: null, wrappedStatus: 'completed' })
    render(
      <UserActionsMenu user={user} stripeDashboardBaseUrl="https://dashboard.stripe.com" />
    )
    openMenu()
    expect(screen.queryByTestId('view-in-stripe-link')).not.toBeInTheDocument()
  })

  it('should NOT show a "View in Stripe" link when no dashboard base URL is available', () => {
    const user = makeRow({ stripeCustomerId: 'cus_abc123' })
    render(<UserActionsMenu user={user} stripeDashboardBaseUrl={null} />)
    openMenu()
    expect(screen.queryByTestId('view-in-stripe-link')).not.toBeInTheDocument()
  })

  it('should close menu when clicking outside', () => {
    const user = makeRow({ wrappedStatus: 'completed' })
    render(<UserActionsMenu user={user} />)

    openMenu()
    expect(screen.getByText('View Wrapped')).toBeInTheDocument()

    const backdrop = document.querySelector('.fixed.inset-0')
    expect(backdrop).toBeInTheDocument()
    fireEvent.click(backdrop!)
    expect(screen.queryByText('View Wrapped')).not.toBeInTheDocument()
  })

  it('should fall back to a wrapped-only menu when using the base stats builder', () => {
    // makeAdminUserWithStats does not include subscription fields; the menu must
    // still render safely (no subscription/exempt actions, no Stripe link).
    const user = makeAdminUserWithStats({ wrappedStatus: 'completed', isAdmin: true, hasPlexAccess: true }) as any
    render(<UserActionsMenu user={user} />)
    openMenu()
    expect(screen.getByText('View Wrapped')).toBeInTheDocument()
    expect(screen.queryByText('Cancel Subscription')).not.toBeInTheDocument()
    expect(screen.queryByTestId('view-in-stripe-link')).not.toBeInTheDocument()
  })
})
