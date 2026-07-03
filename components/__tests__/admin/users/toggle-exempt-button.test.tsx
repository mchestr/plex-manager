import { ToggleExemptButton } from '@/components/admin/users/toggle-exempt-button'
import * as subscriptionActions from '@/actions/admin/subscriptions'
import { useToast } from '@/components/ui/toast'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'

jest.mock('@/actions/admin/subscriptions', () => ({
  adminToggleExempt: jest.fn(),
}))

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))

jest.mock('@/components/ui/toast', () => ({
  useToast: jest.fn(),
}))

const mockToggle = subscriptionActions.adminToggleExempt as jest.Mock

describe('ToggleExemptButton', () => {
  const mockRefresh = jest.fn()
  const mockShowSuccess = jest.fn()
  const mockShowError = jest.fn()
  const mockOnSuccess = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue({ refresh: mockRefresh })
    ;(useToast as jest.Mock).mockReturnValue({
      showSuccess: mockShowSuccess,
      showError: mockShowError,
    })
  })

  it('labels "Mark Exempt" for a non-exempt user', () => {
    render(<ToggleExemptButton userId="user-1" isExempt={false} />)
    expect(screen.getByText('Mark Exempt')).toBeInTheDocument()
  })

  it('labels "Remove Exempt" for an exempt user', () => {
    render(<ToggleExemptButton userId="user-1" isExempt={true} />)
    expect(screen.getByText('Remove Exempt')).toBeInTheDocument()
  })

  it('calls the toggle action and refreshes on success', async () => {
    const user = userEvent.setup()
    mockToggle.mockResolvedValue({ success: true })

    render(<ToggleExemptButton userId="user-1" isExempt={false} onSuccess={mockOnSuccess} />)

    await user.click(screen.getByTestId('toggle-exempt-button'))

    await waitFor(() => {
      expect(mockToggle).toHaveBeenCalledWith('user-1')
    })
    expect(mockShowSuccess).toHaveBeenCalledWith('User marked exempt')
    expect(mockRefresh).toHaveBeenCalled()
    expect(mockOnSuccess).toHaveBeenCalled()
  })

  it('confirms before removing exemption, then shows a removal message', async () => {
    const user = userEvent.setup()
    mockToggle.mockResolvedValue({ success: true })

    render(<ToggleExemptButton userId="user-1" isExempt={true} />)

    // Removing exemption is confirmed via a modal, not applied immediately.
    await user.click(screen.getByTestId('toggle-exempt-button'))
    expect(mockToggle).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Remove Exemption' }))

    await waitFor(() => {
      expect(mockToggle).toHaveBeenCalledWith('user-1')
    })
    expect(mockShowSuccess).toHaveBeenCalledWith('Exemption removed')
  })

  it('shows an error toast when the action fails', async () => {
    const user = userEvent.setup()
    mockToggle.mockResolvedValue({ error: 'User not found' })

    render(<ToggleExemptButton userId="user-1" isExempt={false} />)

    await user.click(screen.getByTestId('toggle-exempt-button'))

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('User not found')
    })
    expect(mockShowSuccess).not.toHaveBeenCalled()
  })
})
