/**
 * The user detail page (P10.6): it loads the header, then only the active
 * tab's panel, and shows Billing only when Stripe is on or the member has a
 * subscription row.
 */

import { render, screen } from '@testing-library/react'

import UserDetailPage from '@/app/admin/users/[userId]/page'
import { getUserDetailHeader, type UserDetailHeaderData } from '@/lib/admin/user-detail'

jest.mock('server-only', () => ({}))
jest.mock('@/lib/prisma', () => ({ prisma: {} }))
jest.mock('@/lib/admin', () => ({ assertAdmin: jest.fn() }))
jest.mock('@/lib/wrapped/season', () => ({ getSeasonYear: async () => 2026 }))
jest.mock('@/lib/stripe/client', () => ({ getStripeDashboardBaseUrl: async () => null }))
jest.mock('@/lib/settings/app-settings', () => ({
  getFormat: async () => (await import('@/lib/utils/format')).bindFormat({ timeZone: 'America/Chicago', locale: 'en-US' }),
}))
jest.mock('@/lib/admin/user-detail-tabs', () => ({ regenerateEstimateCopy: async () => '' }))
jest.mock('@/lib/admin/user-detail', () => ({
  ...jest.requireActual('@/lib/admin/user-detail'),
  getUserDetailHeader: jest.fn(),
}))
jest.mock('@/components/admin/users/detail/user-detail-header', () => ({
  UserDetailHeader: ({ header }: { header: { name: string } }) => <h1>{header.name}</h1>,
}))
jest.mock('@/components/admin/users/detail/detail-tabs', () => ({
  DetailTabs: ({ tabs, active, children }: { tabs: { label: string }[]; active: string; children: React.ReactNode }) => (
    <div data-testid="tabs" data-active={active}>
      {tabs.map((tab) => tab.label).join(',')}
      {children}
    </div>
  ),
}))
jest.mock('@/components/admin/users/detail/overview-tab', () => ({ OverviewTab: () => <p>overview panel</p> }))
jest.mock('@/components/admin/users/detail/rewind-tab', () => ({ RewindTab: () => <p>rewind panel</p> }))
jest.mock('@/components/admin/users/detail/usage-tab', () => ({ UsageTab: () => <p>usage panel</p> }))
jest.mock('@/components/admin/users/detail/billing-tab', () => ({ BillingTab: () => <p>billing panel</p> }))

const mockHeader = getUserDetailHeader as jest.MockedFunction<typeof getUserDetailHeader>

function header(overrides: Partial<UserDetailHeaderData> = {}): UserDetailHeaderData {
  return {
    id: 'u1',
    name: 'Morgan Lee',
    email: null,
    plexUserId: 'plex-1',
    primaryAuthService: 'plex',
    isAdmin: false,
    isOwner: false,
    disabledAt: null,
    createdAt: new Date('2025-01-02T00:00:00Z'),
    isExempt: false,
    exemptReason: null,
    plexAccess: 'shared',
    subscription: null,
    stripeEnabled: false,
    season: { year: 2026, status: null, runStartedAt: null },
    discord: null,
    ...overrides,
  }
}

async function renderPage(tab?: string) {
  render(await UserDetailPage({ params: Promise.resolve({ userId: 'u1' }), searchParams: Promise.resolve(tab ? { tab } : {}) }))
}

describe('Admin user detail page', () => {
  it('defaults to Overview and renders only its panel', async () => {
    mockHeader.mockResolvedValue(header())
    await renderPage()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Morgan Lee')
    expect(screen.getByTestId('tabs')).toHaveAttribute('data-active', 'overview')
    expect(screen.getByText('overview panel')).toBeInTheDocument()
    expect(screen.queryByText('rewind panel')).not.toBeInTheDocument()
  })

  it('opens the tab the URL names, and falls back to Overview for an unknown one', async () => {
    mockHeader.mockResolvedValue(header())
    await renderPage('usage')
    expect(screen.getByText('usage panel')).toBeInTheDocument()
  })

  it('hides Billing with Stripe off and no subscription, even when the URL asks for it', async () => {
    mockHeader.mockResolvedValue(header())
    await renderPage('billing')

    expect(screen.getByTestId('tabs')).toHaveTextContent('Overview,Rewind,Usage')
    expect(screen.getByTestId('tabs')).not.toHaveTextContent('Billing')
    expect(screen.getByText('overview panel')).toBeInTheDocument()
  })

  it('shows Billing with Stripe on', async () => {
    mockHeader.mockResolvedValue(header({ stripeEnabled: true }))
    await renderPage('billing')

    expect(screen.getByTestId('tabs')).toHaveTextContent('Overview,Rewind,Usage,Billing')
    expect(screen.getByText('billing panel')).toBeInTheDocument()
  })

  it('is a 404 for an unknown member', async () => {
    mockHeader.mockResolvedValue(null)
    await expect(renderPage()).rejects.toThrow()
  })
})
