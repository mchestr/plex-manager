/**
 * The Automations section's layout: the tab strip above its four pages, with
 * the tabs the signed-in user may open, none for a role, and no strip without
 * a session.
 */

import { render, screen, within } from '@testing-library/react'
import { usePathname } from 'next/navigation'

import AutomationsSectionLayout from '@/app/admin/(automations)/layout'
import { getSession } from '@/lib/data/session'

jest.mock('next/navigation', () => ({ usePathname: jest.fn() }))
// The real Link prefetches on an IntersectionObserver timer, outside act().
jest.mock('next/link', () => {
  const MockLink = ({ href, ...props }: { href: string } & React.ComponentProps<'a'>) => <a href={href} {...props} />
  return MockLink
})
jest.mock('@/lib/data/session', () => ({ getSession: jest.fn() }))

const mockPathname = usePathname as jest.Mock

async function renderLayout() {
  render(await AutomationsSectionLayout({ children: <p>Page</p> }))
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPathname.mockReturnValue('/admin/request-limits')
})

describe('Automations section layout', () => {
  it("draws the section's tabs above the page, with the current page's tab selected", async () => {
    jest.mocked(getSession).mockResolvedValue({ user: { id: 'admin-1', isAdmin: true }, expires: '' } as never)

    await renderLayout()

    const list = screen.getByRole('tablist', { name: 'Automations' })
    expect(list).toHaveAttribute('data-testid', 'admin-section-tabs-automations')
    expect(within(list).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Watchlist sync', 'Inactive members', 'Request limits', 'Queues'])
    expect(screen.getByTestId('admin-section-tab-request-limits')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('admin-section-tab-watchlist')).toHaveAttribute('href', '/admin/watchlist')
    expect(screen.getByTestId('admin-section-tab-inactivity')).toHaveAttribute('href', '/admin/inactivity')
    expect(screen.getByTestId('admin-section-tab-queues')).toHaveAttribute('href', '/admin/queues')
    expect(list.compareDocumentPosition(screen.getByText('Page')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('draws no tabs for a role, which may open none of them, and still renders the page', async () => {
    jest.mocked(getSession).mockResolvedValue({ user: { id: 'support-1', isAdmin: false, role: 'support' }, expires: '' } as never)

    await renderLayout()

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.getByText('Page')).toBeInTheDocument()
  })

  it('draws no tabs without a session, and still renders the page', async () => {
    jest.mocked(getSession).mockResolvedValue(null)

    await renderLayout()

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.getByText('Page')).toBeInTheDocument()
  })
})
