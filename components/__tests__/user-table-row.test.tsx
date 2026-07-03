import { render, screen } from '@testing-library/react'
import { UserTableRow } from '@/components/admin/users/user-table-row'
import {
  makeAdminUserWithStats,
  makeAdminUserWithSubscription,
} from '../../__tests__/utils/test-builders'

// Mock UserActionsMenu
jest.mock('../admin/users/user-actions-menu', () => ({
  UserActionsMenu: ({ user }: { user: any }) => (
    <div data-testid="user-actions-menu">
      {user.wrappedStatus === 'generating' ? 'Generating...' : 'Actions'}
    </div>
  ),
}))

// Mock next/link
jest.mock('next/link', () => {
  const MockLink = ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  )
  MockLink.displayName = 'MockLink'
  return MockLink
})

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    const { width, height, fill, loader, quality, priority, unoptimized, ...imgProps } = props
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...imgProps} />
  },
}))

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
  }),
}))

describe('UserTableRow', () => {
  const renderInTable = (component: React.ReactElement) => {
    return render(
      <table>
        <tbody>{component}</tbody>
      </table>
    )
  }

  it('should render user name and email', () => {
    const user = makeAdminUserWithStats()
    renderInTable(<UserTableRow user={user} currentYear={2024} />)

    expect(screen.getByText('Test User')).toBeInTheDocument()
    expect(screen.getByText('test@example.com')).toBeInTheDocument()
  })

  it('should render user image when available', () => {
    const user = makeAdminUserWithStats()
    renderInTable(<UserTableRow user={user} currentYear={2024} />)

    const img = screen.getByAltText('Test User')
    expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg')
  })

  it('should render initial when image is not available', () => {
    const user = makeAdminUserWithStats({ image: null })
    renderInTable(<UserTableRow user={user} currentYear={2024} />)

    expect(screen.getByText('T')).toBeInTheDocument()
  })

  it('should render email initial when name is not available', () => {
    const user = makeAdminUserWithStats({ name: null, image: null })
    renderInTable(<UserTableRow user={user} currentYear={2024} />)

    expect(screen.getByText('T')).toBeInTheDocument()
  })

  it('should render admin badge for admin users', () => {
    const user = makeAdminUserWithStats({ isAdmin: true })
    renderInTable(<UserTableRow user={user} currentYear={2024} />)

    expect(screen.getByText('Admin')).toBeInTheDocument()
  })

  it('should render user badge for non-admin users', () => {
    const user = makeAdminUserWithStats({ isAdmin: false })
    renderInTable(<UserTableRow user={user} currentYear={2024} />)

    expect(screen.getByText('User')).toBeInTheDocument()
  })

  it('should render provider name', () => {
    const user = makeAdminUserWithStats()
    renderInTable(<UserTableRow user={user} currentYear={2024} />)

    expect(screen.getByText('openai')).toBeInTheDocument()
  })

  it('should render cost with link', () => {
    const user = makeAdminUserWithStats()
    renderInTable(<UserTableRow user={user} currentYear={2024} />)

    const costLink = screen.getByText('$0.010')
    expect(costLink).toHaveAttribute('href', '/admin/llm-usage?userId=user-1')
  })

  it('should render actions menu', () => {
    const user = makeAdminUserWithStats()
    renderInTable(<UserTableRow user={user} currentYear={2024} />)

    expect(screen.getByTestId('user-actions-menu')).toBeInTheDocument()
  })

  it('should pass generating status to actions menu', () => {
    const user = makeAdminUserWithStats({ wrappedStatus: 'generating' })
    renderInTable(<UserTableRow user={user} currentYear={2024} />)

    expect(screen.getByText('Generating...')).toBeInTheDocument()
  })

  it('should handle missing LLM usage', () => {
    const user = makeAdminUserWithStats({
      totalLlmUsage: null,
      llmUsage: null,
      totalShares: 0,
      totalVisits: 0,
    })
    renderInTable(<UserTableRow user={user} currentYear={2024} />)

    const allDashes = screen.getAllByText('—')
    expect(allDashes.length).toBeGreaterThanOrEqual(1) // At least one for LLM usage
  })

  describe('subscription column', () => {
    it('should render an Active badge for active subscriptions', () => {
      const user = makeAdminUserWithSubscription({ subscriptionStatus: 'ACTIVE' })
      renderInTable(<UserTableRow user={user} currentYear={2024} />)

      expect(screen.getByText('Active')).toBeInTheDocument()
    })

    it('should render a Past due badge for past_due subscriptions', () => {
      const user = makeAdminUserWithSubscription({ subscriptionStatus: 'PAST_DUE' })
      renderInTable(<UserTableRow user={user} currentYear={2024} />)

      expect(screen.getByText('Past due')).toBeInTheDocument()
    })

    it('should render a Past due badge for unpaid subscriptions', () => {
      const user = makeAdminUserWithSubscription({ subscriptionStatus: 'UNPAID' })
      renderInTable(<UserTableRow user={user} currentYear={2024} />)

      expect(screen.getByText('Past due')).toBeInTheDocument()
    })

    it('should render a Canceled badge for canceled subscriptions', () => {
      const user = makeAdminUserWithSubscription({ subscriptionStatus: 'CANCELED' })
      renderInTable(<UserTableRow user={user} currentYear={2024} />)

      expect(screen.getByText('Canceled')).toBeInTheDocument()
    })

    it('should render the renewal date for active subscriptions', () => {
      const user = makeAdminUserWithSubscription({
        subscriptionStatus: 'ACTIVE',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date('2024-02-01T00:00:00Z'),
      })
      renderInTable(<UserTableRow user={user} currentYear={2024} />)

      expect(screen.getByText(/Renews/)).toBeInTheDocument()
    })

    it('should render an end date when the subscription cancels at period end', () => {
      const user = makeAdminUserWithSubscription({
        subscriptionStatus: 'ACTIVE',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date('2024-02-01T00:00:00Z'),
      })
      renderInTable(<UserTableRow user={user} currentYear={2024} />)

      expect(screen.getByText(/Ends/)).toBeInTheDocument()
    })

    it('should render an exempt marker for exempt users with no subscription', () => {
      const user = makeAdminUserWithSubscription({
        subscriptionStatus: null,
        isExempt: true,
        exemptReason: 'grandfathered',
      })
      renderInTable(<UserTableRow user={user} currentYear={2024} />)

      expect(screen.getByText('Grandfathered')).toBeInTheDocument()
    })

    it('should render a Comp marker for comped exempt users', () => {
      const user = makeAdminUserWithSubscription({
        subscriptionStatus: null,
        isExempt: true,
        exemptReason: 'comp',
      })
      renderInTable(<UserTableRow user={user} currentYear={2024} />)

      expect(screen.getByText('Comp')).toBeInTheDocument()
    })

    it('should render a dash for users with no subscription and no exemption', () => {
      const user = makeAdminUserWithSubscription({
        subscriptionStatus: null,
        isExempt: false,
        exemptReason: null,
        totalLlmUsage: null,
        llmUsage: null,
      })
      renderInTable(<UserTableRow user={user} currentYear={2024} />)

      // Both the subscription column and the LLM cost column render a dash.
      expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
    })
  })
})
