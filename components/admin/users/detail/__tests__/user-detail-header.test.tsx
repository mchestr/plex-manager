import { render, screen } from '@testing-library/react'

import { UserDetailHeader } from '@/components/admin/users/detail/user-detail-header'
import type { UserDetailHeaderData } from '@/lib/admin/user-detail'

jest.mock('server-only', () => ({}))
jest.mock('@/lib/prisma', () => ({ prisma: {} }))
jest.mock('@/components/admin/users/detail/user-detail-actions', () => ({
  UserDetailActions: ({ user }: { user: { name: string; disabled: boolean } }) => (
    <button type="button" data-disabled={String(user.disabled)}>
      Actions for {user.name}
    </button>
  ),
}))

const NOW = Date.parse('2026-12-03T12:00:00Z')

function header(overrides: Partial<UserDetailHeaderData> = {}): UserDetailHeaderData {
  return {
    id: 'u1',
    name: 'Morgan Lee',
    email: 'morgan@example.com',
    plexUserId: 'plex-1',
    jellyfinUserId: null,
    services: ['plex'],
    primaryService: 'plex',
    jellyfinStatus: null,
    isAdmin: false,
    isOwner: false,
    disabledAt: null,
    createdAt: new Date('2025-01-02T00:00:00Z'),
    isExempt: false,
    exemptNote: null,
    plexAccess: 'shared',
    subscription: null,
    stripeEnabled: false,
    season: { year: 2026, status: 'completed', runStartedAt: null },
    discord: null,
    ...overrides,
  }
}

describe('UserDetailHeader', () => {
  it('uses the name as the h1, breadcrumbs back to Users and the email below', () => {
    render(<UserDetailHeader header={header()} stripeDashboardBaseUrl={null} estimateCopy="" now={NOW} />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Morgan Lee')
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Users/Morgan Lee')
    expect(screen.getByText('morgan@example.com')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View Rewind 2026' })).toHaveAttribute('href', '/admin/users/u1/rewind/2026')
  })

  it('renders the role, Plex access and Rewind badges, and the subscription only with Stripe on', () => {
    const { rerender } = render(<UserDetailHeader header={header()} stripeDashboardBaseUrl={null} estimateCopy="" now={NOW} />)

    expect(screen.getByTestId('admin-user-role-badge')).toHaveTextContent('Member')
    expect(screen.getByTestId('admin-user-plex-badge')).toHaveTextContent('Shared')
    expect(screen.getByTestId('admin-user-rewind-badge')).toHaveTextContent('Rewind 2026: Ready to watch')
    expect(screen.queryByTestId('admin-user-subscription-badge')).not.toBeInTheDocument()

    rerender(
      <UserDetailHeader
        header={header({ isAdmin: true, isOwner: true, plexAccess: 'unknown', stripeEnabled: true, subscription: { status: 'PAST_DUE', currentPeriodEnd: null, cancelAtPeriodEnd: false, stripeCustomerId: null, plexInviteStatus: null, jellyfinAccessStatus: null } })}
        stripeDashboardBaseUrl={null}
        estimateCopy=""
        now={NOW}
      />
    )
    expect(screen.getByTestId('admin-user-role-badge')).toHaveTextContent('Owner')
    expect(screen.getByTestId('admin-user-plex-badge')).toHaveTextContent('Unknown')
    expect(screen.getByTestId('admin-user-subscription-badge')).toHaveTextContent('Past due')
  })

  it('reads a run past 15 minutes as Stuck, and shows Disabled', () => {
    render(
      <UserDetailHeader
        header={header({ disabledAt: new Date(NOW), season: { year: 2026, status: 'generating', runStartedAt: new Date(NOW - 20 * 60_000) } })}
        stripeDashboardBaseUrl={null}
        estimateCopy=""
        now={NOW}
      />
    )
    expect(screen.getByTestId('admin-user-rewind-badge')).toHaveTextContent('Rewind 2026: Stuck')
    expect(screen.getByTestId('admin-user-disabled-badge')).toHaveTextContent('Disabled')
    // The shared users-list menu replaces P10.6's Disable and Change role buttons (P10.18)
    expect(screen.getByRole('button', { name: 'Actions for Morgan Lee' })).toHaveAttribute('data-disabled', 'true')
    expect(screen.queryByRole('button', { name: 'Disable account' })).not.toBeInTheDocument()
  })
})
