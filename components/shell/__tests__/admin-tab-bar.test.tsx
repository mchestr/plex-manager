/**
 * The admin tab bar's failed-jobs dot (ui-design-system 6.2): a link tab
 * carries it while an item the tab covers has a destructive badge, and More
 * carries it only for such an item that no link tab covers. A tab item past
 * the four-tab cap opens from More, so its page lights More. The item list is
 * set here, because the real nav has no destructive badge outside a tab.
 */

import { render, screen, within } from '@testing-library/react'
import type { Route } from 'next'
import { usePathname } from 'next/navigation'

import { useAdminNav } from '@/components/shell/admin-nav-context'
import { AdminTabBar } from '@/components/shell/admin-tab-bar'
import type { AdminNavItem, NavCounts } from '@/lib/admin/nav'
import { icons } from '@/lib/ui/icons'

jest.mock('next/navigation', () => ({ usePathname: jest.fn() }))
jest.mock('@/components/shell/admin-nav-context', () => ({ useAdminNav: jest.fn() }))
// The More sheet stays closed, so its list is not under test
jest.mock('@/components/shell/admin-nav-list', () => ({ AdminNavList: () => null }))

const mockPathname = usePathname as jest.Mock
const mockNav = useAdminNav as jest.Mock

const failedJobsBadge: AdminNavItem['badge'] = ({ failedJobs }) =>
  failedJobs ? { text: `${failedJobs} failed`, tone: 'destructive' } : null
const usersBadge: AdminNavItem['badge'] = ({ users }) => ({ text: String(users) })

function bare(id: string, mobile: AdminNavItem['mobile'], badge?: AdminNavItem['badge']): AdminNavItem {
  return { id, label: id, href: `/admin/${id}` as Route, icon: icons.users, match: 'prefix', mobile, ...(badge && { badge }) }
}

function renderTabBar(items: AdminNavItem[], failedJobs: number | null) {
  const counts: NavCounts = { users: 3, pendingAffiliates: 0, failedJobs }
  mockNav.mockReturnValue({ items, scoped: false })
  return render(<AdminTabBar navCounts={counts} />)
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPathname.mockReturnValue('/admin')
})

describe('AdminTabBar failed dot', () => {
  it('sits on the link tab that covers the item with a destructive badge', () => {
    renderTabBar([bare('overview', 'tab'), bare('jobs', 'tab', failedJobsBadge), bare('people', 'tab', usersBadge)], 2)

    expect(screen.getByTestId('admin-tab-jobs-failed')).toBeInTheDocument()
    expect(screen.getByTestId('admin-tab-jobs')).toHaveAccessibleName(/^jobs ?, jobs have failed$/)
    // A neutral badge is no failure, and nothing is left over for More
    expect(screen.queryByTestId('admin-tab-people-failed')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-tab-overview-failed')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-tab-more-failed')).not.toBeInTheDocument()
  })

  it('sits on More when the item with a destructive badge opens from More only', () => {
    renderTabBar([bare('overview', 'tab'), bare('people', 'tab'), bare('jobs', 'more', failedJobsBadge)], 2)

    expect(screen.getByTestId('admin-tab-more-failed')).toBeInTheDocument()
    expect(screen.getByTestId('admin-tab-more')).toHaveAccessibleName(/^More ?, jobs have failed$/)
    expect(screen.queryByTestId('admin-tab-people-failed')).not.toBeInTheDocument()
  })

  it('sits on More, and its page lights More, for a tab item past the four-tab cap', () => {
    const tabs = ['overview', 'a', 'b', 'c'].map((id) => bare(id, 'tab'))
    mockPathname.mockReturnValue('/admin/jobs')
    renderTabBar([...tabs, bare('jobs', 'tab', failedJobsBadge)], 2)

    expect(screen.queryByTestId('admin-tab-jobs')).not.toBeInTheDocument()
    expect(screen.getByTestId('admin-tab-more-failed')).toBeInTheDocument()
    // The dropped item's page lights More and none of the four link tabs
    const links = within(screen.getByTestId('admin-tab-bar')).getAllByRole('link')
    expect(links).toHaveLength(4)
    expect(links.filter((tab) => tab.getAttribute('aria-current') === 'page')).toEqual([])
    expect(screen.getByTestId('admin-tab-more')).toHaveClass('text-foreground')
  })

  it.each([0, null])('is absent with %p failed jobs (null is Redis down)', (failedJobs) => {
    renderTabBar([bare('overview', 'tab'), bare('jobs', 'tab', failedJobsBadge), bare('other', 'more', failedJobsBadge)], failedJobs)

    expect(screen.queryByTestId('admin-tab-jobs-failed')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-tab-more-failed')).not.toBeInTheDocument()
    expect(screen.getByTestId('admin-tab-jobs')).toHaveAccessibleName('jobs')
  })
})
