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
  jellyfinAccessStatus: 'disabled',
}

function header(overrides: Partial<UserDetailHeaderData> = {}): UserDetailHeaderData {
  return {
    id: 'u1',
    name: 'Morgan Lee',
    email: null,
    plexUserId: null,
    jellyfinUserId: 'jf-1',
    services: ['jellyfin'],
    primaryService: 'jellyfin',
    jellyfinStatus: 'disabled',
    isAdmin: false,
    role: null,
    isOwner: false,
    disabledAt: null,
    createdAt: new Date('2025-01-02T00:00:00Z'),
    isExempt: false,
    exemptNote: null,
    plexAccess: 'unknown',
    subscription: SUBSCRIPTION,
    stripeEnabled: true,
    season: { year: 2026, status: null, runStartedAt: null },
    discord: null,
    ...overrides,
  }
}

describe('BillingTab access statuses (P11.11)', () => {
  it('shows the Jellyfin access status, and no Plex invite, for a Jellyfin-only member', () => {
    render(<BillingTab header={header()} f={f} />)

    expect(screen.getByTestId('admin-user-jellyfin-access-status')).toHaveTextContent('Jellyfin accessDisabled')
    expect(screen.queryByTestId('admin-user-plex-invite-status')).not.toBeInTheDocument()
  })

  it('shows both for a member with both services', () => {
    render(<BillingTab header={header({ services: ['plex', 'jellyfin'], plexUserId: 'plex-1' })} f={f} />)

    expect(screen.getByTestId('admin-user-plex-invite-status')).toHaveTextContent('Plex inviteRemoved')
    expect(screen.getByTestId('admin-user-jellyfin-access-status')).toBeInTheDocument()
  })

  it('shows neither without a subscription row', () => {
    render(<BillingTab header={header({ subscription: null })} f={f} />)

    expect(screen.queryByTestId('admin-user-jellyfin-access-status')).not.toBeInTheDocument()
  })
})
