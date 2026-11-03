/**
 * The section tab strip: a named tablist of links with the current page's tab
 * selected, and nothing on a page below the section's tabs.
 */

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import type { Route } from 'next'
import { usePathname } from 'next/navigation'

import { SectionTabs, type SectionTab } from '@/components/admin/section-tabs'

expect.extend(toHaveNoViolations)

jest.mock('next/navigation', () => ({ usePathname: jest.fn() }))
// The real Link prefetches on an IntersectionObserver timer, outside act().
jest.mock('next/link', () => {
  const MockLink = ({ href, ...props }: { href: string } & React.ComponentProps<'a'>) => <a href={href} {...props} />
  return MockLink
})

const mockPathname = usePathname as jest.Mock

const tabs: SectionTab[] = [
  { id: 'season', label: 'Season', href: '/admin/rewind' as Route },
  { id: 'playground', label: 'Playground', href: '/admin/rewind/playground' as Route },
  { id: 'shares', label: 'Shares', href: '/admin/shares' as Route },
  { id: 'rewind-settings', label: 'Settings', href: '/admin/rewind/settings' as Route },
]

const strip = () => <SectionTabs itemId="rewind" label="Rewind" tabs={tabs} />

function renderAt(pathname: string | null) {
  mockPathname.mockReturnValue(pathname)
  return render(strip())
}

describe('SectionTabs', () => {
  it("renders a named tablist of links with the current page's tab selected, and no axe violations", async () => {
    const { container } = renderAt('/admin/rewind/playground')

    const list = screen.getByRole('tablist', { name: 'Rewind' })
    expect(list).toHaveAttribute('data-testid', 'admin-section-tabs-rewind')
    for (const tab of tabs) {
      const link = within(list).getByTestId(`admin-section-tab-${tab.id}`)
      const current = tab.id === 'playground'
      expect(link).toBeInstanceOf(HTMLAnchorElement)
      expect(link).toHaveAttribute('href', tab.href)
      expect(link).toHaveTextContent(tab.label)
      expect(link).toHaveAttribute('role', 'tab')
      expect(link).toHaveAttribute('aria-selected', String(current))
      expect(link.hasAttribute('data-active')).toBe(current)
    }
    expect(await axe(container)).toHaveNoViolations()
  })

  it("sits in an admin page's width and gutters, so it lines up with the page header below it", () => {
    const { container } = renderAt('/admin/rewind')

    expect(container.firstElementChild).toHaveClass('mx-auto', 'w-full', 'max-w-7xl', 'px-4', 'md:px-6')
  })

  it('selects the tab of the page it is on as the pathname changes', () => {
    const { rerender } = renderAt('/admin/rewind')
    expect(screen.getByTestId('admin-section-tab-season')).toHaveAttribute('aria-selected', 'true')

    mockPathname.mockReturnValue('/admin/shares')
    rerender(strip())

    expect(screen.getByTestId('admin-section-tab-shares')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('admin-section-tab-season')).toHaveAttribute('aria-selected', 'false')
  })

  it('moves focus with the arrow keys but leaves the selection to the page', async () => {
    const user = userEvent.setup()
    renderAt('/admin/rewind')

    await user.tab()
    expect(screen.getByTestId('admin-section-tab-season')).toHaveFocus()
    await user.keyboard('{ArrowRight}')

    expect(screen.getByTestId('admin-section-tab-playground')).toHaveFocus()
    expect(screen.getByTestId('admin-section-tab-playground')).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByTestId('admin-section-tab-season')).toHaveAttribute('aria-selected', 'true')
  })

  it.each([
    ['a page below a tab', '/admin/rewind/abc/history'],
    ['a page outside the section', '/admin/users'],
    ['an unknown pathname', null],
  ])('renders nothing on %s', (_name, pathname) => {
    const { container } = renderAt(pathname)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for a user who may open none of the tabs', () => {
    mockPathname.mockReturnValue('/admin/rewind')
    const { container } = render(<SectionTabs itemId="rewind" label="Rewind" tabs={[]} />)

    expect(container).toBeEmptyDOMElement()
  })

  describe('the selected tab in view', () => {
    // On a phone a long strip scrolls inside its list, so the selected tab can start off-screen
    const original = Element.prototype.scrollIntoView
    const scrolled = () => jest.mocked(Element.prototype.scrollIntoView)

    beforeEach(() => {
      Element.prototype.scrollIntoView = jest.fn()
    })

    afterEach(() => {
      Element.prototype.scrollIntoView = original
    })

    it('scrolls the selected tab into view once on mount', () => {
      renderAt('/admin/rewind/settings')

      expect(scrolled()).toHaveBeenCalledTimes(1)
      expect(scrolled()).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
      expect(scrolled().mock.contexts[0]).toBe(screen.getByTestId('admin-section-tab-rewind-settings'))
    })

    it('scrolls the newly selected tab when the page changes, and only then', () => {
      const { rerender } = renderAt('/admin/rewind')
      expect(scrolled()).toHaveBeenCalledTimes(1)
      expect(scrolled().mock.contexts[0]).toBe(screen.getByTestId('admin-section-tab-season'))

      rerender(strip())
      expect(scrolled()).toHaveBeenCalledTimes(1)

      mockPathname.mockReturnValue('/admin/shares')
      rerender(strip())

      expect(scrolled()).toHaveBeenCalledTimes(2)
      expect(scrolled().mock.contexts[1]).toBe(screen.getByTestId('admin-section-tab-shares'))
    })

    it('scrolls nothing on a page that shows no strip', () => {
      renderAt('/admin/rewind/abc/history')

      expect(scrolled()).not.toHaveBeenCalled()
    })
  })
})
