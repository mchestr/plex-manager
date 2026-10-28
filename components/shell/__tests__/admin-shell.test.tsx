/**
 * The admin shell (P6.1, ui-design-system 6.2): the current item, the More
 * sheet, the failed-jobs dot, sign out and when the assistant's links appear.
 */

import { ADMIN_NAV } from '@/lib/admin/nav'
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

const push = jest.fn()
const refresh = jest.fn()
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  useRouter: () => ({ push, refresh }),
}))

const mockPathname = usePathname as jest.Mock
const noAxeRegion = { rules: { region: { enabled: false } } }

function renderShell({ counts = { users: 7, activeInvites: 3, failedJobs: 0 }, assistant = true }: { counts?: NavCounts; assistant?: boolean } = {}) {
  return render(
    <ToastProvider>
      <AdminShell
        serverName="Northfield Plex"
        user={{ name: 'Dana Whitfield', initials: 'DW' }}
        navCounts={counts}
        // The server leaves Assistant out without assistant:use, or while AI is off and the user has no saved conversations (lib/admin/shell.ts)
        navIds={ADMIN_NAV.map((item) => item.id).filter((id) => assistant || id !== 'assistant')}
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
  it('marks Users current on a user detail page, with no axe violations', async () => {
    mockPathname.mockReturnValue('/admin/users/u1')
    const { container } = renderShell()

    const sidebar = screen.getByTestId('admin-sidebar')
    expect(within(sidebar).getByTestId('admin-nav-users')).toHaveAttribute('aria-current', 'page')
    expect(within(sidebar).getByTestId('admin-nav-invites')).not.toHaveAttribute('aria-current')
    expect(within(sidebar).getByRole('navigation', { name: 'Admin' })).toBeInTheDocument()
    expect(screen.getByTestId('admin-tab-users')).toHaveAttribute('aria-current', 'page')
    expect(container.querySelectorAll('main#main')).toHaveLength(1)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('shows the counts and labels the tab bar', () => {
    renderShell({ counts: { users: 7, activeInvites: 3, failedJobs: 2 } })

    const sidebar = screen.getByTestId('admin-sidebar')
    expect(within(sidebar).getByTestId('admin-nav-users')).toHaveTextContent('7')
    expect(within(sidebar).getByTestId('admin-nav-invites')).toHaveTextContent('3 active')
    expect(within(sidebar).getByTestId('admin-nav-queues')).toHaveTextContent('2 failed')
    const tabs = within(screen.getByTestId('admin-tab-bar')).getAllByRole('listitem')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Overview', 'Users', 'Rewind', 'Settings', 'More, jobs have failed'])
    expect(screen.getByTestId('admin-tab-rewind')).toHaveAttribute('href', '/admin/rewind')
  })

  it('opens the grouped More sheet, and Escape returns focus to More', async () => {
    const user = userEvent.setup()
    renderShell()

    expect(screen.queryByTestId('admin-tab-more-failed')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('admin-tab-more'))
    const sheet = await screen.findByRole('dialog', { name: 'More' })

    expect(screen.getByTestId('admin-more-sheet')).toBe(sheet)
    for (const group of ['Community', 'Rewind', 'Usage and cost', 'System']) {
      expect(within(sheet).getByRole('region', { name: group })).toBeInTheDocument()
    }
    expect(within(within(sheet).getByRole('region', { name: 'Rewind' })).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Season',
      'Playground',
      'Share analytics',
    ])
    expect(within(sheet).getByTestId('admin-nav-users-mobile')).toHaveAttribute('aria-current', 'page')
    expect(await axe(document.body, noAxeRegion)).toHaveNoViolations()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'More' })).not.toBeInTheDocument())
    expect(screen.getByTestId('admin-tab-more')).toHaveFocus()
  })

  it('puts a destructive dot on More while jobs have failed', () => {
    renderShell({ counts: { users: 1, activeInvites: 0, failedJobs: 4 } })

    expect(screen.getByTestId('admin-tab-more-failed')).toBeInTheDocument()
    expect(screen.getByTestId('admin-tab-more')).toHaveAccessibleName(/^More ?, jobs have failed$/)
  })

  it('draws no dot when Redis is down', () => {
    renderShell({ counts: { users: 1, activeInvites: 0, failedJobs: null } })

    expect(screen.queryByTestId('admin-tab-more-failed')).not.toBeInTheDocument()
  })

  it('opens the menu sheet from the mobile top bar', async () => {
    const user = userEvent.setup()
    renderShell()

    await user.click(screen.getByTestId('admin-menu-button'))
    const sheet = await screen.findByRole('dialog', { name: 'Admin' })
    expect(within(sheet).getByTestId('admin-back-home-mobile')).toHaveAttribute('href', '/')

    await user.click(within(sheet).getByTestId('admin-nav-settings-mobile'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Admin' })).not.toBeInTheDocument())
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
    expect(nav.getAllByRole('link').slice(0, 3).map((link) => link.textContent)).toEqual(['Overview', 'Assistant', 'Users7'])
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
