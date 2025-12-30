import * as usersAction from '@/actions/users'
import { RegenerateWrappedButton } from '@/components/admin/users/regenerate-wrapped-button'
import { ToastProvider } from '@/components/ui/sonner'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'
import React from 'react'

// Mock the users action
jest.mock('@/actions/users', () => ({
  generatePlexWrapped: jest.fn(),
}))

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))

// Mock ConfirmModal
jest.mock('@/components/ui/alert-dialog', () => ({
  ConfirmModal: ({ isOpen, onClose, onConfirm, title, message, confirmText, cancelText }: any) => {
    if (!isOpen) return null
    return (
      <div data-testid="confirm-modal">
        <h2>{title}</h2>
        <p>{message}</p>
        <button onClick={onConfirm}>{confirmText}</button>
        <button onClick={onClose}>{cancelText}</button>
      </div>
    )
  },
}))

const renderWithToast = (component: React.ReactElement) => {
  return render(<ToastProvider>{component}</ToastProvider>)
}

describe('RegenerateWrappedButton', () => {
  const mockRefresh = jest.fn()
  const mockOnSuccess = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    ;(useRouter as jest.Mock).mockReturnValue({
      refresh: mockRefresh,
    })
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  describe('Default (non-inline) mode', () => {
    it('should render the regenerate button', () => {
      renderWithToast(<RegenerateWrappedButton userId="user-1" />)
      const button = screen.getByRole('button', { name: /Regenerate wrapped/i })
      expect(button).toBeInTheDocument()
    })

    it('should show confirm modal when clicked', async () => {
      const user = userEvent.setup({ delay: null })
      renderWithToast(<RegenerateWrappedButton userId="user-1" year={2024} />)
      const button = screen.getByRole('button', { name: /Regenerate wrapped/i })

      await user.click(button)

      expect(screen.getByTestId('confirm-modal')).toBeInTheDocument()
      expect(screen.getByText('Regenerate Wrapped')).toBeInTheDocument()
      expect(
        screen.getByText(
          'Are you sure you want to regenerate the 2024 wrapped for this user? This will overwrite the existing wrapped.'
        )
      ).toBeInTheDocument()
    })

    it('should close modal when cancel is clicked', async () => {
      const user = userEvent.setup({ delay: null })
      renderWithToast(<RegenerateWrappedButton userId="user-1" />)
      const button = screen.getByRole('button', { name: /Regenerate wrapped/i })

      await user.click(button)
      expect(screen.getByTestId('confirm-modal')).toBeInTheDocument()

      const cancelButton = screen.getByText('Cancel')
      await user.click(cancelButton)

      expect(screen.queryByTestId('confirm-modal')).not.toBeInTheDocument()
    })

    it('should regenerate wrapped when confirmed', async () => {
      const user = userEvent.setup({ delay: null })
      jest.spyOn(usersAction, 'generatePlexWrapped').mockResolvedValue({
        success: true,
      })

      renderWithToast(<RegenerateWrappedButton userId="user-1" year={2024} />)
      const button = screen.getByRole('button', { name: /Regenerate wrapped/i })

      await user.click(button)
      const confirmButton = screen.getByText('Regenerate')
      await user.click(confirmButton)

      await waitFor(() => {
        expect(usersAction.generatePlexWrapped).toHaveBeenCalledWith('user-1', 2024)
      })
    })

    it('should show loading state during regeneration', async () => {
      const user = userEvent.setup({ delay: null })
      let resolveGenerate: (value: any) => void
      const generatePromise = new Promise((resolve) => {
        resolveGenerate = resolve
      })
      jest.spyOn(usersAction, 'generatePlexWrapped').mockReturnValue(generatePromise as any)

      renderWithToast(<RegenerateWrappedButton userId="user-1" />)
      const button = screen.getByRole('button', { name: /Regenerate wrapped/i })

      await user.click(button)
      const confirmButton = screen.getByText('Regenerate')
      await user.click(confirmButton)

      await waitFor(() => {
        expect(button).toBeDisabled()
        // Check for loading spinner
        const svg = button.querySelector('svg.animate-spin')
        expect(svg).toBeInTheDocument()
      })

      resolveGenerate!({ success: true })
    })

    it('should show success state after successful regeneration', async () => {
      const user = userEvent.setup({ delay: null })
      jest.spyOn(usersAction, 'generatePlexWrapped').mockResolvedValue({
        success: true,
      })

      renderWithToast(<RegenerateWrappedButton userId="user-1" />)
      const button = screen.getByRole('button', { name: /Regenerate wrapped/i })

      await user.click(button)
      const confirmButton = screen.getByText('Regenerate')
      await user.click(confirmButton)

      await waitFor(() => {
        // In non-inline mode, success shows green button with checkmark icon
        const successButton = screen.getByRole('button', { name: /Regeneration started/i })
        expect(successButton).toHaveClass('bg-green-600')
        const checkmark = successButton.querySelector('svg')
        expect(checkmark).toBeInTheDocument()
      })
    })

    it('should hide success message after 3 seconds', async () => {
      const user = userEvent.setup({ delay: null })
      jest.spyOn(usersAction, 'generatePlexWrapped').mockResolvedValue({
        success: true,
      })

      renderWithToast(<RegenerateWrappedButton userId="user-1" />)
      const button = screen.getByRole('button', { name: /Regenerate wrapped/i })

      await user.click(button)
      const confirmButton = screen.getByText('Regenerate')
      await user.click(confirmButton)

      await waitFor(() => {
        // In non-inline mode, success shows green button with checkmark icon
        const successButton = screen.getByRole('button', { name: /Regeneration started/i })
        expect(successButton).toHaveClass('bg-green-600')
      })

      act(() => {
        jest.advanceTimersByTime(3000)
      })

      await waitFor(() => {
        // After 3 seconds, button should return to purple (non-success state)
        const button = screen.getByRole('button', { name: /Regenerate wrapped/i })
        expect(button).toHaveClass('bg-purple-600')
        expect(button).not.toHaveClass('bg-green-600')
      })
    })

    it('should call onSuccess callback after successful regeneration', async () => {
      const user = userEvent.setup({ delay: null })
      jest.spyOn(usersAction, 'generatePlexWrapped').mockResolvedValue({
        success: true,
      })

      renderWithToast(<RegenerateWrappedButton userId="user-1" onSuccess={mockOnSuccess} />)
      const button = screen.getByRole('button', { name: /Regenerate wrapped/i })

      await user.click(button)
      const confirmButton = screen.getByText('Regenerate')
      await user.click(confirmButton)

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalledTimes(1)
      })
    })

    it('should refresh router after successful regeneration', async () => {
      const user = userEvent.setup({ delay: null })
      jest.spyOn(usersAction, 'generatePlexWrapped').mockResolvedValue({
        success: true,
      })

      renderWithToast(<RegenerateWrappedButton userId="user-1" />)
      const button = screen.getByRole('button', { name: /Regenerate wrapped/i })

      await user.click(button)
      const confirmButton = screen.getByText('Regenerate')
      await user.click(confirmButton)

      await waitFor(() => {
        expect(mockRefresh).toHaveBeenCalledTimes(1)
      })
    })

    it('should show error message when regeneration fails', async () => {
      const user = userEvent.setup({ delay: null })
      jest.spyOn(usersAction, 'generatePlexWrapped').mockResolvedValue({
        success: false,
        error: 'Failed to generate wrapped',
      })

      renderWithToast(<RegenerateWrappedButton userId="user-1" />)
      const button = screen.getByRole('button', { name: /Regenerate wrapped/i })

      await user.click(button)
      const confirmButton = screen.getByText('Regenerate')
      await user.click(confirmButton)

      await waitFor(() => {
        expect(screen.getByText('Failed to generate wrapped')).toBeInTheDocument()
      })
    })

    it('should show generic error message when no specific error provided', async () => {
      const user = userEvent.setup({ delay: null })
      jest.spyOn(usersAction, 'generatePlexWrapped').mockResolvedValue({
        success: false,
      })

      renderWithToast(<RegenerateWrappedButton userId="user-1" />)
      const button = screen.getByRole('button', { name: /Regenerate wrapped/i })

      await user.click(button)
      const confirmButton = screen.getByText('Regenerate')
      await user.click(confirmButton)

      await waitFor(() => {
        expect(screen.getByText('Failed to regenerate wrapped')).toBeInTheDocument()
      })
    })

    it('should handle exception during regeneration', async () => {
      const user = userEvent.setup({ delay: null })
      jest.spyOn(usersAction, 'generatePlexWrapped').mockRejectedValue(
        new Error('Network error')
      )

      renderWithToast(<RegenerateWrappedButton userId="user-1" />)
      const button = screen.getByRole('button', { name: /Regenerate wrapped/i })

      await user.click(button)
      const confirmButton = screen.getByText('Regenerate')
      await user.click(confirmButton)

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument()
      })
    })

    it('should handle non-Error exceptions', async () => {
      const user = userEvent.setup({ delay: null })
      jest.spyOn(usersAction, 'generatePlexWrapped').mockRejectedValue('String error')

      renderWithToast(<RegenerateWrappedButton userId="user-1" />)
      const button = screen.getByRole('button', { name: /Regenerate wrapped/i })

      await user.click(button)
      const confirmButton = screen.getByText('Regenerate')
      await user.click(confirmButton)

      await waitFor(() => {
        expect(screen.getByText('Failed to regenerate wrapped')).toBeInTheDocument()
      })
    })

    it('should use current year by default', async () => {
      const user = userEvent.setup({ delay: null })
      const currentYear = new Date().getFullYear()
      jest.spyOn(usersAction, 'generatePlexWrapped').mockResolvedValue({
        success: true,
      })

      renderWithToast(<RegenerateWrappedButton userId="user-1" />)
      const button = screen.getByRole('button', { name: /Regenerate wrapped/i })

      await user.click(button)

      expect(
        screen.getByText(
          `Are you sure you want to regenerate the ${currentYear} wrapped for this user? This will overwrite the existing wrapped.`
        )
      ).toBeInTheDocument()

      const confirmButton = screen.getByText('Regenerate')
      await user.click(confirmButton)

      await waitFor(() => {
        expect(usersAction.generatePlexWrapped).toHaveBeenCalledWith('user-1', currentYear)
      })
    })
  })

  describe('Inline mode', () => {
    it('should render inline button with correct styling', () => {
      renderWithToast(<RegenerateWrappedButton userId="user-1" inline={true} />)
      const button = screen.getByRole('button', { name: /Regenerate wrapped/i })
      expect(button).toHaveClass('w-full', 'flex', 'items-center', 'gap-2', 'text-sm')
    })

    it('should show "Regenerate Wrapped" text in inline mode', () => {
      renderWithToast(<RegenerateWrappedButton userId="user-1" inline={true} />)
      expect(screen.getByText('Regenerate Wrapped')).toBeInTheDocument()
    })

    it('should show "Regenerating..." text when loading in inline mode', async () => {
      const user = userEvent.setup({ delay: null })
      let resolveGenerate: (value: any) => void
      const generatePromise = new Promise((resolve) => {
        resolveGenerate = resolve
      })
      jest.spyOn(usersAction, 'generatePlexWrapped').mockReturnValue(generatePromise as any)

      renderWithToast(<RegenerateWrappedButton userId="user-1" inline={true} />)
      const button = screen.getByRole('button', { name: /Regenerate wrapped/i })

      await user.click(button)
      const confirmButton = screen.getByText('Regenerate')
      await user.click(confirmButton)

      await waitFor(() => {
        expect(screen.getByText('Regenerating...')).toBeInTheDocument()
      })

      resolveGenerate!({ success: true })
    })

    it('should show "Started!" text after success in inline mode', async () => {
      const user = userEvent.setup({ delay: null })
      jest.spyOn(usersAction, 'generatePlexWrapped').mockResolvedValue({
        success: true,
      })

      renderWithToast(<RegenerateWrappedButton userId="user-1" inline={true} />)
      const button = screen.getByRole('button', { name: /Regenerate wrapped/i })

      await user.click(button)
      const confirmButton = screen.getByText('Regenerate')
      await user.click(confirmButton)

      await waitFor(() => {
        expect(screen.getByText('Started!')).toBeInTheDocument()
      })
    })

    it('should show error message in inline mode', async () => {
      const user = userEvent.setup({ delay: null })
      jest.spyOn(usersAction, 'generatePlexWrapped').mockResolvedValue({
        success: false,
        error: 'Inline error',
      })

      renderWithToast(<RegenerateWrappedButton userId="user-1" inline={true} />)
      const button = screen.getByRole('button', { name: /Regenerate wrapped/i })

      await user.click(button)
      const confirmButton = screen.getByText('Regenerate')
      await user.click(confirmButton)

      await waitFor(() => {
        expect(screen.getByText('Inline error')).toBeInTheDocument()
      })
    })

    it('should show different icons for different states in inline mode', async () => {
      const user = userEvent.setup({ delay: null })
      jest.spyOn(usersAction, 'generatePlexWrapped').mockResolvedValue({
        success: true,
      })

      const { container } = renderWithToast(<RegenerateWrappedButton userId="user-1" inline={true} />)

      // Initial state - refresh icon
      let svg = container.querySelector('svg.text-purple-400')
      expect(svg).toBeInTheDocument()

      const button = screen.getByRole('button', { name: /Regenerate wrapped/i })
      await user.click(button)
      const confirmButton = screen.getByText('Regenerate')
      await user.click(confirmButton)

      // Success state - checkmark icon
      await waitFor(() => {
        svg = container.querySelector('svg.text-green-400')
        expect(svg).toBeInTheDocument()
      })
    })
  })

  describe('Confirm modal integration', () => {
    it('should pass correct props to ConfirmModal', async () => {
      const user = userEvent.setup({ delay: null })
      renderWithToast(<RegenerateWrappedButton userId="user-1" year={2023} />)
      const button = screen.getByRole('button', { name: /Regenerate wrapped/i })

      await user.click(button)

      expect(screen.getByText('Regenerate Wrapped')).toBeInTheDocument()
      expect(
        screen.getByText(
          'Are you sure you want to regenerate the 2023 wrapped for this user? This will overwrite the existing wrapped.'
        )
      ).toBeInTheDocument()
      expect(screen.getByText('Regenerate')).toBeInTheDocument()
      expect(screen.getByText('Cancel')).toBeInTheDocument()
    })
  })
})

