import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { currentHref, resetUrl } from '@/__tests__/helpers/url-router'
import { deleteInvite } from '@/actions/admin/invites'
import { InvitesTable } from '@/components/admin/invites/invites-table'
import type { AdminInviteRow } from '@/lib/admin/invites/queries'

jest.mock('next/navigation', () => require('@/__tests__/helpers/url-router').navigationModule)
jest.mock('@/actions/admin/invites', () => ({ deleteInvite: jest.fn(), createInvite: jest.fn() }))
const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const row = (id: string, code: string, overrides: Partial<AdminInviteRow> = {}): AdminInviteRow => ({
  id,
  code,
  serverType: 'PLEX',
  useCount: 3,
  maxUses: 5,
  expiresAt: new Date('2027-02-01T12:00:00Z'),
  createdAt: new Date('2026-10-11T15:00:00Z'),
  status: 'active',
  ...overrides,
})

const ROWS = [
  row('i-audit', 'AUDIT2026'),
  row('i-old', 'OLDCODE', { serverType: 'JELLYFIN', status: 'expired', expiresAt: new Date('2026-01-01T12:00:00Z'), useCount: 0, maxUses: 1 }),
]

function renderTable(props: Partial<Parameters<typeof InvitesTable>[0]> = {}) {
  return render(
    <InvitesTable
      rows={ROWS}
      total={ROWS.length}
      all={ROWS.length}
      page={1}
      pageSize={25}
      sort={{ id: 'created', desc: true }}
      createAction={<button type="button">Create invite</button>}
      {...props}
    />
  )
}

beforeEach(() => {
  resetUrl('/admin/invites')
  jest.clearAllMocks()
})

describe('InvitesTable', () => {
  it('links the code to the detail page and shows uses, server and status', () => {
    renderTable()

    const audit = screen.getByTestId('admin-invites-row-i-audit')
    expect(within(audit).getByRole('link', { name: 'AUDIT2026' })).toHaveAttribute('href', '/admin/invites/i-audit')
    expect(audit).toHaveTextContent('3 of 5')
    expect(audit).toHaveTextContent('Plex')
    expect(audit).toHaveTextContent('Active')

    const old = screen.getByTestId('admin-invites-row-i-old')
    expect(old).toHaveTextContent('Jellyfin')
    expect(old).toHaveTextContent('Expired')
  })

  it('names the actions menu for the code and deletes through a confirm', async () => {
    jest.mocked(deleteInvite).mockResolvedValue({ success: true, data: null })
    renderTable()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Actions for invite AUDIT2026' }))
    const items = (await screen.findAllByRole('menuitem')).map((item) => item.textContent)
    expect(items).toEqual(['Copy link', 'Delete...'])

    await user.click(screen.getByTestId('admin-invites-actions-i-audit-delete'))
    const dialog = await screen.findByTestId('admin-invites-delete-dialog')
    expect(dialog).toHaveTextContent('Delete invite AUDIT2026?')
    await user.click(screen.getByTestId('admin-invite-delete'))

    expect(deleteInvite).toHaveBeenCalledWith({ id: 'i-audit' })
    expect(mockShowSuccess).toHaveBeenCalledWith('Deleted invite AUDIT2026')
    await waitFor(() => expect(screen.queryByTestId('admin-invites-delete-dialog')).not.toBeInTheDocument())
  })

  it('keeps a failed delete inside the dialog', async () => {
    jest.mocked(deleteInvite).mockResolvedValue({ success: false, code: 'NOT_FOUND', error: 'That item no longer exists.' })
    renderTable()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Actions for invite AUDIT2026' }))
    await user.click(await screen.findByTestId('admin-invites-actions-i-audit-delete'))
    await user.click(await screen.findByTestId('admin-invite-delete'))

    const dialog = screen.getByTestId('admin-invites-delete-dialog')
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('That item no longer exists.')
  })

  it('shows the first-use empty state with Create invite when there are no invites', () => {
    renderTable({ rows: [], total: 0, all: 0 })

    const empty = screen.getByTestId('admin-invites-empty')
    expect(empty).toHaveTextContent('No invites yet')
    expect(within(empty).getByRole('button', { name: 'Create invite' })).toBeInTheDocument()
  })

  it('shows the filtered empty state, and Clear filters drops every filter', async () => {
    resetUrl('/admin/invites?status=expired&server=plex&q=ZZZ&page=2')
    renderTable({ rows: [], total: 0, all: 4 })

    const empty = screen.getByTestId('admin-invites-empty-filtered')
    expect(empty).toHaveTextContent('No invites match these filters')
    await userEvent.setup().click(within(empty).getByRole('button', { name: 'Clear filters' }))
    expect(currentHref()).toBe('/admin/invites')
  })
})
