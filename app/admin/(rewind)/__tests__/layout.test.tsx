/**
 * The Rewind section's layout: the tab strip above its pages, with the tabs
 * the signed-in user may open, and no strip without a session.
 */

import { render, screen, within } from '@testing-library/react'
import { usePathname } from 'next/navigation'

import RewindSectionLayout from '@/app/admin/(rewind)/layout'
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
  render(await RewindSectionLayout({ children: <p>Page</p> }))
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPathname.mockReturnValue('/admin/rewind/playground')
})

describe('Rewind section layout', () => {
  it("draws the section's tabs above the page, with the current page's tab selected", async () => {
    jest.mocked(getSession).mockResolvedValue({ user: { id: 'admin-1', isAdmin: true }, expires: '' } as never)

    await renderLayout()

    const list = screen.getByRole('tablist', { name: 'Rewind' })
    expect(within(list).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Season', 'Playground', 'Shares', 'Settings'])
    expect(screen.getByTestId('admin-section-tab-playground')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('admin-section-tab-rewind-settings')).toHaveAttribute('href', '/admin/rewind/settings')
    expect(screen.getByText('Page')).toBeInTheDocument()
    expect(list.compareDocumentPosition(screen.getByText('Page')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('draws no tabs without a session, and still renders the page', async () => {
    jest.mocked(getSession).mockResolvedValue(null)

    await renderLayout()

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.getByText('Page')).toBeInTheDocument()
  })
})
