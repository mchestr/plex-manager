/**
 * The Members section's layout: the tab strip above Users, Invites and
 * Affiliates, with the tabs the signed-in user may open (Users and Affiliates
 * for Support), no strip on a page below a tab, and none without a session.
 */

import { render, screen, within } from '@testing-library/react'
import { usePathname } from 'next/navigation'

import MembersSectionLayout from '@/app/admin/(members)/layout'
import { getSession } from '@/lib/data/session'

jest.mock('next/navigation', () => ({ usePathname: jest.fn() }))
// The real Link prefetches on an IntersectionObserver timer, outside act().
jest.mock('next/link', () => {
  const MockLink = ({ href, ...props }: { href: string } & React.ComponentProps<'a'>) => <a href={href} {...props} />
  return MockLink
})
jest.mock('@/lib/data/session', () => ({ getSession: jest.fn() }))

const mockPathname = usePathname as jest.Mock
const admin = { user: { id: 'admin-1', isAdmin: true }, expires: '' }
const support = { user: { id: 'support-1', isAdmin: false, role: 'support' }, expires: '' }

async function renderLayout() {
  render(await MembersSectionLayout({ children: <p>Page</p> }))
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPathname.mockReturnValue('/admin/invites')
})

describe('Members section layout', () => {
  it("draws the section's tabs above the page, with the current page's tab selected", async () => {
    jest.mocked(getSession).mockResolvedValue(admin as never)

    await renderLayout()

    const list = screen.getByRole('tablist', { name: 'Members' })
    expect(list).toHaveAttribute('data-testid', 'admin-section-tabs-members')
    expect(within(list).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Users', 'Invites', 'Affiliates'])
    expect(screen.getByTestId('admin-section-tab-invites')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('admin-section-tab-users')).toHaveAttribute('href', '/admin/users')
    expect(screen.getByTestId('admin-section-tab-affiliates')).toHaveAttribute('href', '/admin/affiliates')
    expect(list.compareDocumentPosition(screen.getByText('Page')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('draws Users and Affiliates for Support, and never Invites', async () => {
    jest.mocked(getSession).mockResolvedValue(support as never)
    mockPathname.mockReturnValue('/admin/users')

    await renderLayout()

    const list = screen.getByRole('tablist', { name: 'Members' })
    expect(within(list).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Users', 'Affiliates'])
    expect(screen.getByTestId('admin-section-tab-users')).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByTestId('admin-section-tab-invites')).not.toBeInTheDocument()
  })

  it("selects Affiliates on its page, whose own tabs change only the query, so the strip stays", async () => {
    jest.mocked(getSession).mockResolvedValue(admin as never)
    mockPathname.mockReturnValue('/admin/affiliates')

    await renderLayout()

    expect(screen.getByTestId('admin-section-tab-affiliates')).toHaveAttribute('aria-selected', 'true')
  })

  it.each(['/admin/users/u1', '/admin/users/u1/rewind/2026', '/admin/invites/i1'])(
    'draws no strip on %s, a page below a tab, and still renders the page',
    async (pathname) => {
      jest.mocked(getSession).mockResolvedValue(admin as never)
      mockPathname.mockReturnValue(pathname)

      await renderLayout()

      expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
      expect(screen.getByText('Page')).toBeInTheDocument()
    }
  )

  it('draws no tabs without a session, and still renders the page', async () => {
    jest.mocked(getSession).mockResolvedValue(null)

    await renderLayout()

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.getByText('Page')).toBeInTheDocument()
  })
})
