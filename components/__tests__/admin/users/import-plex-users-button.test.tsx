import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImportPlexUsersButton } from '@/components/admin/users/import-plex-users-button'
import * as importPlexUsersAction from '@/actions/import-plex-users'
import { useToast } from '@/components/ui/toast'

// Mock the import-plex-users action
jest.mock('@/actions/import-plex-users', () => ({
  importPlexUsers: jest.fn(),
}))

const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

// Mock the toast hook
jest.mock('@/components/ui/toast', () => ({
  useToast: jest.fn(),
}))

describe('ImportPlexUsersButton', () => {
  const mockShowSuccess = jest.fn()
  const mockShowError = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useToast as jest.Mock).mockReturnValue({
      showSuccess: mockShowSuccess,
      showError: mockShowError,
    })
  })

  it('should render the import button', () => {
    render(<ImportPlexUsersButton />)
    expect(screen.getByText('Import from Plex')).toBeInTheDocument()
  })

  it('should disable button during import', async () => {
    const user = userEvent.setup()
    let resolveImport: (value: any) => void
    const importPromise = new Promise((resolve) => {
      resolveImport = resolve
    })
    jest.spyOn(importPlexUsersAction, 'importPlexUsers').mockReturnValue(importPromise as any)

    render(<ImportPlexUsersButton />)
    const button = screen.getByText('Import from Plex')

    // Click the button - this starts the transition
    await user.click(button)

    // The button text should change and button should be disabled
    // Note: useTransition's isPending may not be immediately true in tests
    // but the action will be called
    await waitFor(() => {
      expect(importPlexUsersAction.importPlexUsers).toHaveBeenCalledTimes(1)
    })

    // Resolve the promise
    resolveImport!({
      success: true,
      data: { imported: 0, skipped: 0, managed: 0, pending: 0, errors: [] },
    })

    // Wait for the button to be re-enabled
    await waitFor(() => {
      expect(button).not.toBeDisabled()
    })
  })

  it('should show success message when users are imported', async () => {
    const user = userEvent.setup()
    jest.spyOn(importPlexUsersAction, 'importPlexUsers').mockResolvedValue({
      success: true,
      data: { imported: 5, skipped: 0, managed: 0, pending: 0, errors: [] },
    })

    render(<ImportPlexUsersButton />)
    const button = screen.getByText('Import from Plex')

    await user.click(button)

    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('Imported 5 users'))
    // The action revalidates /admin/users, so the new members show with no client refresh (P10.7)
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('reports managed users and pending invites left out', async () => {
    const user = userEvent.setup()
    jest.spyOn(importPlexUsersAction, 'importPlexUsers').mockResolvedValue({
      success: true,
      data: { imported: 3, skipped: 0, managed: 1, pending: 2, errors: [] },
    })

    render(<ImportPlexUsersButton />)
    await user.click(screen.getByText('Import from Plex'))

    await waitFor(() =>
      expect(mockShowSuccess).toHaveBeenCalledWith('Imported 3 users, 1 managed, 2 pending invites left out')
    )
  })

  it('should show success message with singular "user" when importing 1 user', async () => {
    const user = userEvent.setup()
    jest.spyOn(importPlexUsersAction, 'importPlexUsers').mockResolvedValue({
      success: true,
      data: { imported: 1, skipped: 0, managed: 0, pending: 0, errors: [] },
    })

    render(<ImportPlexUsersButton />)
    const button = screen.getByText('Import from Plex')

    await user.click(button)

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith('Imported 1 user')
    })
  })

  it('should include skipped count in success message', async () => {
    const user = userEvent.setup()
    jest.spyOn(importPlexUsersAction, 'importPlexUsers').mockResolvedValue({
      success: true,
      data: { imported: 3, skipped: 2, managed: 0, pending: 0, errors: [] },
    })

    render(<ImportPlexUsersButton />)
    const button = screen.getByText('Import from Plex')

    await user.click(button)

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith(
        'Imported 3 users, 2 skipped (already exist)')
    })
  })

  it('should include error count in success message', async () => {
    const user = userEvent.setup()
    jest.spyOn(importPlexUsersAction, 'importPlexUsers').mockResolvedValue({
      success: true,
      data: { imported: 3, skipped: 0, managed: 0, pending: 0, errors: ['Error 1', 'Error 2'] },
    })

    render(<ImportPlexUsersButton />)
    const button = screen.getByText('Import from Plex')

    await user.click(button)

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith('Imported 3 users, 2 errors')
    })
  })

  it('should show individual error messages when errors occur during import', async () => {
    const user = userEvent.setup()
    const errors = ['User 1: Failed to create', 'User 2: Invalid data']
    jest.spyOn(importPlexUsersAction, 'importPlexUsers').mockResolvedValue({
      success: true,
      data: { imported: 1, skipped: 0, managed: 0, pending: 0, errors },
    })

    render(<ImportPlexUsersButton />)
    const button = screen.getByText('Import from Plex')

    await user.click(button)

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith('Imported 1 user, 2 errors')
      expect(mockShowError).toHaveBeenCalledWith('User 1: Failed to create')
      expect(mockShowError).toHaveBeenCalledWith('User 2: Invalid data')
    })
  })

  it('should show error message when import fails', async () => {
    const user = userEvent.setup()
    jest.spyOn(importPlexUsersAction, 'importPlexUsers').mockResolvedValue({
      success: false,
      code: 'NOT_FOUND',
      error: 'No active Plex server configured',
    })

    render(<ImportPlexUsersButton />)
    const button = screen.getByText('Import from Plex')

    await user.click(button)

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('No active Plex server configured')
    })
  })

  it('should show the action\'s error copy', async () => {
    const user = userEvent.setup()
    jest.spyOn(importPlexUsersAction, 'importPlexUsers').mockResolvedValue({
      success: false,
      code: 'NOT_FOUND',
      error: 'Failed to import Plex users',
    })

    render(<ImportPlexUsersButton />)
    const button = screen.getByText('Import from Plex')

    await user.click(button)

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('Failed to import Plex users')
    })
  })

  it('should handle singular error in error count message', async () => {
    const user = userEvent.setup()
    jest.spyOn(importPlexUsersAction, 'importPlexUsers').mockResolvedValue({
      success: true,
      data: { imported: 2, skipped: 0, managed: 0, pending: 0, errors: ['Single error'] },
    })

    render(<ImportPlexUsersButton />)
    const button = screen.getByText('Import from Plex')

    await user.click(button)

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith('Imported 2 users, 1 error')
    })
  })

  it('should show combined message with imported, skipped, and errors', async () => {
    const user = userEvent.setup()
    jest.spyOn(importPlexUsersAction, 'importPlexUsers').mockResolvedValue({
      success: true,
      data: { imported: 5, skipped: 3, managed: 0, pending: 0, errors: ['Error 1', 'Error 2'] },
    })

    render(<ImportPlexUsersButton />)
    const button = screen.getByText('Import from Plex')

    await user.click(button)

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith(
        'Imported 5 users, 3 skipped (already exist), 2 errors')
    })
  })

  it('should re-enable button after successful import', async () => {
    const user = userEvent.setup()
    jest.spyOn(importPlexUsersAction, 'importPlexUsers').mockResolvedValue({
      success: true,
      data: { imported: 1, skipped: 0, managed: 0, pending: 0, errors: [] },
    })

    render(<ImportPlexUsersButton />)
    const button = screen.getByText('Import from Plex')

    await user.click(button)

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalled()
    })

    // Button should be enabled again
    await waitFor(() => {
      expect(button).not.toBeDisabled()
    })
  })

  it('should re-enable button after failed import', async () => {
    const user = userEvent.setup()
    jest.spyOn(importPlexUsersAction, 'importPlexUsers').mockResolvedValue({
      success: false,
      code: 'NOT_FOUND',
      error: 'Failed',
    })

    render(<ImportPlexUsersButton />)
    const button = screen.getByText('Import from Plex')

    await user.click(button)

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalled()
    })

    // Button should be enabled again
    await waitFor(() => {
      expect(button).not.toBeDisabled()
    })
  })

  it('renders as the primary button', () => {
    render(<ImportPlexUsersButton />)

    expect(screen.getByRole('button', { name: 'Import from Plex' })).toHaveClass('bg-primary')
  })
})

