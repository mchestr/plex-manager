import { CandidateList } from '../CandidateList'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MaintenanceCandidate } from '@/types/maintenance'

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  CheckCircle: () => <div data-testid="check-circle-icon" />,
  Film: () => <div data-testid="film-icon" />,
  Check: () => <div data-testid="check-icon" />,
  X: () => <div data-testid="x-icon" />,
}))

// Mock StyledCheckbox to return a proper input element for testing
jest.mock('@/components/ui/styled-checkbox', () => ({
  StyledCheckbox: ({ checked, onChange, 'data-testid': dataTestId }: {
    checked?: boolean
    onChange?: () => void
    'data-testid'?: string
  }) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      data-testid={dataTestId}
    />
  ),
}))

describe('CandidateList', () => {
  const mockCandidate: MaintenanceCandidate = {
    id: 'candidate-1',
    mediaType: 'MOVIE',
    plexRatingKey: '12345',
    title: 'Test Movie',
    year: 2023,
    poster: '/poster.jpg',
    fileSize: BigInt(5368709120), // 5 GB
    playCount: 3,
    lastWatchedAt: new Date('2024-01-15T12:00:00Z'),
    addedAt: new Date('2023-06-01T00:00:00Z'),
    reviewStatus: 'PENDING',
    flaggedAt: new Date('2024-11-01T00:00:00Z'),
    scan: {
      id: 'scan-1',
      rule: {
        id: 'rule-1',
        name: 'Old Unwatched Movies',
        actionType: 'FLAG_FOR_REVIEW',
      },
    },
  }

  const defaultProps = {
    candidates: [mockCandidate],
    selectedCandidates: new Set<string>(),
    onToggleCandidate: jest.fn(),
    onToggleAll: jest.fn(),
    onApprove: jest.fn(),
    onReject: jest.fn(),
    isPending: false,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Empty State', () => {
    it('should display empty state when no candidates', () => {
      render(<CandidateList {...defaultProps} candidates={[]} />)

      expect(screen.getByTestId('candidates-empty-state')).toBeInTheDocument()
      expect(screen.getByText('No candidates found')).toBeInTheDocument()
      expect(screen.getByText('No media matching the current filters.')).toBeInTheDocument()
    })
  })

  describe('Candidate Display', () => {
    it('should render candidate with all details', () => {
      render(<CandidateList {...defaultProps} />)

      expect(screen.getByText('Test Movie')).toBeInTheDocument()
      expect(screen.getByText('2023')).toBeInTheDocument()
      expect(screen.getByText('Movie')).toBeInTheDocument()
      expect(screen.getByText('5 GB')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('Old Unwatched Movies')).toBeInTheDocument()
    })

    it('should display poster image when available', () => {
      render(<CandidateList {...defaultProps} />)

      const poster = screen.getByAltText('Test Movie')
      expect(poster).toBeInTheDocument()
      expect(poster).toHaveAttribute('src', '/poster.jpg')
    })

    it('should display placeholder icon when no poster', () => {
      const candidateWithoutPoster = { ...mockCandidate, poster: null }
      render(<CandidateList {...defaultProps} candidates={[candidateWithoutPoster]} />)

      expect(screen.queryByAltText('Test Movie')).not.toBeInTheDocument()
      expect(screen.getByTestId('film-icon')).toBeInTheDocument()
    })

    it('should format file size correctly', () => {
      render(<CandidateList {...defaultProps} />)
      expect(screen.getByText('5 GB')).toBeInTheDocument()
    })

    it('should format dates correctly', () => {
      render(<CandidateList {...defaultProps} />)

      // formatDate uses toLocaleDateString() which is locale-dependent
      // Match any common date format (e.g., "1/15/2024", "01/15/2024", "15/1/2024", "2024-01-15")
      expect(screen.getByText(/\d{1,4}[/\-]\d{1,2}[/\-]\d{2,4}/)).toBeInTheDocument()
    })

    it('should display "Never" for null lastWatchedAt', () => {
      const candidateNeverWatched = { ...mockCandidate, lastWatchedAt: null }
      render(<CandidateList {...defaultProps} candidates={[candidateNeverWatched]} />)

      expect(screen.getByText('Never')).toBeInTheDocument()
    })

    it('should display "Unknown" for null file size', () => {
      const candidateNoFileSize = { ...mockCandidate, fileSize: null }
      render(<CandidateList {...defaultProps} candidates={[candidateNoFileSize]} />)

      expect(screen.getByText('Unknown')).toBeInTheDocument()
    })

    it('should not display year when null', () => {
      const candidateNoYear = { ...mockCandidate, year: null }
      render(<CandidateList {...defaultProps} candidates={[candidateNoYear]} />)

      expect(screen.getByText('Test Movie')).toBeInTheDocument()
      expect(screen.queryByText('2023')).not.toBeInTheDocument()
    })

    it('should display different media types correctly', () => {
      const tvSeriesCandidate = { ...mockCandidate, mediaType: 'TV_SERIES' }
      render(<CandidateList {...defaultProps} candidates={[tvSeriesCandidate]} />)

      expect(screen.getByText('TV Series')).toBeInTheDocument()
    })
  })

  describe('Selection', () => {
    it('should call onToggleCandidate when individual checkbox is clicked', async () => {
      const user = userEvent.setup()
      const onToggleCandidate = jest.fn()

      render(<CandidateList {...defaultProps} onToggleCandidate={onToggleCandidate} />)

      const checkbox = screen.getByTestId('select-candidate-candidate-1')
      await user.click(checkbox)

      expect(onToggleCandidate).toHaveBeenCalledWith('candidate-1')
    })

    it('should call onToggleAll when select all checkbox is clicked', async () => {
      const user = userEvent.setup()
      const onToggleAll = jest.fn()

      render(<CandidateList {...defaultProps} onToggleAll={onToggleAll} />)

      const selectAllCheckbox = screen.getByTestId('select-all-candidates')
      await user.click(selectAllCheckbox)

      expect(onToggleAll).toHaveBeenCalled()
    })

    it('should show checkbox as checked when candidate is selected', () => {
      const selectedCandidates = new Set(['candidate-1'])

      render(<CandidateList {...defaultProps} selectedCandidates={selectedCandidates} />)

      const checkbox = screen.getByTestId('select-candidate-candidate-1')
      expect(checkbox).toBeChecked()
    })

    it('should show select all checkbox as checked when all candidates are selected', () => {
      const selectedCandidates = new Set(['candidate-1'])

      render(<CandidateList {...defaultProps} selectedCandidates={selectedCandidates} />)

      const selectAllCheckbox = screen.getByTestId('select-all-candidates')
      expect(selectAllCheckbox).toBeChecked()
    })
  })

  describe('Actions', () => {
    it('should show approve and reject buttons for pending candidates', () => {
      render(<CandidateList {...defaultProps} />)

      expect(screen.getByTestId('approve-candidate-candidate-1')).toBeInTheDocument()
      expect(screen.getByTestId('reject-candidate-candidate-1')).toBeInTheDocument()
    })

    it('should not show action buttons for approved candidates', () => {
      const approvedCandidate = { ...mockCandidate, reviewStatus: 'APPROVED' as const }
      render(<CandidateList {...defaultProps} candidates={[approvedCandidate]} />)

      expect(screen.queryByTestId('approve-candidate-candidate-1')).not.toBeInTheDocument()
      expect(screen.queryByTestId('reject-candidate-candidate-1')).not.toBeInTheDocument()
    })

    it('should call onApprove when approve button is clicked', async () => {
      const user = userEvent.setup()
      const onApprove = jest.fn()

      render(<CandidateList {...defaultProps} onApprove={onApprove} />)

      const approveButton = screen.getByTestId('approve-candidate-candidate-1')
      await user.click(approveButton)

      expect(onApprove).toHaveBeenCalledWith('candidate-1')
    })

    it('should call onReject when reject button is clicked', async () => {
      const user = userEvent.setup()
      const onReject = jest.fn()

      render(<CandidateList {...defaultProps} onReject={onReject} />)

      const rejectButton = screen.getByTestId('reject-candidate-candidate-1')
      await user.click(rejectButton)

      expect(onReject).toHaveBeenCalledWith('candidate-1')
    })

    it('should disable action buttons when isPending is true', () => {
      render(<CandidateList {...defaultProps} isPending={true} />)

      expect(screen.getByTestId('approve-candidate-candidate-1')).toBeDisabled()
      expect(screen.getByTestId('reject-candidate-candidate-1')).toBeDisabled()
    })
  })

  describe('Review Status', () => {
    it('should display correct badge color for approved status', () => {
      const approvedCandidate = { ...mockCandidate, reviewStatus: 'APPROVED' as const }
      render(<CandidateList {...defaultProps} candidates={[approvedCandidate]} />)

      const badge = screen.getByText('APPROVED')
      expect(badge).toHaveClass('bg-green-400/10', 'text-green-400')
    })

    it('should display correct badge color for rejected status', () => {
      const rejectedCandidate = { ...mockCandidate, reviewStatus: 'REJECTED' as const }
      render(<CandidateList {...defaultProps} candidates={[rejectedCandidate]} />)

      const badge = screen.getByText('REJECTED')
      expect(badge).toHaveClass('bg-red-400/10', 'text-red-400')
    })

    it('should display correct badge color for pending status', () => {
      render(<CandidateList {...defaultProps} />)

      const badge = screen.getByText('PENDING')
      expect(badge).toHaveClass('bg-yellow-400/10', 'text-yellow-400')
    })

    it('should display correct badge color for deleted status', () => {
      const deletedCandidate = { ...mockCandidate, reviewStatus: 'DELETED' as const }
      render(<CandidateList {...defaultProps} candidates={[deletedCandidate]} />)

      const badge = screen.getByText('DELETED')
      expect(badge).toHaveClass('bg-slate-400/10', 'text-slate-400')
    })
  })

  describe('Multiple Candidates', () => {
    it('should render multiple candidates', () => {
      const candidates = [
        mockCandidate,
        { ...mockCandidate, id: 'candidate-2', title: 'Test Movie 2' },
        { ...mockCandidate, id: 'candidate-3', title: 'Test Movie 3' },
      ]

      render(<CandidateList {...defaultProps} candidates={candidates} />)

      expect(screen.getByText('Test Movie')).toBeInTheDocument()
      expect(screen.getByText('Test Movie 2')).toBeInTheDocument()
      expect(screen.getByText('Test Movie 3')).toBeInTheDocument()
    })

    it('should show select all unchecked when not all candidates are selected', () => {
      const candidates = [
        mockCandidate,
        { ...mockCandidate, id: 'candidate-2', title: 'Test Movie 2' },
      ]
      const selectedCandidates = new Set(['candidate-1']) // Only 1 of 2 selected

      render(<CandidateList {...defaultProps} candidates={candidates} selectedCandidates={selectedCandidates} />)

      const selectAllCheckbox = screen.getByTestId('select-all-candidates')
      expect(selectAllCheckbox).not.toBeChecked()
    })
  })

  describe('Action Type Display', () => {
    it('should display "Flag for Review" in yellow for FLAG_FOR_REVIEW action type', () => {
      render(<CandidateList {...defaultProps} />)

      const actionLabel = screen.getByText('Flag for Review')
      expect(actionLabel).toBeInTheDocument()
      expect(actionLabel).toHaveClass('text-yellow-400')
    })

    it('should display "Auto Delete" in red for AUTO_DELETE action type', () => {
      const autoDeleteCandidate = {
        ...mockCandidate,
        scan: {
          ...mockCandidate.scan,
          rule: {
            ...mockCandidate.scan.rule,
            actionType: 'AUTO_DELETE',
          },
        },
      }
      render(<CandidateList {...defaultProps} candidates={[autoDeleteCandidate]} />)

      const actionLabel = screen.getByText('Auto Delete')
      expect(actionLabel).toBeInTheDocument()
      expect(actionLabel).toHaveClass('text-red-400')
    })
  })
})
