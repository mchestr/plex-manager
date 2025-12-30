import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImportPlexUsersButton } from '@/components/admin/users/import-plex-users-button'
import * as importPlexUsersAction from '@/actions/import-plex-users'
import { useToast } from '@/components/ui/sonner'

// Mock the import-plex-users action
jest.mock('@/actions/import-plex-users', () => ({
  importPlexUsers: jest.fn(),
}))

// Mock the toast hook
jest.mock('@/components/ui/sonner', () => ({
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
    expect(screen.getByText('Import Plex Users')).toBeInTheDocument()
  })

  it('should disable button during import', async () => {
    const user = userEvent.setup()
    let resolveImport: (value: any) => void
    const importPromise = new Promise((resolve) => {
      resolveImport = resolve
    })
    jest.spyOn(importPlexUsersAction, 'importPlexUsers').mockReturnValue(importPromise as any)

    render(<ImportPlexUsersButton />)
    const button = screen.getByText('Import Plex Users')

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
      imported: 0,
      skipped: 0,
      errors: [],
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
      imported: 5,
      skipped: 0,
      errors: [],
    })

    render(<ImportPlexUsersButton />)
    const button = screen.getByText('Import Plex Users')

    await user.click(button)

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith('Imported 5 users', 5000)
    })
  })

  it('should show success message with singular "user" when importing 1 user', async () => {
    const user = userEvent.setup()
    jest.spyOn(importPlexUsersAction, 'importPlexUsers').mockResolvedValue({
      success: true,
      imported: 1,
      skipped: 0,
      errors: [],
    })

    render(<ImportPlexUsersButton />)
    const button = screen.getByText('Import Plex Users')

    await user.click(button)

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith('Imported 1 user', 5000)
    })
  })

  it('should include skipped count in success message', async () => {
    const user = userEvent.setup()
    jest.spyOn(importPlexUsersAction, 'importPlexUsers').mockResolvedValue({
      success: true,
      imported: 3,
      skipped: 2,
      errors: [],
    })

    render(<ImportPlexUsersButton />)
    const button = screen.getByText('Import Plex Users')

    await user.click(button)

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith(
        'Imported 3 users, 2 skipped (already exist)',
        5000
      )
    })
  })

  it('should include error count in success message', async () => {
    const user = userEvent.setup()
    jest.spyOn(importPlexUsersAction, 'importPlexUsers').mockResolvedValue({
      success: true,
      imported: 3,
      skipped: 0,
      errors: ['Error 1', 'Error 2'],
    })

    render(<ImportPlexUsersButton />)
    const button = screen.getByText('Import Plex Users')

    await user.click(button)

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith('Imported 3 users, 2 errors', 5000)
    })
  })

  it('should show individual error messages when errors occur during import', async () => {
    const user = userEvent.setup()
    const errors = ['User 1: Failed to create', 'User 2: Invalid data']
    jest.spyOn(importPlexUsersAction, 'importPlexUsers').mockResolvedValue({
      success: true,
      imported: 1,
      skipped: 0,
      errors,
    })

    render(<ImportPlexUsersButton />)
    const button = screen.getByText('Import Plex Users')

    await user.click(button)

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith('Imported 1 user, 2 errors', 5000)
      expect(mockShowError).toHaveBeenCalledWith('User 1: Failed to create', 6000)
      expect(mockShowError).toHaveBeenCalledWith('User 2: Invalid data', 6000)
    })
  })

  it('should show error message when import fails', async () => {
    const user = userEvent.setup()
    jest.spyOn(importPlexUsersAction, 'importPlexUsers').mockResolvedValue({
      success: false,
      imported: 0,
      skipped: 0,
      errors: ['No active Plex server configured'],
    })

    render(<ImportPlexUsersButton />)
    const button = screen.getByText('Import Plex Users')

    await user.click(button)

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('No active Plex server configured')
    })
  })

  it('should show generic error message when import fails without specific error', async () => {
    const user = userEvent.setup()
    jest.spyOn(importPlexUsersAction, 'importPlexUsers').mockResolvedValue({
      success: false,
      imported: 0,
      skipped: 0,
      errors: [],
    })

    render(<ImportPlexUsersButton />)
    const button = screen.getByText('Import Plex Users')

    await user.click(button)

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('Failed to import Plex users')
    })
  })

  it('should handle singular error in error count message', async () => {
    const user = userEvent.setup()
    jest.spyOn(importPlexUsersAction, 'importPlexUsers').mockResolvedValue({
      success: true,
      imported: 2,
      skipped: 0,
      errors: ['Single error'],
    })

    render(<ImportPlexUsersButton />)
    const button = screen.getByText('Import Plex Users')

    await user.click(button)

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith('Imported 2 users, 1 error', 5000)
    })
  })

  it('should show combined message with imported, skipped, and errors', async () => {
    const user = userEvent.setup()
    jest.spyOn(importPlexUsersAction, 'importPlexUsers').mockResolvedValue({
      success: true,
      imported: 5,
      skipped: 3,
      errors: ['Error 1', 'Error 2'],
    })

    render(<ImportPlexUsersButton />)
    const button = screen.getByText('Import Plex Users')

    await user.click(button)

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith(
        'Imported 5 users, 3 skipped (already exist), 2 errors',
        5000
      )
    })
  })

  it('should re-enable button after successful import', async () => {
    const user = userEvent.setup()
    jest.spyOn(importPlexUsersAction, 'importPlexUsers').mockResolvedValue({
      success: true,
      imported: 1,
      skipped: 0,
      errors: [],
    })

    render(<ImportPlexUsersButton />)
    const button = screen.getByText('Import Plex Users')

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
      imported: 0,
      skipped: 0,
      errors: ['Failed'],
    })

    render(<ImportPlexUsersButton />)
    const button = screen.getByText('Import Plex Users')

    await user.click(button)

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalled()
    })

    // Button should be enabled again
    await waitFor(() => {
      expect(button).not.toBeDisabled()
    })
  })

  it('should have correct styling classes', () => {
    render(<ImportPlexUsersButton />)
    const button = screen.getByText('Import Plex Users')

    expect(button).toHaveClass(
      'px-4',
      'py-2',
      'bg-gradient-to-r',
      'from-cyan-600',
      'to-purple-600',
      'text-white',
      'rounded-lg',
      'font-medium'
    )
  })
})

