/**
 * The admin command menu (P10.16): Ctrl K opens it, destinations filter
 * locally (the pages and, as "Page › Tab", their section tabs), the arrow
 * keys and Enter navigate, Escape closes it and returns focus, and server
 * results appear in their own groups.
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'

import { createQueryWrapper } from '@/__tests__/helpers/query-client'
import { CommandMenuProvider, CommandMenuTrigger } from '@/components/admin/command-menu'
import { AdminNavProvider } from '@/components/shell/admin-nav-context'
import { ADMIN_NAV } from '@/lib/admin/nav'
import type { AdminShellNavEntry } from '@/lib/admin/shell'

expect.extend(toHaveNoViolations)

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))

const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()

function respond(results: Record<'users' | 'invites', unknown[]>) {
  fetchMock.mockImplementation(async (input) => {
    const kind = new URL(String(input), 'http://localhost').searchParams.get('kind') as 'users' | 'invites'
    return { ok: true, status: 200, json: async () => ({ results: results[kind] }) } as Response
  })
}

/** Without `nav` the menu reads the nav context's default: every item and tab of the admin nav. */
function renderMenu(nav?: AdminShellNavEntry[]) {
  const Wrapper = createQueryWrapper()
  const menu = (
    <CommandMenuProvider>
      <CommandMenuTrigger data-testid="admin-command-trigger">Search or jump to</CommandMenuTrigger>
    </CommandMenuProvider>
  )
  render(
    <Wrapper>
      {nav ? (
        <AdminNavProvider nav={nav} scoped={false}>
          {menu}
        </AdminNavProvider>
      ) : (
        menu
      )}
    </Wrapper>
  )
}

/** The test ids of the "Go to" entries, in the order the menu lists them. */
function pageIds(dialog: HTMLElement): (string | null)[] {
  return within(dialog)
    .queryAllByTestId(/^admin-command-page-/)
    .map((entry) => entry.getAttribute('data-testid'))
}

beforeEach(() => {
  mockPush.mockReset()
  fetchMock.mockReset()
  respond({ users: [], invites: [] })
  global.fetch = fetchMock
})

describe('CommandMenu', () => {
  it('opens on Ctrl K with no axe violations', async () => {
    const user = userEvent.setup()
    renderMenu()

    await user.keyboard('{Control>}k{/Control}')

    const dialog = await screen.findByRole('dialog', { name: 'Search or jump to' })
    expect(within(dialog).getByRole('combobox')).toHaveFocus()
    expect(within(dialog).getByText('Users')).toBeInTheDocument()
    expect(within(dialog).getByText('Create invite')).toBeInTheDocument()
    expect(await axe(document.body)).toHaveNoViolations()
  })

  it('opens on Cmd K too, and Ctrl K again closes it', async () => {
    const user = userEvent.setup()
    renderMenu()

    await user.keyboard('{Meta>}k{/Meta}')
    await screen.findByRole('dialog')
    await user.keyboard('{Control>}k{/Control}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('filters destinations locally: "set" shows Settings', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.keyboard('{Control>}k{/Control}')
    const dialog = await screen.findByRole('dialog')

    await user.keyboard('set')

    expect(within(dialog).getByTestId('admin-command-page-settings')).toBeInTheDocument()
    expect(within(dialog).queryByTestId('admin-command-page-users')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Create invite')).not.toBeInTheDocument()
  })

  it('moves with ArrowDown and navigates with Enter', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.keyboard('{Control>}k{/Control}')
    const dialog = await screen.findByRole('dialog')

    await user.keyboard('{ArrowDown}{Enter}')

    // Overview, then Assistant: the nav's own order
    expect(mockPush).toHaveBeenCalledWith('/admin/assistant')
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
  })

  it('lists pages by their label alone: no group beside them, and a group name finds nothing', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.keyboard('{Control>}k{/Control}')
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByTestId('admin-command-page-users')).toBeInTheDocument()
    for (const group of ['Community', 'Usage and cost', 'System']) {
      expect(within(dialog).queryByText(group)).not.toBeInTheDocument()
    }

    await user.keyboard('community')

    expect(await within(dialog).findByText('No matches')).toBeInTheDocument()
    expect(within(dialog).queryByTestId('admin-command-page-users')).not.toBeInTheDocument()
  })

  it('lists Overview first (P10.8)', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.keyboard('{Control>}k{/Control}')
    const dialog = await screen.findByRole('dialog')

    await user.keyboard('over')

    expect(within(dialog).getByTestId('admin-command-page-overview')).toBeInTheDocument()
  })

  it('finds a section tab by its own name and opens it: "request" is Automations › Request limits', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.keyboard('{Control>}k{/Control}')
    const dialog = await screen.findByRole('dialog')

    await user.keyboard('request')

    expect(pageIds(dialog)).toEqual(['admin-command-page-automations-request-limits'])
    const tab = within(dialog).getByTestId('admin-command-page-automations-request-limits')
    expect(tab).toHaveTextContent(/^Automations › Request limits$/)
    await waitFor(() => expect(tab).toHaveAttribute('aria-selected', 'true'))

    await user.keyboard('{Enter}')
    expect(mockPush).toHaveBeenCalledWith('/admin/request-limits')
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
  })

  it('finds every tab of a page by the page name, after the page itself', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.keyboard('{Control>}k{/Control}')
    const dialog = await screen.findByRole('dialog')

    await user.keyboard('automations')

    expect(pageIds(dialog)).toEqual([
      'admin-command-page-automations',
      'admin-command-page-automations-watchlist',
      'admin-command-page-automations-inactivity',
      'admin-command-page-automations-request-limits',
      'admin-command-page-automations-queues',
    ])
    expect(within(dialog).getByText('Automations › Watchlist sync')).toBeInTheDocument()
  })

  it.each([
    // Tabs whose pages sit beside the page, not below it, open where the tab says
    ['shares', 'admin-command-page-rewind-shares', '/admin/shares'],
    ['cost', 'admin-command-page-ai-ai-cost', '/admin/cost-analysis'],
    ['discord', 'admin-command-page-discord-discord-settings', '/admin/discord/settings'],
  ])('opens a tab on its own page: "%s" then %s goes to %s', async (term, testId, href) => {
    const user = userEvent.setup()
    renderMenu()
    await user.keyboard('{Control>}k{/Control}')
    const dialog = await screen.findByRole('dialog')

    await user.keyboard(term)
    await user.click(within(dialog).getByTestId(testId))

    expect(mockPush).toHaveBeenCalledWith(href)
  })

  it('lists a page without tabs by itself', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.keyboard('{Control>}k{/Control}')
    const dialog = await screen.findByRole('dialog')

    await user.keyboard('audit')

    expect(pageIds(dialog)).toEqual(['admin-command-page-audit'])
  })

  it('lists the pages first, then each page\'s tabs in nav order, and no Settings group', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.keyboard('{Control>}k{/Control}')
    const dialog = await screen.findByRole('dialog')

    const pages = ADMIN_NAV.map((item) => `admin-command-page-${item.id}`)
    const tabs = ADMIN_NAV.flatMap((item) => (item.children ?? []).map((child) => `admin-command-page-${item.id}-${child.id}`))
    expect(tabs.length).toBeGreaterThan(0)
    expect(pageIds(dialog)).toEqual([...pages, ...tabs])

    // Settings sections (Plex, Stripe, Privacy) are not nav tabs, so they are not destinations
    await user.keyboard('plex')
    expect(await within(dialog).findByText('No matches')).toBeInTheDocument()
  })

  it('lists only the tabs the server allowed, and opens a page where the server sent it', async () => {
    const user = userEvent.setup()
    // A role that may open Queues alone: Automations opens there and its other tabs do not exist for it
    renderMenu([
      { id: 'overview', href: '/admin', childIds: [] },
      { id: 'automations', href: '/admin/queues', childIds: ['queues'] },
    ])
    await user.keyboard('{Control>}k{/Control}')
    const dialog = await screen.findByRole('dialog')

    expect(pageIds(dialog)).toEqual(['admin-command-page-overview', 'admin-command-page-automations', 'admin-command-page-automations-queues'])

    await user.click(within(dialog).getByTestId('admin-command-page-automations'))
    expect(mockPush).toHaveBeenCalledWith('/admin/queues')
  })

  it('finds no tab the server left out, and a page left without tabs lists only itself', async () => {
    const user = userEvent.setup()
    renderMenu([
      { id: 'rewind', href: '/admin/rewind', childIds: [] },
      { id: 'automations', href: '/admin/watchlist', childIds: ['watchlist'] },
    ])
    await user.keyboard('{Control>}k{/Control}')
    const dialog = await screen.findByRole('dialog')

    await user.keyboard('request')
    expect(await within(dialog).findByText('No matches')).toBeInTheDocument()
    expect(pageIds(dialog)).toEqual([])

    await user.clear(within(dialog).getByTestId('admin-command-input'))
    await user.keyboard('rewind')
    expect(pageIds(dialog)).toEqual(['admin-command-page-rewind'])
  })

  it('shows members and invites from the search route and opens one', async () => {
    respond({
      users: [{ id: 'user-1', label: 'Regular User', sub: 'regular@example.com, Member', href: '/admin/users/user-1' }],
      invites: [],
    })
    const user = userEvent.setup()
    renderMenu()
    await user.keyboard('{Control>}k{/Control}')
    const dialog = await screen.findByRole('dialog')

    await user.keyboard('Regular')
    const item = await within(dialog).findByTestId('admin-command-user-user-1')
    expect(within(dialog).getByText('Members')).toBeInTheDocument()
    await waitFor(() => expect(item).toHaveAttribute('aria-selected', 'true'))

    await user.keyboard('{Enter}')
    expect(mockPush).toHaveBeenCalledWith('/admin/users/user-1')
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    renderMenu()
    const trigger = screen.getByTestId('admin-command-trigger')

    await user.click(trigger)
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
