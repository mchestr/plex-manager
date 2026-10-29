import { render, screen } from '@testing-library/react'

import AffiliatesPage from '@/app/admin/affiliates/page'
import { assertPermission } from '@/lib/admin'
import { getAffiliateHistory } from '@/lib/data/affiliate-history'

jest.mock('server-only', () => ({}))
jest.mock('@/lib/prisma', () => ({ prisma: {} }))
jest.mock('@/lib/admin', () => ({ assertPermission: jest.fn() }))
jest.mock('@/lib/settings/app-settings', () => ({ getFormat: async () => require('@/lib/utils/format').bindFormat({ timeZone: 'UTC', locale: 'en-US' }) }))
jest.mock('@/lib/data/affiliates', () => ({
  listAffiliateApplications: async () => [],
  listAffiliates: async () => [],
  getInviteTree: async () => [],
}))
jest.mock('@/lib/data/affiliate-history', () => ({ getAffiliateHistory: jest.fn(async () => ({ applications: [], blocks: [] })) }))
jest.mock('@/components/admin/affiliates/affiliate-tabs', () => ({
  AffiliateTabs: ({ tabs, active, children }: { tabs: { value: string }[]; active: string; children: React.ReactNode }) => (
    <div data-testid="tabs" data-active={active} data-tabs={tabs.map((tab) => tab.value).join(',')}>
      {children}
    </div>
  ),
}))
jest.mock('@/components/admin/affiliates/applications-table', () => ({ ApplicationsTable: ({ admin }: { admin: boolean }) => <p>applications admin={String(admin)}</p> }))
jest.mock('@/components/admin/affiliates/affiliates-table', () => ({ AffiliatesTable: () => <p>affiliates panel</p> }))
jest.mock('@/components/admin/affiliates/invite-tree', () => ({ InviteTree: () => <p>tree panel</p> }))
jest.mock('@/components/admin/affiliates/history-tab', () => ({ HistoryTab: () => <p>history panel</p> }))

const as = (isAdmin: boolean) =>
  jest.mocked(assertPermission).mockResolvedValue({ user: { id: 'u', isAdmin, role: isAdmin ? null : 'support' }, expires: '' } as never)

async function renderPage(tab?: string) {
  render(await AffiliatesPage({ searchParams: Promise.resolve(tab ? { tab } : {}) }))
}

beforeEach(() => jest.clearAllMocks())

describe('/admin/affiliates', () => {
  it('checks affiliates:read and opens Applications by default', async () => {
    as(true)
    await renderPage()
    expect(assertPermission).toHaveBeenCalledWith('affiliates:read')
    expect(screen.getByTestId('tabs')).toHaveAttribute('data-active', 'applications')
    expect(screen.getByText('applications admin=true')).toBeInTheDocument()
  })

  it('gives an admin the History tab', async () => {
    as(true)
    await renderPage('history')
    expect(screen.getByTestId('tabs')).toHaveAttribute('data-tabs', 'applications,affiliates,tree,history')
    expect(screen.getByText('history panel')).toBeInTheDocument()
  })

  it('keeps History from Support, even by URL', async () => {
    as(false)
    await renderPage('history')
    expect(screen.getByTestId('tabs')).toHaveAttribute('data-tabs', 'applications,affiliates,tree')
    expect(screen.getByText('applications admin=false')).toBeInTheDocument()
    expect(getAffiliateHistory).not.toHaveBeenCalled()
  })

  it.each([['affiliates', 'affiliates panel'], ['tree', 'tree panel'], ['nonsense', 'applications admin=false']])('opens ?tab=%s', async (tab, text) => {
    as(false)
    await renderPage(tab)
    expect(screen.getByText(text)).toBeInTheDocument()
  })
})
