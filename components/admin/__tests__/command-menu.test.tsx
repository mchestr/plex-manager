/**
 * The admin command menu (P10.16): Ctrl K opens it, destinations filter
 * locally, the arrow keys and Enter navigate, Escape closes it and returns
 * focus, and server results appear in their own groups.
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'

import { createQueryWrapper } from '@/__tests__/helpers/query-client'
import { CommandMenuProvider, CommandMenuTrigger } from '@/components/admin/command-menu'

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

function renderMenu() {
  const Wrapper = createQueryWrapper()
  render(
    <Wrapper>
      <CommandMenuProvider>
        <CommandMenuTrigger data-testid="admin-command-trigger">Search or jump to</CommandMenuTrigger>
      </CommandMenuProvider>
    </Wrapper>
  )
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

    expect(mockPush).toHaveBeenCalledWith('/admin/invites')
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
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
