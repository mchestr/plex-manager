import { CandidateActions } from '../CandidateActions'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Check: () => <div data-testid="check-icon" />,
  X: () => <div data-testid="x-icon" />,
}))

// Mock Button component
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, 'data-testid': dataTestId }: {
    children: React.ReactNode
    onClick: () => void
    disabled?: boolean
    variant?: string
    'data-testid'?: string
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
      data-testid={dataTestId}
    >
      {children}
    </button>
  ),
}))

describe('CandidateActions', () => {
  const defaultProps = {
    selectedCount: 5,
    onBulkApprove: jest.fn(),
    onBulkReject: jest.fn(),
    isPending: false,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render both approve and reject buttons when candidates are selected', () => {
      render(<CandidateActions {...defaultProps} />)

      expect(screen.getByTestId('bulk-approve-button')).toBeInTheDocument()
      expect(screen.getByTestId('bulk-reject-button')).toBeInTheDocument()
    })

    it('should display selected count in button text', () => {
      render(<CandidateActions {...defaultProps} selectedCount={3} />)

      expect(screen.getByText(/Approve \(3\)/)).toBeInTheDocument()
      expect(screen.getByText(/Reject \(3\)/)).toBeInTheDocument()
    })

    it('should hide buttons when selectedCount is 0', () => {
      const { container } = render(<CandidateActions {...defaultProps} selectedCount={0} />)

      // Buttons exist in DOM but container is hidden
      const containerDiv = container.firstChild as HTMLElement
      expect(containerDiv).toBeInTheDocument()
      expect(containerDiv).toHaveClass('hidden')
      expect(screen.getByTestId('bulk-approve-button')).toBeInTheDocument()
      expect(screen.getByTestId('bulk-reject-button')).toBeInTheDocument()
    })

    it('should render icons in buttons', () => {
      render(<CandidateActions {...defaultProps} />)

      expect(screen.getByTestId('check-icon')).toBeInTheDocument()
      expect(screen.getByTestId('x-icon')).toBeInTheDocument()
    })
  })

  describe('Button Variants', () => {
    it('should use success variant for approve button', () => {
      render(<CandidateActions {...defaultProps} />)

      const approveButton = screen.getByTestId('bulk-approve-button')
      expect(approveButton).toHaveAttribute('data-variant', 'success')
    })

    it('should use danger variant for reject button', () => {
      render(<CandidateActions {...defaultProps} />)

      const rejectButton = screen.getByTestId('bulk-reject-button')
      expect(rejectButton).toHaveAttribute('data-variant', 'danger')
    })
  })

  describe('User Interactions', () => {
    it('should call onBulkApprove when approve button is clicked', async () => {
      const user = userEvent.setup()
      const onBulkApprove = jest.fn()

      render(<CandidateActions {...defaultProps} onBulkApprove={onBulkApprove} />)

      const approveButton = screen.getByTestId('bulk-approve-button')
      await user.click(approveButton)

      expect(onBulkApprove).toHaveBeenCalledTimes(1)
    })

    it('should call onBulkReject when reject button is clicked', async () => {
      const user = userEvent.setup()
      const onBulkReject = jest.fn()

      render(<CandidateActions {...defaultProps} onBulkReject={onBulkReject} />)

      const rejectButton = screen.getByTestId('bulk-reject-button')
      await user.click(rejectButton)

      expect(onBulkReject).toHaveBeenCalledTimes(1)
    })
  })

  describe('Disabled State', () => {
    it('should disable buttons when isPending is true', () => {
      render(<CandidateActions {...defaultProps} isPending={true} />)

      expect(screen.getByTestId('bulk-approve-button')).toBeDisabled()
      expect(screen.getByTestId('bulk-reject-button')).toBeDisabled()
    })

    it('should enable buttons when isPending is false', () => {
      render(<CandidateActions {...defaultProps} isPending={false} />)

      expect(screen.getByTestId('bulk-approve-button')).not.toBeDisabled()
      expect(screen.getByTestId('bulk-reject-button')).not.toBeDisabled()
    })

    it('should not call handlers when buttons are disabled and clicked', async () => {
      const user = userEvent.setup()
      const onBulkApprove = jest.fn()
      const onBulkReject = jest.fn()

      render(
        <CandidateActions
          {...defaultProps}
          isPending={true}
          onBulkApprove={onBulkApprove}
          onBulkReject={onBulkReject}
        />
      )

      const approveButton = screen.getByTestId('bulk-approve-button')
      const rejectButton = screen.getByTestId('bulk-reject-button')

      // Disabled buttons should not trigger handlers
      await user.click(approveButton)
      await user.click(rejectButton)

      expect(onBulkApprove).not.toHaveBeenCalled()
      expect(onBulkReject).not.toHaveBeenCalled()
    })
  })

  describe('Different Selected Counts', () => {
    it('should display count of 1 correctly', () => {
      render(<CandidateActions {...defaultProps} selectedCount={1} />)

      expect(screen.getByText(/Approve \(1\)/)).toBeInTheDocument()
      expect(screen.getByText(/Reject \(1\)/)).toBeInTheDocument()
    })

    it('should display large counts correctly', () => {
      render(<CandidateActions {...defaultProps} selectedCount={100} />)

      expect(screen.getByText(/Approve \(100\)/)).toBeInTheDocument()
      expect(screen.getByText(/Reject \(100\)/)).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have data-testid attributes for testing', () => {
      render(<CandidateActions {...defaultProps} />)

      expect(screen.getByTestId('bulk-approve-button')).toBeInTheDocument()
      expect(screen.getByTestId('bulk-reject-button')).toBeInTheDocument()
    })
  })
})
