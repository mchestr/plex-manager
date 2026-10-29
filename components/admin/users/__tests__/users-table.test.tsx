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
    expect(cells.map((cell) => cell.dataset.card)).toEqual(['title', 'field', 'field', 'field', 'field', 'field', 'field', 'field', 'actions'])
    expect(cells[0].querySelector('[data-slot="cell-label"]')).toBeNull()
    expect([...sam.querySelectorAll('[data-slot="cell-label"]')].map((label) => label.textContent)).toEqual([
      'Role',
      'Service',
      'Plex access',
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

  it('writes a filter change into the URL and shows its chip', async () => {
    renderTable()
    const user = userEvent.setup()
    await user.click(screen.getByTestId('admin-users-filters-filter-plexAccess'))
    await user.click(await screen.findByTestId('admin-users-filters-filter-plexAccess-option-unknown'))

    expect(currentHref()).toBe('/admin/users?plexAccess=unknown')
    expect(await screen.findByTestId('admin-users-filters-chip-plexAccess')).toHaveTextContent('Plex access: Unknown')
  })
})
