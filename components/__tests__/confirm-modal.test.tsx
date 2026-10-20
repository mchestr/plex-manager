import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import { ConfirmModal } from '@/components/admin/shared/confirm-modal'

expect.extend(toHaveNoViolations)

/** The ConfirmModal adapter over ConfirmDialog (P3.6). */
describe('ConfirmModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    onConfirm: jest.fn(),
    title: 'Delete Invite',
    message: 'This action cannot be undone.',
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders nothing while closed', () => {
    render(<ConfirmModal {...defaultProps} isOpen={false} />)
    expect(screen.queryByText('Delete Invite')).not.toBeInTheDocument()
  })

  it('renders ConfirmDialog with the title, message and test ids, with no axe violations', async () => {
    render(<ConfirmModal {...defaultProps} testId="dialog" confirmTestId="dialog-confirm" />)
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Invite' })
    expect(dialog).toHaveAccessibleDescription('This action cannot be undone.')
    expect(dialog).toHaveAttribute('data-testid', 'dialog')
    expect(screen.getByTestId('dialog-confirm')).toHaveTextContent('Confirm')
    expect(await axe(document.body)).toHaveNoViolations()
  })

  it('keeps the button text props', async () => {
    render(<ConfirmModal {...defaultProps} confirmText="Delete" cancelText="Keep" />)
    expect(await screen.findByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep' })).toBeInTheDocument()
  })

  it('calls onConfirm, then onClose', async () => {
    const user = userEvent.setup()
    const onConfirm = jest.fn()
    const onClose = jest.fn()
    render(<ConfirmModal {...defaultProps} onConfirm={onConfirm} onClose={onClose} />)

    await user.click(await screen.findByRole('button', { name: 'Confirm' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('shows the pending state until an async onConfirm settles', async () => {
    const user = userEvent.setup()
    let finish: () => void = () => {}
    const onConfirm = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    const onClose = jest.fn()
    render(<ConfirmModal {...defaultProps} onConfirm={onConfirm} onClose={onClose} confirmTestId="confirm" />)

    await user.click(await screen.findByTestId('confirm'))

    expect(screen.getByTestId('confirm')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(onClose).not.toHaveBeenCalled()

    await act(async () => finish())
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('calls onClose on Cancel and on Escape', async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()
    render(<ConfirmModal {...defaultProps} onClose={onClose} />)

    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('maps a red confirmButtonClass to the destructive tone and ignores the rest', async () => {
    const { rerender } = render(<ConfirmModal {...defaultProps} confirmButtonClass="bg-red-600 hover:bg-red-700" confirmTestId="c" />)
    expect(await screen.findByTestId('c')).toHaveClass('bg-destructive')
    expect(screen.getByTestId('c')).not.toHaveClass('bg-red-600')

    rerender(<ConfirmModal {...defaultProps} confirmButtonClass="bg-green-600 hover:bg-green-700" confirmTestId="c" />)
    expect(screen.getByTestId('c')).toHaveClass('bg-primary')
  })
})
