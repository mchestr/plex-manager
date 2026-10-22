/**
 * The announcements admin (P10.5): rendered previews in the table, the form
 * dialog's inline errors and live preview, and the optimistic home switch.
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { createAnnouncement, setAnnouncementActive } from '@/actions/announcements'
import { AnnouncementDialog } from '@/components/admin/announcements/announcement-dialog'
import { AnnouncementsTable } from '@/components/admin/announcements/announcements-table'
import { VisibilitySwitch } from '@/components/admin/announcements/visibility-switch'
import { AnnouncementItem } from '@/components/announcements/announcement-item'
import type { AdminAnnouncementRow } from '@/lib/admin/announcements'

const showSuccess = jest.fn()
const showError = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/admin/announcements',
  useSearchParams: () => new URLSearchParams(),
}))
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess, showError }) }))
jest.mock('@/actions/announcements', () => ({
  createAnnouncement: jest.fn(),
  updateAnnouncement: jest.fn(),
  deleteAnnouncement: jest.fn(),
  setAnnouncementActive: jest.fn(),
}))

const mockCreate = jest.mocked(createAnnouncement)
const mockSetActive = jest.mocked(setAnnouncementActive)

const HOSTILE = 'Tonight:\n\n- Plex restarts\n- Disks swap\n\n![x](https://attacker.invalid/?d=1)\n\n[click me](javascript:alert(1))'

const row = (overrides: Partial<AdminAnnouncementRow> = {}): AdminAnnouncementRow => ({
  id: 'a1',
  title: 'Storage upgrade',
  content: HOSTILE,
  priority: 0,
  isActive: true,
  status: 'active',
  createdAt: '2026-10-17T12:00:00.000Z',
  expiresAt: null,
  ...overrides,
})

beforeEach(() => jest.clearAllMocks())

describe('AnnouncementsTable', () => {
  const renderTable = (rows: AdminAnnouncementRow[]) =>
    render(<AnnouncementsTable rows={rows} onEdit={jest.fn()} onDelete={jest.fn()} createAction={<button>New</button>} />)

  it('renders each preview as Markdown with bullets, never the raw text', () => {
    renderTable([row()])

    const tableRow = screen.getByTestId('admin-announcements-row-a1')
    expect(within(tableRow).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Plex restarts', 'Disks swap'])
    expect(tableRow).not.toHaveTextContent('- Plex restarts')
  })

  it('renders an injected image and a javascript: link with no <img> and no href', () => {
    renderTable([row()])

    const tableRow = screen.getByTestId('admin-announcements-row-a1')
    expect(tableRow.querySelector('img')).toBeNull()
    expect(tableRow.querySelector('[href^="javascript"]')).toBeNull()
    expect(within(tableRow).getByText('click me').closest('a')).toBeNull()
  })

  it('shows the status and priority as badges', () => {
    renderTable([row({ id: 'a2', status: 'expired', priority: 5 }), row({ id: 'a3', status: 'hidden', isActive: false })])

    expect(within(screen.getByTestId('admin-announcements-row-a2')).getByText('Expired')).toBeInTheDocument()
    expect(within(screen.getByTestId('admin-announcements-row-a2')).getByText('Priority 5')).toBeInTheDocument()
    expect(within(screen.getByTestId('admin-announcements-row-a3')).getByText('Hidden')).toBeInTheDocument()
  })

  it('shows the first-use empty state', () => {
    renderTable([])
    expect(screen.getByTestId('announcements-empty-state')).toHaveTextContent('No announcements yet')
  })
})

describe('AnnouncementDialog', () => {
  const renderDialog = (announcement: AdminAnnouncementRow | null = null) => {
    const onOpenChange = jest.fn()
    render(<AnnouncementDialog open onOpenChange={onOpenChange} announcement={announcement} zone="America/Chicago" />)
    return { onOpenChange }
  }

  it('keeps a failed save inside the dialog, next to its field', async () => {
    const user = userEvent.setup()
    mockCreate.mockResolvedValue({
      success: false,
      code: 'VALIDATION',
      error: 'Keep the title to 200 characters',
      fieldErrors: { title: ['Keep the title to 200 characters'] },
    })
    const { onOpenChange } = renderDialog()

    await user.type(screen.getByTestId('announcement-title-input'), 'Long')
    await user.type(screen.getByTestId('announcement-content-input'), 'Body')
    await user.click(screen.getByTestId('announcement-submit-button'))

    const dialog = await screen.findByTestId('announcement-dialog')
    expect(await within(dialog).findByText('Keep the title to 200 characters')).toBeInTheDocument()
    expect(screen.getByTestId('announcement-title-input')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByTestId('announcement-title-input')).toHaveValue('Long')
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('shows a non-field failure as an alert inside the dialog', async () => {
    const user = userEvent.setup()
    mockCreate.mockResolvedValue({ success: false, code: 'INTERNAL', error: "Couldn't create the announcement" })
    renderDialog()

    await user.type(screen.getByTestId('announcement-title-input'), 'T')
    await user.type(screen.getByTestId('announcement-content-input'), 'C')
    await user.click(screen.getByTestId('announcement-submit-button'))

    expect(await screen.findByTestId('announcement-form-error')).toHaveTextContent("Couldn't create the announcement")
  })

  it('keeps the typed priority and expiry after a failed save (P10.7)', async () => {
    const user = userEvent.setup()
    mockCreate.mockResolvedValue({ success: false, code: 'INTERNAL', error: "Couldn't create the announcement" })
    renderDialog()

    await user.type(screen.getByTestId('announcement-title-input'), 'T')
    await user.type(screen.getByTestId('announcement-content-input'), 'C')
    await user.clear(screen.getByTestId('announcement-priority-input'))
    await user.type(screen.getByTestId('announcement-priority-input'), '7')
    await user.type(screen.getByTestId('announcement-expires-input'), '2027-02-01T09:30')
    await user.click(screen.getByTestId('announcement-submit-button'))

    expect(await screen.findByTestId('announcement-form-error')).toBeInTheDocument()
    expect(screen.getByTestId('announcement-priority-input')).toHaveValue(7)
    expect(screen.getByTestId('announcement-expires-input')).toHaveValue('2027-02-01T09:30')
  })

  it('sends the form and closes with a toast on success', async () => {
    const user = userEvent.setup()
    mockCreate.mockResolvedValue({ success: true, data: { id: 'new' } })
    const { onOpenChange } = renderDialog()

    await user.type(screen.getByTestId('announcement-title-input'), 'Storage upgrade')
    await user.type(screen.getByTestId('announcement-content-input'), 'Disks swap')
    await user.clear(screen.getByTestId('announcement-priority-input'))
    await user.type(screen.getByTestId('announcement-priority-input'), '5')
    await user.click(screen.getByTestId('announcement-active-checkbox'))
    await user.click(screen.getByTestId('announcement-submit-button'))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(mockCreate).toHaveBeenCalledWith({
      title: 'Storage upgrade',
      content: 'Disks swap',
      priority: 5,
      isActive: false,
      expiresAt: '',
    })
    expect(showSuccess).toHaveBeenCalledWith('Announcement created')
  })

  it('previews the content with the same markup as the member item, New pip included', async () => {
    const user = userEvent.setup()
    renderDialog(row({ content: 'Short' }))

    await user.clear(screen.getByTestId('announcement-content-input'))
    await user.type(screen.getByTestId('announcement-content-input'), 'Tonight:{enter}{enter}- Plex restarts{enter}- Disks swap')

    const preview = screen.getByTestId('announcement-preview-item')
    expect(within(preview).getAllByRole('listitem')).toHaveLength(2)
    expect(within(preview).getByText('New')).toBeInTheDocument()

    const { container } = render(
      <AnnouncementItem
        announcement={{ id: 'preview', title: 'Storage upgrade', content: 'Tonight:\n\n- Plex restarts\n- Disks swap', createdAt: '2026-10-17T12:00:00.000Z' }}
        isNew
        as="h3"
        data-testid="announcement-preview-item"
      />
    )
    expect(preview.outerHTML).toBe(container.firstElementChild?.outerHTML)
  })

  it('names the zone the expiry is typed in', () => {
    renderDialog()
    expect(screen.getByTestId('announcement-expires-zone')).toHaveTextContent('Times in America/Chicago.')
  })
})

describe('VisibilitySwitch', () => {
  it('moves at once and rolls back when the action fails', async () => {
    const user = userEvent.setup()
    let settle: (value: Awaited<ReturnType<typeof setAnnouncementActive>>) => void = () => {}
    mockSetActive.mockImplementation(() => new Promise((resolve) => (settle = resolve)))
    render(<VisibilitySwitch id="a1" title="Storage upgrade" isActive />)

    const toggle = screen.getByTestId('toggle-announcement-a1')
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    await user.click(toggle)

    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'))
    expect(mockSetActive).toHaveBeenCalledWith({ id: 'a1', isActive: false })

    settle({ success: false, code: 'INTERNAL', error: "Couldn't change whether it shows" })
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))
    expect(showError).toHaveBeenCalledWith("Couldn't change whether it shows")
  })

  it('has a stable name that does not carry the state', () => {
    render(<VisibilitySwitch id="a1" title="Storage upgrade" isActive={false} />)
    expect(screen.getByRole('switch', { name: 'Visible on home page: Storage upgrade' })).toBeInTheDocument()
  })
})
