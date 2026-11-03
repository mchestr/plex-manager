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
    // On a phone a long strip scrolls inside its list, so the selected tab can start off-screen. The
    // list's own scroll offset moves; the tab is never scrollIntoView'd, which in Chromium would also
    // move the sequential-focus starting point past the skip link.
    const box = (left: number, right: number) => ({ left, right, top: 0, bottom: 40, width: right - left, height: 40, x: left, y: 0, toJSON: () => ({}) }) as DOMRect

    /** Lays the strip out as a 358px-wide list holding tabs of `tabWidth`px each, scrolled by `scrollLeft`. */
    function layOut({ scrollLeft = 0, tabWidth = 112 }: { scrollLeft?: number; tabWidth?: number } = {}) {
      const list = screen.getByRole('tablist')
      list.scrollLeft = scrollLeft
      jest.spyOn(list, 'getBoundingClientRect').mockReturnValue(box(0, 358))
      screen.getAllByRole('tab').forEach((tab, index) => {
        const left = index * tabWidth - scrollLeft
        jest.spyOn(tab, 'getBoundingClientRect').mockReturnValue(box(left, left + tabWidth))
      })
      return list
    }

    let scrollIntoView: jest.SpyInstance

    beforeEach(() => {
      scrollIntoView = jest.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('leaves the list alone when the selected tab is already in view', () => {
      mockPathname.mockReturnValue('/admin/rewind/playground')
      const { rerender } = render(strip())
      const list = layOut()

      rerender(strip())

      expect(list.scrollLeft).toBe(0)
    })

    it('scrolls the list right until a tab past its edge is in view, and never the tab itself', () => {
      mockPathname.mockReturnValue('/admin/rewind')
      const { rerender } = render(strip())
      const list = layOut()

      mockPathname.mockReturnValue('/admin/rewind/settings')
      rerender(strip())

      // The fourth tab spans 336..448 against a list ending at 358
      expect(list.scrollLeft).toBe(448 - 358)
      expect(scrollIntoView).not.toHaveBeenCalled()
    })

    it('scrolls the list left when the selected tab starts before its edge', () => {
      mockPathname.mockReturnValue('/admin/rewind/settings')
      const { rerender } = render(strip())
      const list = layOut({ scrollLeft: 200 })

      mockPathname.mockReturnValue('/admin/rewind/playground')
      rerender(strip())

      // The second tab spans 112..224 before scrolling; scrolled by 200 it starts 88px left of the list
      expect(list.scrollLeft).toBe(200 - 88)
    })

    it('scrolls nothing on a page that shows no strip', () => {
      renderAt('/admin/rewind/abc/history')

      expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
      expect(scrollIntoView).not.toHaveBeenCalled()
    })
  })
})
