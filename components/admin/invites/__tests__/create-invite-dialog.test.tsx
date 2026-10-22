import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { resetUrl } from '@/__tests__/helpers/url-router'
import { createInvite } from '@/actions/admin/invites'
import { CreateInviteDialog } from '@/components/admin/invites/create-invite-dialog'
import type { LibraryListing } from '@/types/invite'

jest.mock('next/navigation', () => require('@/__tests__/helpers/url-router').navigationModule)
jest.mock('@/actions/admin/invites', () => ({ createInvite: jest.fn(), deleteInvite: jest.fn() }))
const mockShowSuccess = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: jest.fn() }) }))

const PLEX: LibraryListing = { ok: true, libraries: [{ id: '1', name: 'Movies', type: 'movie' }] }
const JELLYFIN: LibraryListing = { ok: true, libraries: [{ id: 'abc', name: 'Anime', type: 'tvshows' }] }

async function openDialog(jellyfin: LibraryListing = JELLYFIN) {
  render(
    <CreateInviteDialog
      plexLibraries={Promise.resolve(PLEX)}
      jellyfinLibraries={Promise.resolve(jellyfin)}
      data-testid="generate-invite-button"
    />
  )
  const user = userEvent.setup()
  await user.click(screen.getByTestId('generate-invite-button'))
  const dialog = await screen.findByTestId('admin-invites-create-dialog')
  await within(dialog).findByTestId('create-invite-form')
  return { user, dialog }
}

beforeEach(() => {
  resetUrl('/admin/invites')
  jest.clearAllMocks()
})

describe('CreateInviteDialog', () => {
  it('wires each label to its control', async () => {
    const { dialog } = await openDialog()

    expect(dialog).toHaveAccessibleName('Create invite')
    expect(within(dialog).getByLabelText(/^Code/)).toBe(within(dialog).getByTestId('invite-code-input'))
    expect(within(dialog).getByLabelText(/^Uses/)).toBe(within(dialog).getByTestId('invite-max-uses-input'))
    expect(within(dialog).getByRole('radiogroup', { name: 'Server' })).toBeInTheDocument()
    expect(within(dialog).getByRole('switch', { name: 'Allow downloads' })).toBeInTheDocument()
  })

  it('swaps the library picker and hides Allow downloads for Jellyfin', async () => {
    const { user, dialog } = await openDialog()

    await user.click(within(dialog).getByRole('checkbox', { name: 'All libraries' }))
    expect(within(dialog).getByRole('checkbox', { name: /Movies/ })).toBeInTheDocument()

    await user.click(within(dialog).getByTestId('invite-server-type-jellyfin'))
    expect(within(dialog).queryByRole('switch', { name: 'Allow downloads' })).not.toBeInTheDocument()
    // The picker starts over on All libraries for the new server
    await user.click(within(dialog).getByRole('checkbox', { name: 'All libraries' }))
    expect(within(dialog).getByRole('checkbox', { name: /Anime/ })).toBeInTheDocument()
    expect(within(dialog).queryByRole('checkbox', { name: /Movies/ })).not.toBeInTheDocument()
  })

  it('disables Jellyfin and says why when its libraries could not be read', async () => {
    const { dialog } = await openDialog({ ok: false, reason: 'No Jellyfin server is set up.' })

    expect(within(dialog).getByTestId('invite-server-type-jellyfin')).toHaveAttribute('aria-disabled', 'true')
    expect(within(dialog).getByTestId('invite-jellyfin-unavailable')).toHaveTextContent('No Jellyfin server is set up.')
  })

  it('shows the pending label, then an error inside the dialog', async () => {
    let settle: (value: Awaited<ReturnType<typeof createInvite>>) => void = () => {}
    jest.mocked(createInvite).mockReturnValue(new Promise((resolve) => (settle = resolve)))
    const { user, dialog } = await openDialog()

    await user.type(within(dialog).getByTestId('invite-code-input'), 'audit2026')
    await user.click(within(dialog).getByTestId('create-invite-submit'))
    expect(within(dialog).getByTestId('create-invite-submit')).toHaveTextContent('Creating')
    expect(createInvite).toHaveBeenCalledWith({
      code: 'AUDIT2026',
      serverType: 'PLEX',
      maxUses: 1,
      expiresIn: '48h',
      librarySectionIds: undefined,
      allowDownloads: false,
    })

    settle({ success: false, code: 'CONFLICT', error: 'That code is already in use', fieldErrors: { code: ['That code is already in use'] } })
    expect(await within(dialog).findByText('That code is already in use')).toBeInTheDocument()
    expect(within(dialog).getByTestId('invite-code-input')).toHaveValue('AUDIT2026')
    expect(within(dialog).getByTestId('invite-code-input')).toHaveAttribute('aria-invalid', 'true')
  })

  it('sends the chosen Plex libraries as numbers', async () => {
    jest.mocked(createInvite).mockResolvedValue({ success: true, data: { id: 'i1', code: 'NEWCODE1' } })
    const { user, dialog } = await openDialog()

    await user.click(within(dialog).getByRole('checkbox', { name: 'All libraries' }))
    await user.click(within(dialog).getByRole('checkbox', { name: /Movies/ }))
    await user.click(within(dialog).getByRole('switch', { name: 'Allow downloads' }))
    await user.click(within(dialog).getByTestId('create-invite-submit'))

    expect(createInvite).toHaveBeenCalledWith(expect.objectContaining({ librarySectionIds: [1], allowDownloads: true }))
  })

  it('asks for a library when All libraries is cleared and none is picked', async () => {
    const { user, dialog } = await openDialog()

    await user.click(within(dialog).getByRole('checkbox', { name: 'All libraries' }))
    await user.click(within(dialog).getByTestId('create-invite-submit'))

    expect(await within(dialog).findByTestId('invite-library-picker-error')).toHaveTextContent('Pick at least one library')
    expect(createInvite).not.toHaveBeenCalled()
  })

  it('shows the new code with Copy link on success', async () => {
    jest.mocked(createInvite).mockResolvedValue({ success: true, data: { id: 'i1', code: 'NEWCODE1' } })
    const { user, dialog } = await openDialog()

    await user.click(within(dialog).getByTestId('create-invite-submit'))

    expect(await within(dialog).findByTestId('create-invite-success-code')).toHaveTextContent('NEWCODE1')
    expect(within(dialog).getByRole('link', { name: 'View invite' })).toHaveAttribute('href', '/admin/invites/i1')
    const writeText = jest.spyOn(navigator.clipboard, 'writeText')
    await user.click(within(dialog).getByTestId('create-invite-copy-link'))
    expect(writeText).toHaveBeenCalledWith('http://localhost/invite/NEWCODE1')
    expect(mockShowSuccess).toHaveBeenCalledWith('Copied the link for NEWCODE1')
  })
})
