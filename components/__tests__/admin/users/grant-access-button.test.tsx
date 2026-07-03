import { GrantAccessButton } from '@/components/admin/users/grant-access-button'
import * as subscriptionActions from '@/actions/admin/subscriptions'
import { useToast } from '@/components/ui/toast'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'

jest.mock('@/actions/admin/subscriptions', () => ({
  adminGrantAccess: jest.fn(),
}))

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))

jest.mock('@/components/ui/toast', () => ({
  useToast: jest.fn(),
}))

jest.mock('@/components/admin/shared/confirm-modal', () => ({
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

const mockGrant = subscriptionActions.adminGrantAccess as jest.Mock

describe('GrantAccessButton', () => {
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

  it('renders the grant button', () => {
    render(<GrantAccessButton userId="user-1" userName="Alice" />)
    expect(screen.getByTestId('grant-access-button')).toBeInTheDocument()
    expect(screen.getByText('Grant Access (Comp)')).toBeInTheDocument()
  })

  it('opens the confirm modal and calls the action on confirm', async () => {
    const user = userEvent.setup()
    mockGrant.mockResolvedValue({ success: true })

    render(<GrantAccessButton userId="user-1" userName="Alice" onSuccess={mockOnSuccess} />)

    await user.click(screen.getByTestId('grant-access-button'))
    expect(screen.getByTestId('confirm-modal')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Grant Access' }))

    await waitFor(() => {
      expect(mockGrant).toHaveBeenCalledWith('user-1')
    })
    expect(mockShowSuccess).toHaveBeenCalled()
    expect(mockRefresh).toHaveBeenCalled()
    expect(mockOnSuccess).toHaveBeenCalled()
  })

  it('shows an error toast when the action fails', async () => {
    const user = userEvent.setup()
    mockGrant.mockResolvedValue({ error: 'User not found' })

    render(<GrantAccessButton userId="user-1" userName="Alice" />)

    await user.click(screen.getByTestId('grant-access-button'))
    await user.click(screen.getByRole('button', { name: 'Grant Access' }))

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('User not found')
    })
    expect(mockShowSuccess).not.toHaveBeenCalled()
  })

  it('does not call the action when the modal is dismissed', async () => {
    const user = userEvent.setup()

    render(<GrantAccessButton userId="user-1" userName="Alice" />)

    await user.click(screen.getByTestId('grant-access-button'))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(mockGrant).not.toHaveBeenCalled()
  })
})
