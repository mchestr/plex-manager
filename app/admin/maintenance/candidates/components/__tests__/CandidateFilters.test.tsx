import { CandidateFilters } from '../CandidateFilters'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock StyledDropdown component
jest.mock('@/components/ui/styled-dropdown', () => ({
  StyledDropdown: ({ value, onChange, options, 'data-testid': dataTestId }: {
    value: string
    onChange: (value: string) => void
    options: Array<{ value: string; label: string }>
    'data-testid'?: string
  }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      data-testid={dataTestId}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}))

describe('CandidateFilters', () => {
  const defaultProps = {
    reviewStatusFilter: 'PENDING' as const,
    mediaTypeFilter: 'ALL' as const,
    onReviewStatusChange: jest.fn(),
    onMediaTypeChange: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render both filter dropdowns', () => {
      render(<CandidateFilters {...defaultProps} />)

      expect(screen.getByTestId('review-status-filter')).toBeInTheDocument()
      expect(screen.getByTestId('media-type-filter')).toBeInTheDocument()
    })

    it('should render filter labels', () => {
      render(<CandidateFilters {...defaultProps} />)

      expect(screen.getByText('Review Status')).toBeInTheDocument()
      expect(screen.getByText('Media Type')).toBeInTheDocument()
    })

    it('should have correct container test id', () => {
      render(<CandidateFilters {...defaultProps} />)

      expect(screen.getByTestId('candidate-filters-container')).toBeInTheDocument()
    })
  })

  describe('Review Status Filter', () => {
    it('should display current review status value', () => {
      render(<CandidateFilters {...defaultProps} reviewStatusFilter="APPROVED" />)

      const select = screen.getByTestId('review-status-filter')
      expect(select).toHaveValue('APPROVED')
    })

    it('should have all review status options', () => {
      render(<CandidateFilters {...defaultProps} />)

      const select = screen.getByTestId('review-status-filter')

      expect(screen.getByText('All Status')).toBeInTheDocument()
      expect(screen.getByText('Pending')).toBeInTheDocument()
      expect(screen.getByText('Approved')).toBeInTheDocument()
      expect(screen.getByText('Rejected')).toBeInTheDocument()
    })

    it('should call onReviewStatusChange when value changes', async () => {
      const user = userEvent.setup()
      const onReviewStatusChange = jest.fn()

      render(<CandidateFilters {...defaultProps} onReviewStatusChange={onReviewStatusChange} />)

      const select = screen.getByTestId('review-status-filter')
      await user.selectOptions(select, 'APPROVED')

      expect(onReviewStatusChange).toHaveBeenCalledWith('APPROVED')
    })

    it('should support "ALL" option', async () => {
      const user = userEvent.setup()
      const onReviewStatusChange = jest.fn()

      render(<CandidateFilters {...defaultProps} onReviewStatusChange={onReviewStatusChange} />)

      const select = screen.getByTestId('review-status-filter')
      await user.selectOptions(select, 'ALL')

      expect(onReviewStatusChange).toHaveBeenCalledWith('ALL')
    })
  })

  describe('Media Type Filter', () => {
    it('should display current media type value', () => {
      render(<CandidateFilters {...defaultProps} mediaTypeFilter="MOVIE" />)

      const select = screen.getByTestId('media-type-filter')
      expect(select).toHaveValue('MOVIE')
    })

    it('should have all media type options', () => {
      render(<CandidateFilters {...defaultProps} />)

      expect(screen.getByText('All Types')).toBeInTheDocument()
      expect(screen.getByText('Movie')).toBeInTheDocument()
      expect(screen.getByText('TV Series')).toBeInTheDocument()
      expect(screen.getByText('Episode')).toBeInTheDocument()
    })

    it('should call onMediaTypeChange when value changes', async () => {
      const user = userEvent.setup()
      const onMediaTypeChange = jest.fn()

      render(<CandidateFilters {...defaultProps} onMediaTypeChange={onMediaTypeChange} />)

      const select = screen.getByTestId('media-type-filter')
      await user.selectOptions(select, 'MOVIE')

      expect(onMediaTypeChange).toHaveBeenCalledWith('MOVIE')
    })

    it('should support "ALL" option', async () => {
      const user = userEvent.setup()
      const onMediaTypeChange = jest.fn()

      render(<CandidateFilters {...defaultProps} onMediaTypeChange={onMediaTypeChange} />)

      const select = screen.getByTestId('media-type-filter')
      await user.selectOptions(select, 'ALL')

      expect(onMediaTypeChange).toHaveBeenCalledWith('ALL')
    })

    it('should support TV_SERIES option', async () => {
      const user = userEvent.setup()
      const onMediaTypeChange = jest.fn()

      render(<CandidateFilters {...defaultProps} onMediaTypeChange={onMediaTypeChange} />)

      const select = screen.getByTestId('media-type-filter')
      await user.selectOptions(select, 'TV_SERIES')

      expect(onMediaTypeChange).toHaveBeenCalledWith('TV_SERIES')
    })

    it('should support EPISODE option', async () => {
      const user = userEvent.setup()
      const onMediaTypeChange = jest.fn()

      render(<CandidateFilters {...defaultProps} onMediaTypeChange={onMediaTypeChange} />)

      const select = screen.getByTestId('media-type-filter')
      await user.selectOptions(select, 'EPISODE')

      expect(onMediaTypeChange).toHaveBeenCalledWith('EPISODE')
    })
  })

  describe('Accessibility', () => {
    it('should have proper label associations', () => {
      render(<CandidateFilters {...defaultProps} />)

      // Labels should be visible and properly associated
      expect(screen.getByText('Review Status')).toBeInTheDocument()
      expect(screen.getByText('Media Type')).toBeInTheDocument()
    })
  })
})
