/**
 * The admin shell (P6.1, ui-design-system 6.2): the current item, the flat
 * nav in the sidebar and the More sheet (the one phone menu), the failed-jobs
 * dot, sign out and when the assistant's links appear.
 */

import { ADMIN_NAV, navTestId } from '@/lib/admin/nav'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import { signOut } from 'next-auth/react'
import { usePathname } from 'next/navigation'

import { AdminShell } from '@/components/shell/admin-shell'
import { ToastProvider } from '@/components/ui/toast'
import type { NavCounts } from '@/lib/admin/nav'

expect.extend(toHaveNoViolations)

jest.mock('next-auth/react', () => ({ signOut: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/actions/appearance', () => ({ setAppearance: jest.fn() }))
// The real Link prefetches on an IntersectionObserver timer, outside act(), and
// a click on it makes jsdom log a navigation it does not implement.
jest.mock('next/link', () => {
  const MockLink = ({ href, onClick, ...props }: { href: string } & React.ComponentProps<'a'>) => (
    <a
      href={href}
      onClick={(event) => {
        onClick?.(event)
        event.preventDefault()
      }}
      {...props}
    />
  )
  return MockLink
})

const push = jest.fn()
const refresh = jest.fn()
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  useRouter: () => ({ push, refresh }),
}))

const mockPathname = usePathname as jest.Mock
const noAxeRegion = { rules: { region: { enabled: false } } }

function renderShell({ counts = { users: 7, pendingAffiliates: 2, failedJobs: 0 }, assistant = true }: { counts?: NavCounts; assistant?: boolean } = {}) {
  return render(
    <ToastProvider>
      <AdminShell
        serverName="Northfield Plex"
        user={{ name: 'Dana Whitfield', initials: 'DW' }}
        navCounts={counts}
        // The server leaves Assistant out without assistant:use, or while AI is off and the user has no saved conversations (lib/admin/shell.ts)
        nav={ADMIN_NAV.filter((item) => assistant || item.id !== 'assistant').map((item) => ({
          id: item.id,
          href: item.href,
          childIds: item.children?.map((child) => child.id) ?? [],
        }))}
        scoped={false}
      >
        <p>Page</p>
      </AdminShell>
    </ToastProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPathname.mockReturnValue('/admin/users')
})

describe('AdminShell', () => {
  it('marks Members current on a user detail page, with no axe violations', async () => {
    mockPathname.mockReturnValue('/admin/users/u1')
    const { container } = renderShell()

    const sidebar = screen.getByTestId('admin-sidebar')
    expect(within(sidebar).getByTestId('admin-nav-members')).toHaveAttribute('aria-current', 'page')
    expect(within(sidebar).getByTestId('admin-nav-overview')).not.toHaveAttribute('aria-current')
    expect(within(sidebar).getByRole('navigation', { name: 'Admin' })).toBeInTheDocument()
    expect(screen.getByTestId('admin-tab-members')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('admin-tab-more')).not.toHaveClass('text-foreground')
    expect(container.querySelectorAll('main#main')).toHaveLength(1)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('shows the counts and labels the tab bar', () => {
    renderShell({ counts: { users: 7, pendingAffiliates: 2, failedJobs: 2 } })

    const sidebar = screen.getByTestId('admin-sidebar')
    // Pending applications outrank the member count, and active invites have no badge
    expect(within(sidebar).getByTestId('admin-nav-members-badge')).toHaveTextContent('2 pending')
    expect(sidebar).not.toHaveTextContent('3 active')
    expect(within(sidebar).getByTestId('admin-nav-automations-badge')).toHaveTextContent('2 failed')
    const tabs = within(screen.getByTestId('admin-tab-bar')).getAllByRole('listitem')
    // Automations owns the failed-jobs dot, and Settings opens from More
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Overview', 'Members', 'Rewind', 'Automations, jobs have failed', 'More'])
    expect(screen.getByTestId('admin-tab-rewind')).toHaveAttribute('href', '/admin/rewind')
    expect(screen.queryByTestId('admin-tab-settings')).not.toBeInTheDocument()
  })

  it('lists every item in the sidebar as one flat list, with no group headings', () => {
    renderShell()

    const nav = within(within(screen.getByTestId('admin-sidebar')).getByRole('navigation', { name: 'Admin' }))
    const [list, ...others] = nav.getAllByRole('list')
    expect(others).toEqual([])
    expect(within(list).getAllByRole('link').map((link) => link.getAttribute('data-testid'))).toEqual(ADMIN_NAV.map(navTestId))
    expect(nav.queryAllByRole('heading')).toEqual([])
  })

  it('opens the More sheet with every item in one flat list, and Escape returns focus to More', async () => {
    const user = userEvent.setup()
    renderShell()

    expect(screen.queryByTestId('admin-tab-more-failed')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('admin-tab-more'))
    const sheet = await screen.findByRole('dialog', { name: 'More' })

    expect(screen.getByTestId('admin-more-sheet')).toBe(sheet)
    const nav = within(within(sheet).getByRole('navigation', { name: 'Admin' }))
    const [items, account, ...others] = nav.getAllByRole('list')
    expect(others).toEqual([])
    expect(within(items).getAllByRole('link').map((link) => link.getAttribute('data-testid'))).toEqual(
      ADMIN_NAV.map((item) => `${navTestId(item)}-mobile`)
    )
    expect(within(account).getByTestId('admin-back-home-mobile')).toHaveAttribute('href', '/')
    expect(within(account).getByTestId('admin-sign-out-mobile')).toBeInTheDocument()
    // No section headings: the sheet's own title is the only one
    expect(within(sheet).getAllByRole('heading').map((heading) => heading.textContent)).toEqual(['More'])
    expect(within(sheet).queryAllByRole('region')).toEqual([])
    expect(within(sheet).getByTestId('admin-nav-members-mobile')).toHaveAttribute('aria-current', 'page')
    expect(await axe(document.body, noAxeRegion)).toHaveNoViolations()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'More' })).not.toBeInTheDocument())
    expect(screen.getByTestId('admin-tab-more')).toHaveFocus()
  })

  it('puts the destructive dot on the Automations tab while jobs have failed, and none on More', () => {
    renderShell({ counts: { users: 1, pendingAffiliates: 0, failedJobs: 4 } })

    expect(screen.getByTestId('admin-tab-automations-failed')).toBeInTheDocument()
    expect(screen.getByTestId('admin-tab-automations')).toHaveAccessibleName(/^Automations ?, jobs have failed$/)
    expect(screen.queryByTestId('admin-tab-more-failed')).not.toBeInTheDocument()
    expect(screen.getByTestId('admin-tab-more')).toHaveAccessibleName('More')
  })

  it.each([0, null])('draws no dot with %p failed jobs (null is Redis down)', (failedJobs) => {
    renderShell({ counts: { users: 1, pendingAffiliates: 0, failedJobs } })

    expect(screen.queryByTestId('admin-tab-automations-failed')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-tab-more-failed')).not.toBeInTheDocument()
    expect(screen.getByTestId('admin-tab-automations')).toHaveAccessibleName('Automations')
  })

  it('lights More, and no tab, on a page that only More opens', () => {
    mockPathname.mockReturnValue('/admin/settings')
    renderShell()

    const tabs = within(screen.getByTestId('admin-tab-bar'))
    expect(tabs.getAllByRole('link').filter((tab) => tab.hasAttribute('aria-current'))).toEqual([])
    expect(screen.getByTestId('admin-tab-more')).toHaveClass('text-foreground')
  })

  it('has one phone menu: the top bar keeps the wordmark, search and assistant, with no menu button', () => {
    renderShell()

    const bar = within(screen.getByTestId('admin-mobile-bar'))
    expect(bar.getByTestId('admin-mobile-home')).toHaveAttribute('href', '/admin')
    expect(bar.getByTestId('admin-command-trigger-mobile')).toBeInTheDocument()
    expect(bar.getByTestId('admin-assistant-link-mobile')).toHaveAttribute('href', '/admin/assistant')
    expect(screen.queryByTestId('admin-menu-button')).not.toBeInTheDocument()
    expect(bar.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument()
  })

  it('closes the More sheet once a link in it is chosen', async () => {
    const user = userEvent.setup()
    renderShell()

    await user.click(screen.getByTestId('admin-tab-more'))
    const sheet = await screen.findByRole('dialog', { name: 'More' })
    expect(within(sheet).getByTestId('admin-nav-settings-mobile')).toHaveAttribute('href', '/admin/settings')

    await user.click(within(sheet).getByTestId('admin-nav-settings-mobile'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'More' })).not.toBeInTheDocument())
  })

  it('keeps Back to home and Sign out in the sidebar footer', async () => {
    const user = userEvent.setup()
    renderShell()

    expect(screen.getByTestId('admin-back-home')).toHaveAttribute('href', '/')
    expect(screen.getByTestId('admin-sidebar')).toHaveTextContent('Dana Whitfield')
    await user.click(screen.getByTestId('admin-sign-out'))
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ redirect: false }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'))
  })

  it('links to the assistant page from the sidebar, after Overview, and from the top bar', () => {
    renderShell()

    const sidebar = within(screen.getByTestId('admin-sidebar'))
    expect(sidebar.getByTestId('admin-nav-assistant')).toHaveAttribute('href', '/admin/assistant')
    const nav = within(sidebar.getByRole('navigation', { name: 'Admin' }))
    expect(nav.getAllByRole('link').slice(0, 3).map((link) => link.textContent)).toEqual(['Overview', 'Assistant', 'Members2 pending'])
    expect(screen.getByTestId('admin-assistant-link-mobile')).toHaveAttribute('href', '/admin/assistant')
    expect(screen.getByTestId('admin-assistant-link-mobile')).not.toHaveAttribute('aria-current')
  })

  it('marks the assistant current on its page', () => {
    mockPathname.mockReturnValue('/admin/assistant')
    renderShell()

    expect(within(screen.getByTestId('admin-sidebar')).getByTestId('admin-nav-assistant')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('admin-assistant-link-mobile')).toHaveAttribute('aria-current', 'page')
  })

  it('has no assistant link when the server leaves it out', () => {
    renderShell({ assistant: false })

    expect(screen.queryByTestId('admin-nav-assistant')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-assistant-link-mobile')).not.toBeInTheDocument()
  })

  it('steps aside on an immersive route, assistant link included', () => {
    mockPathname.mockReturnValue('/admin/wrapped/w1/history/l1')
    renderShell()

    expect(screen.queryByTestId('admin-sidebar')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-tab-bar')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-assistant-link-mobile')).not.toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveTextContent('Page')
  })

  it('keeps the nav, the assistant link included, on the admin Rewind preview (P7.9)', () => {
    mockPathname.mockReturnValue('/admin/users/u1/rewind/2026')
    renderShell()

    expect(screen.getByTestId('admin-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('admin-tab-bar')).toBeInTheDocument()
    expect(screen.getByTestId('admin-assistant-link-mobile')).toBeInTheDocument()
  })

  it('offers Appearance beside Sign out (P10.10)', async () => {
    const user = userEvent.setup()
    renderShell()
    await user.click(screen.getByRole('button', { name: 'Appearance' }))
    const menu = await screen.findByRole('menu')

    expect(within(menu).getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true')
    expect(within(menu).getByRole('menuitemradio', { name: 'Light' })).toHaveAttribute('aria-checked', 'false')
  })
})
