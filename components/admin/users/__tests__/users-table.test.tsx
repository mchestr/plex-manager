import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { makeAdminUserWithStats, makeLlmUsageStats } from '@/__tests__/utils/test-builders'
import { currentHref, resetUrl } from '@/__tests__/helpers/url-router'
import { setUserDisabled, updateUserAdminStatus } from '@/actions/admin/admin-users'
import { adminGrantAccess, adminToggleExempt } from '@/actions/admin/subscriptions'
import { adminRegenerateRewind } from '@/actions/rewind-generation'
import { unshareUserLibrary } from '@/actions/user-queries'
import { UsersTable } from '@/components/admin/users/users-table'
import type { AdminUserWithWrappedStats } from '@/types/admin'

jest.mock('next/navigation', () => require('@/__tests__/helpers/url-router').navigationModule)
jest.mock('@/actions/admin/admin-users', () => ({ setUserDisabled: jest.fn(), updateUserAdminStatus: jest.fn() }))
jest.mock('@/actions/admin/subscriptions', () => ({
  adminGrantAccess: jest.fn(),
  adminToggleExempt: jest.fn(),
  adminCancelSubscription: jest.fn(),
}))
jest.mock('@/actions/rewind-generation', () => ({ adminRegenerateRewind: jest.fn() }))
jest.mock('@/actions/user-queries', () => ({ unshareUserLibrary: jest.fn() }))
jest.mock('@/actions/import-plex-users', () => ({ importPlexUsers: jest.fn() }))
const mockShowSuccess = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: jest.fn() }) }))

const NOW = Date.parse('2026-12-03T12:00:00Z')
const DAY = 86_400_000

const member = (id: string, name: string, overrides: Partial<AdminUserWithWrappedStats> = {}) =>
  makeAdminUserWithStats({ id, name, email: `${id}@example.com`, createdAt: new Date('2026-10-11T15:00:00Z'), ...overrides })

const ROWS = [
  member('u-sam', 'Sam Rivera', {
    hasPlexAccess: null,
    subscriptionStatus: 'PAST_DUE',
    currentPeriodEnd: new Date('2026-10-20T12:00:00Z'),
    totalLlmUsage: makeLlmUsageStats({ cost: 0.031 }),
  }),
  member('u-dana', 'Dana Whitfield', { isAdmin: true, isOwner: true }),
]

function renderTable(props: Partial<Parameters<typeof UsersTable>[0]> = {}) {
  return render(
    <UsersTable
      rows={ROWS}
      total={ROWS.length}
      memberCount={7}
      page={1}
      pageSize={25}
      sort={{ id: 'joined', desc: true }}
      year={2026}
      now={NOW}
      stripeEnabled={false}
      stripeDashboardBaseUrl={null}
      estimateCopy="It uses template text, so it costs nothing."
      unknownSub="Last checked 2 minutes ago"
      {...props}
    />
  )
}

async function openAction(name: string, item: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: `Actions for ${name}` }))
  await user.click(await screen.findByRole('menuitem', { name: item }))
  return user
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, advanceTimers: true })
  resetUrl('/admin/users')
  jest.clearAllMocks()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('UsersTable', () => {
  it('renders each cell from the shared vocabulary and formatters', () => {
    renderTable()

    const sam = screen.getByTestId('admin-users-row-u-sam')
    expect(within(sam).getByRole('link', { name: 'Sam Rivera' })).toHaveAttribute('href', '/admin/users/u-sam')
    expect(within(sam).getAllByRole('cell')[1]).toHaveTextContent('Member')
    expect(screen.getByTestId('admin-users-plex-u-sam')).toHaveTextContent('UnknownLast checked 2 minutes ago')
    expect(sam).toHaveTextContent('Past dueRetrying Oct 20')
    expect(within(sam).getByRole('link', { name: '$0.031' })).toHaveAttribute('href', '/admin/llm-usage?userId=u-sam')
    expect(sam).toHaveTextContent('Oct 11, 2026')

    const dana = screen.getByTestId('admin-users-row-u-dana')
    expect(dana).toHaveTextContent('Owner')
    expect(dana).toHaveTextContent('Owns the server')
    expect(dana).toHaveTextContent('Not required')
    expect(screen.getByTestId('admin-users-pagination-info')).toHaveTextContent('Showing all 2 members')
  })

  it("shows each member's services as badges (P11.10)", () => {
    renderTable({
      rows: [
        member('u-jf', 'Jo Fin', { plexUserId: null, jellyfinUserId: 'jf-1', services: ['jellyfin'], primaryService: 'jellyfin' }),
        member('u-both', 'Bo Th', { jellyfinUserId: 'jf-2', services: ['plex', 'jellyfin'] }),
      ],
    })

    expect(within(screen.getByTestId('admin-users-row-u-jf')).getByTestId('admin-user-service-badge')).toHaveTextContent('Jellyfin')
    expect(within(screen.getByTestId('admin-users-row-u-both')).getByTestId('admin-user-service-badge')).toHaveTextContent('PlexJellyfin')
  })

  it('heads the menu with the member and puts Remove Plex access last', async () => {
    renderTable()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Actions for Sam Rivera' }))
    expect(await screen.findByRole('menuitem', { name: 'View details' })).toHaveAttribute('href', '/admin/users/u-sam')
    const items = (await screen.findAllByRole('menuitem')).map((item) => item.textContent)
    expect(items).toEqual([
      'View details',
      'View Rewind 2026',
      'Regenerate Rewind...',
      'Make admin...',
      'Give Support role...',
      'Disable account...',
      'Remove Plex access...',
    ])
  })

  it('gates removal on typing the name, shows the pending label, and keeps an error inside the dialog', async () => {
    let settle: (value: Awaited<ReturnType<typeof unshareUserLibrary>>) => void = () => {}
    jest.mocked(unshareUserLibrary).mockReturnValue(new Promise((resolve) => (settle = resolve)))
    renderTable()

    const user = await openAction('Sam Rivera', 'Remove Plex access...')
    const dialog = await screen.findByTestId('admin-user-remove-access-dialog')
    expect(dialog).toHaveTextContent('Remove Plex access for Sam Rivera?')
    const confirm = screen.getByTestId('admin-user-remove-access-confirm')
    expect(confirm).toBeDisabled()

    await user.type(within(dialog).getByRole('textbox'), 'sam rivera')
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    expect(confirm).toHaveTextContent('Removing')
    expect(unshareUserLibrary).toHaveBeenCalledWith({ userId: 'u-sam' })

    settle({ success: false, code: 'PLEX_UNAVAILABLE', error: "Plex didn't respond. Try again in a few minutes." })
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("Plex didn't respond.")
    expect(screen.getByTestId('admin-user-remove-access-dialog')).toBeInTheDocument()
  })

  it('regenerates through a confirm with the estimate, and reports an ineligible member inside it', async () => {
    jest.mocked(adminRegenerateRewind).mockResolvedValue({ success: false, code: 'REWIND_NOT_ELIGIBLE', error: 'Not eligible' })
    renderTable()

    const user = await openAction('Sam Rivera', 'Regenerate Rewind...')
    const dialog = await screen.findByTestId('admin-user-regenerate-dialog')
    expect(dialog).toHaveTextContent("Regenerate Sam Rivera's Rewind 2026?")
    expect(dialog).toHaveTextContent('It uses template text, so it costs nothing.')
    await user.click(screen.getByTestId('admin-user-regenerate-confirm'))

    expect(adminRegenerateRewind).toHaveBeenCalledWith({ userId: 'u-sam', year: 2026 })
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
  })

  it('changes the role and disables the account through their confirms, closing on success', async () => {
    jest.mocked(updateUserAdminStatus).mockResolvedValue({ success: true, data: null })
    jest.mocked(setUserDisabled).mockResolvedValue({ success: true, data: { inviterRevoked: null } })
    renderTable()

    let user = await openAction('Sam Rivera', 'Make admin...')
    expect(await screen.findByTestId('admin-user-role-dialog')).toHaveTextContent('Make Sam Rivera an admin?')
    await user.click(screen.getByTestId('admin-user-role-confirm'))
    expect(updateUserAdminStatus).toHaveBeenCalledWith({ userId: 'u-sam', isAdmin: true })
    expect(mockShowSuccess).toHaveBeenCalledWith('Admin role granted')
    await waitFor(() => expect(screen.queryByTestId('admin-user-role-dialog')).not.toBeInTheDocument())

    user = await openAction('Sam Rivera', 'Disable account...')
    expect(await screen.findByTestId('admin-user-disable-dialog')).toHaveTextContent("Disable Sam Rivera's account?")
    await user.click(screen.getByTestId('admin-user-disable-confirm'))
    expect(setUserDisabled).toHaveBeenCalledWith({ userId: 'u-sam', disabled: true })
  })

  it('offers the billing actions only with Stripe on', async () => {
    jest.mocked(adminGrantAccess).mockResolvedValue({ success: false, code: 'UPSTREAM_UNAVAILABLE', error: 'Plex refused the invite' })
    jest.mocked(adminToggleExempt).mockResolvedValue({ success: true, data: null })
    renderTable({ stripeEnabled: true })

    const user = await openAction('Sam Rivera', 'Grant access and exempt...')
    const dialog = await screen.findByTestId('admin-user-grant-dialog')
    await user.click(screen.getByTestId('admin-user-grant-confirm'))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Plex refused the invite')
  })

  it('places every column on the card, each field under its label, and keeps the actions', async () => {
    renderTable()

    expect(screen.getByTestId('admin-users')).toHaveAttribute('data-table-size', 'wide')
    const sam = screen.getByTestId('admin-users-row-u-sam')
    const cells = within(sam).getAllByRole('cell')
    expect(cells.map((cell) => cell.dataset.card)).toEqual(['title', 'field', 'field', 'field', 'field', 'field', 'field', 'field', 'field', 'actions'])
    expect(cells[0].querySelector('[data-slot="cell-label"]')).toBeNull()
    expect([...sam.querySelectorAll('[data-slot="cell-label"]')].map((label) => label.textContent)).toEqual([
      'Role',
      'Service',
      'Plex access',
      'Last seen',
      'Subscription',
      'Rewind 2026',
      'LLM cost',
      'Joined',
    ])

    await openAction('Sam Rivera', 'Remove Plex access...')
    expect(await screen.findByTestId('admin-user-remove-access-dialog')).toBeInTheDocument()
  })

  it('shows the filtered EmptyState with Clear filters, and the first-use one with no members', async () => {
    resetUrl('/admin/users?role=admin&q=nobody')
    const { unmount } = renderTable({ rows: [], total: 0 })

    const empty = screen.getByTestId('admin-users-empty-filtered')
    expect(empty).toHaveTextContent('No members match these filters')
    await userEvent.setup().click(within(empty).getByRole('button', { name: 'Clear filters' }))
    expect(currentHref()).toBe('/admin/users')
    unmount()

    renderTable({ rows: [], total: 0, memberCount: 0 })
    expect(screen.getByTestId('admin-users-empty')).toHaveTextContent('No members yet')
  })

  it('shows how long ago each member was last seen from the server now, never the client clock', () => {
    // The client clock runs a year ahead of the render: the words still come from `now`
    jest.setSystemTime(NOW + 365 * DAY)
    renderTable({
      rows: [
        member('u-seen', 'Sam Seen', { lastSeenAt: new Date(NOW - 92 * DAY), lastSeenReadAt: new Date(NOW - DAY) }),
        member('u-never', 'Nia Never', { lastSeenAt: null, lastSeenReadAt: new Date(NOW - DAY) }),
        member('u-unknown', 'Uma Unknown', { lastSeenAt: null, lastSeenReadAt: null }),
      ],
    })

    const seen = screen.getByTestId('admin-users-last-seen-u-seen')
    expect(seen).toHaveTextContent(/^3 months ago$/)
    expect(seen.tagName).toBe('TIME')
    expect(seen).toHaveAttribute('dateTime', new Date(NOW - 92 * DAY).toISOString())
    expect(seen).toHaveAttribute('title', 'Sep 2, 2026, 12:00 PM UTC')
    expect(seen).toHaveClass('whitespace-nowrap')
    expect(screen.getByTestId('admin-users-last-seen-u-never')).toHaveTextContent(/^Never$/)
    const unknown = screen.getByTestId('admin-users-last-seen-u-unknown')
    expect(unknown).toHaveTextContent(/^–$/)
    expect(unknown).toHaveClass('text-muted-foreground')
  })

  it('gives a read-only role no actions and no links but the member pages, Last seen included', () => {
    renderTable({
      readOnly: true,
      rows: [member('u-sam', 'Sam Rivera', { lastSeenAt: new Date(NOW - 3 * DAY), lastSeenReadAt: new Date(NOW - DAY), totalLlmUsage: makeLlmUsageStats({ cost: 0.031 }) })],
    })

    const sam = screen.getByTestId('admin-users-row-u-sam')
    expect(within(sam).queryByRole('button', { name: 'Actions for Sam Rivera' })).not.toBeInTheDocument()
    expect(within(sam).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/admin/users/u-sam'])
    expect(sam).toHaveTextContent('$0.031')
    expect(screen.getByTestId('admin-users-last-seen-u-sam')).toHaveTextContent('3 days ago')
  })

  it('reads a stuck Rewind run from the server now', () => {
    renderTable({ rows: [member('u-run', 'Rae Run', { wrappedStatus: 'generating', wrappedRunStartedAt: new Date(NOW) })], now: NOW + 16 * 60_000 })
    expect(screen.getByTestId('admin-users-row-u-run')).toHaveTextContent('Stuck')
  })

  it('sorts by last seen from its header, and offers it on cards', async () => {
    renderTable()
    const user = userEvent.setup()
    await user.click(screen.getByTestId('admin-users-sort-lastSeen'))
    expect(currentHref()).toBe('/admin/users?sort=lastSeen')

    await user.click(screen.getByTestId('admin-users-filters-sort'))
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual([
      'Joined, newest',
      'Joined, oldest',
      'Last seen, newest',
      'Last seen, oldest',
      'Name',
      'LLM cost, highest',
    ])
  })

  it('keeps Role the first filter, its options in order, with Last seen after Plex access', async () => {
    renderTable()
    expect(screen.getAllByTestId(/^admin-users-filters-filter-\w+$/).map((select) => select.dataset.testid)).toEqual([
      'admin-users-filters-filter-role',
      'admin-users-filters-filter-service',
      'admin-users-filters-filter-plexAccess',
      'admin-users-filters-filter-seen',
      'admin-users-filters-filter-subscription',
    ])
    await userEvent.setup().click(screen.getByTestId('admin-users-filters-filter-role'))
    expect((await screen.findAllByRole('option')).map((option) => option.dataset.testid)).toEqual([
      'admin-users-filters-filter-role-option-all',
      'admin-users-filters-filter-role-option-admin',
      'admin-users-filters-filter-role-option-member',
    ])
  })

  it('writes the last seen filter into the URL, shows its chip, and the chip removes it', async () => {
    renderTable()
    const user = userEvent.setup()
    await user.click(screen.getByTestId('admin-users-filters-filter-seen'))
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual([
      'All',
      'Seen in the last 30 days',
      'Not seen in 90 days',
      'Not seen in 180 days',
      'Never seen',
      'Unknown',
    ])
    await user.click(screen.getByTestId('admin-users-filters-filter-seen-option-inactive180'))

    expect(currentHref()).toBe('/admin/users?seen=inactive180')
    expect(await screen.findByTestId('admin-users-filters-chip-seen')).toHaveTextContent('Last seen: Not seen in 180 days')

    await user.click(screen.getByTestId('admin-users-filters-chip-seen-remove'))
    expect(currentHref()).toBe('/admin/users')
  })

  it('clears the last seen filter with the others from the filtered EmptyState', async () => {
    resetUrl('/admin/users?seen=never&plexAccess=shared&page=2')
    renderTable({ rows: [], total: 0 })

    await userEvent.setup().click(screen.getByTestId('admin-users-clear-filters'))
    expect(currentHref()).toBe('/admin/users')
  })

  it('writes a filter change into the URL and shows its chip', async () => {
    renderTable()
    const user = userEvent.setup()
    await user.click(screen.getByTestId('admin-users-filters-filter-plexAccess'))
    await user.click(await screen.findByTestId('admin-users-filters-filter-plexAccess-option-unknown'))

    expect(currentHref()).toBe('/admin/users?plexAccess=unknown')
    expect(await screen.findByTestId('admin-users-filters-chip-plexAccess')).toHaveTextContent('Plex access: Unknown')
  })
})
