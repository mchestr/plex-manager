import { render, screen } from '@testing-library/react'

import { BillingTab } from '@/components/admin/users/detail/billing-tab'
import type { UserDetailHeaderData } from '@/lib/admin/user-detail'
import { bindFormat } from '@/lib/utils/format'

jest.mock('server-only', () => ({}))
jest.mock('@/lib/prisma', () => ({ prisma: {} }))
jest.mock('next/navigation', () => require('@/__tests__/helpers/url-router').navigationModule)
jest.mock('@/actions/admin/subscriptions', () => ({
  adminGrantAccess: jest.fn(),
  adminToggleExempt: jest.fn(),
  adminCancelSubscription: jest.fn(),
}))
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))

const f = bindFormat({ timeZone: 'America/Chicago', locale: 'en-US' })

const SUBSCRIPTION = {
  status: 'CANCELED' as const,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  stripeCustomerId: 'cus_1',
  plexInviteStatus: 'revoked',
}

function header(overrides: Partial<UserDetailHeaderData> = {}): UserDetailHeaderData {
  return {
    id: 'u1',
    name: 'Morgan Lee',
    email: null,
    plexUserId: 'plex-1',
    services: ['plex'],
    primaryService: 'plex',
    isAdmin: false,
    role: null,
    isOwner: false,
    disabledAt: null,
    createdAt: new Date('2025-01-02T00:00:00Z'),
    isExempt: false,
    exemptNote: null,
    lastSeenAt: null,
    lastSeenReadAt: null,
    inactivityExcluded: false,
    swapsNeedApproval: false,
    plexAccess: 'unknown',
    subscription: SUBSCRIPTION,
    stripeEnabled: true,
    season: { year: 2026, status: null, runStartedAt: null },
    discord: null,
    invitedBy: null,
    ...overrides,
  }
}

describe('BillingTab access statuses (P11.11)', () => {
  it('shows the Plex invite status for a Plex member', () => {
    render(<BillingTab header={header()} f={f} />)

    expect(screen.getByTestId('admin-user-plex-invite-status')).toHaveTextContent('Plex inviteRemoved')
  })

  it('shows no invite status for a member with no Plex account', () => {
    render(<BillingTab header={header({ plexUserId: null, services: [] })} f={f} />)

    expect(screen.queryByTestId('admin-user-plex-invite-status')).not.toBeInTheDocument()
  })

  it('shows none without a subscription row', () => {
    render(<BillingTab header={header({ subscription: null })} f={f} />)

    expect(screen.queryByTestId('admin-user-plex-invite-status')).not.toBeInTheDocument()
  })
})
