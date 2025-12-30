import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmModal } from '@/components/ui/alert-dialog'

describe('ConfirmModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    onConfirm: jest.fn(),
    title: 'Test Title',
    message: 'Test Message',
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should not render when isOpen is false', () => {
    render(<ConfirmModal {...defaultProps} isOpen={false} />)
    expect(screen.queryByText('Test Title')).not.toBeInTheDocument()
  })

  it('should render modal content when isOpen is true', () => {
    render(<ConfirmModal {...defaultProps} />)
    expect(screen.getByText('Test Title')).toBeInTheDocument()
    expect(screen.getByText('Test Message')).toBeInTheDocument()
  })

  it('should render default button texts', () => {
    render(<ConfirmModal {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('should render custom button texts', () => {
    render(
      <ConfirmModal
        {...defaultProps}
        confirmText="Delete"
        cancelText="Keep"
      />
    )
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep' })).toBeInTheDocument()
  })

  it('should call onConfirm and onClose when confirm button is clicked', async () => {
    const user = userEvent.setup()
    const onConfirm = jest.fn()
    const onClose = jest.fn()

    render(<ConfirmModal {...defaultProps} onConfirm={onConfirm} onClose={onClose} />)

    const confirmButton = screen.getByRole('button', { name: 'Confirm' })
    await user.click(confirmButton)

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1)
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('should call onClose when cancel button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()

    render(<ConfirmModal {...defaultProps} onClose={onClose} />)

    const cancelButton = screen.getByRole('button', { name: 'Cancel' })
    await user.click(cancelButton)

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('should call onClose when ESC key is pressed', async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()

    render(<ConfirmModal {...defaultProps} onClose={onClose} />)

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('should apply custom confirm button class', () => {
    render(<ConfirmModal {...defaultProps} confirmButtonClass="bg-red-600 hover:bg-red-700" />)
    const confirmButton = screen.getByRole('button', { name: 'Confirm' })
    expect(confirmButton).toHaveClass('bg-red-600', 'hover:bg-red-700')
  })

  it('should handle long messages with scrolling', () => {
    const longMessage = 'A'.repeat(1000)
    render(<ConfirmModal {...defaultProps} message={longMessage} />)
    const messageContainer = screen.getByText(longMessage).closest('.max-h-\\[60vh\\]')
    expect(messageContainer).toHaveClass('overflow-y-auto')
  })

  it('should have proper accessibility attributes', () => {
    render(<ConfirmModal {...defaultProps} />)

    // AlertDialog should have proper role
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    // Title and description should be accessible
    expect(screen.getByText('Test Title')).toBeInTheDocument()
    expect(screen.getByText('Test Message')).toBeInTheDocument()
  })
})
