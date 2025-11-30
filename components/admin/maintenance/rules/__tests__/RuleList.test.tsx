import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RuleList } from '../RuleList'

// Mock next/link
jest.mock('next/link', () => {
  return ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
})

// Mock formatters
jest.mock('@/lib/utils/formatters', () => ({
  getMediaTypeLabel: (type: string) => {
    switch (type) {
      case 'MOVIE':
        return 'Movie'
      case 'TV_SERIES':
        return 'TV Series'
      case 'EPISODE':
        return 'Episode'
      default:
        return type
    }
  },
}))

type MaintenanceRule = {
  id: string
  name: string
  description: string | null
  enabled: boolean
  mediaType: string
  actionType: string
  schedule: string | null
  createdAt: Date
  scans: Array<{
    id: string
    status: string
    itemsScanned: number
    itemsFlagged: number
    completedAt: Date | null
  }>
  _count: {
    scans: number
  }
}

describe('RuleList', () => {
  const mockRule: MaintenanceRule = {
    id: 'rule-1',
    name: 'Old Unwatched Movies',
    description: 'Clean up movies not watched in 6 months',
    enabled: true,
    mediaType: 'MOVIE',
    actionType: 'FLAG_FOR_REVIEW',
    schedule: '0 0 * * 0',
    createdAt: new Date('2024-01-01'),
    scans: [
      {
        id: 'scan-1',
        status: 'COMPLETED',
        itemsScanned: 100,
        itemsFlagged: 15,
        completedAt: new Date('2024-11-15'),
      },
    ],
    _count: {
      scans: 5,
    },
  }

  const defaultProps = {
    rules: [mockRule],
    onToggle: jest.fn(),
    onManualScan: jest.fn(),
    onDeleteClick: jest.fn(),
    isTogglePending: false,
    isScanPending: false,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Empty State', () => {
    it('should display empty state when no rules', () => {
      render(<RuleList {...defaultProps} rules={[]} />)

      expect(screen.getByText('No rules yet')).toBeInTheDocument()
      expect(
        screen.getByText('Create a maintenance rule to start automating library cleanup.')
      ).toBeInTheDocument()
    })

    it('should display create first rule link in empty state', () => {
      render(<RuleList {...defaultProps} rules={[]} />)

      const createLink = screen.getByRole('link', { name: /Create First Rule/i })
      expect(createLink).toBeInTheDocument()
      expect(createLink).toHaveAttribute('href', '/admin/maintenance/rules/new')
    })
  })

  describe('Rule Display', () => {
    it('should render rule with all details', () => {
      render(<RuleList {...defaultProps} />)

      expect(screen.getByText('Old Unwatched Movies')).toBeInTheDocument()
      expect(screen.getByText('Clean up movies not watched in 6 months')).toBeInTheDocument()
      expect(screen.getByText('Movie')).toBeInTheDocument()
      expect(screen.getByText('Flag for Review')).toBeInTheDocument()
    })

    it('should display rule without description', () => {
      const ruleWithoutDescription = { ...mockRule, description: null }
      render(<RuleList {...defaultProps} rules={[ruleWithoutDescription]} />)

      expect(screen.getByText('Old Unwatched Movies')).toBeInTheDocument()
      expect(screen.queryByText('Clean up movies not watched in 6 months')).not.toBeInTheDocument()
    })

    it('should display enabled status correctly', () => {
      render(<RuleList {...defaultProps} />)

      expect(screen.getByText('Enabled')).toBeInTheDocument()
    })

    it('should display disabled status correctly', () => {
      const disabledRule = { ...mockRule, enabled: false }
      render(<RuleList {...defaultProps} rules={[disabledRule]} />)

      expect(screen.getByText('Disabled')).toBeInTheDocument()
    })

    it('should display scan count', () => {
      render(<RuleList {...defaultProps} />)

      expect(screen.getByText('5 total')).toBeInTheDocument()
    })

    it('should display flagged count from last scan', () => {
      render(<RuleList {...defaultProps} />)

      expect(screen.getByText('(15 flagged)')).toBeInTheDocument()
    })

    it('should not display flagged count when zero', () => {
      const ruleWithNoFlagged = {
        ...mockRule,
        scans: [{ ...mockRule.scans[0], itemsFlagged: 0 }],
      }
      render(<RuleList {...defaultProps} rules={[ruleWithNoFlagged]} />)

      expect(screen.queryByText(/flagged/)).not.toBeInTheDocument()
    })

    it('should display last run date', () => {
      render(<RuleList {...defaultProps} />)

      // Date formatted as localized date string
      const expectedDate = new Date('2024-11-15').toLocaleDateString()
      expect(screen.getByText(expectedDate)).toBeInTheDocument()
    })

    it('should display "Never" when no scans completed', () => {
      const ruleWithNoScans = { ...mockRule, scans: [] }
      render(<RuleList {...defaultProps} rules={[ruleWithNoScans]} />)

      expect(screen.getByText('Never')).toBeInTheDocument()
    })
  })

  describe('Action Types', () => {
    it('should display Flag for Review action type', () => {
      render(<RuleList {...defaultProps} />)

      expect(screen.getByText('Flag for Review')).toBeInTheDocument()
    })

    it('should display Auto Delete action type', () => {
      const autoDeleteRule = { ...mockRule, actionType: 'AUTO_DELETE' }
      render(<RuleList {...defaultProps} rules={[autoDeleteRule]} />)

      expect(screen.getByText('Auto Delete')).toBeInTheDocument()
    })

    it('should style Auto Delete action type in red', () => {
      const autoDeleteRule = { ...mockRule, actionType: 'AUTO_DELETE' }
      render(<RuleList {...defaultProps} rules={[autoDeleteRule]} />)

      const badge = screen.getByText('Auto Delete')
      expect(badge).toHaveClass('bg-red-400/10', 'text-red-400')
    })

    it('should style Flag for Review in yellow', () => {
      render(<RuleList {...defaultProps} />)

      const badge = screen.getByText('Flag for Review')
      expect(badge).toHaveClass('bg-yellow-400/10', 'text-yellow-400')
    })
  })

  describe('User Interactions', () => {
    it('should call onToggle when status button is clicked', async () => {
      const user = userEvent.setup()
      const onToggle = jest.fn()

      render(<RuleList {...defaultProps} onToggle={onToggle} />)

      await user.click(screen.getByTestId('toggle-rule-rule-1'))

      expect(onToggle).toHaveBeenCalledWith('rule-1', true)
    })

    it('should call onManualScan when scan button is clicked', async () => {
      const user = userEvent.setup()
      const onManualScan = jest.fn()

      render(<RuleList {...defaultProps} onManualScan={onManualScan} />)

      await user.click(screen.getByTestId('scan-rule-rule-1'))

      expect(onManualScan).toHaveBeenCalledWith('rule-1')
    })

    it('should call onDeleteClick when delete button is clicked', async () => {
      const user = userEvent.setup()
      const onDeleteClick = jest.fn()

      render(<RuleList {...defaultProps} onDeleteClick={onDeleteClick} />)

      await user.click(screen.getByTestId('delete-rule-rule-1'))

      expect(onDeleteClick).toHaveBeenCalledWith('rule-1')
    })

    it('should link to edit page', () => {
      render(<RuleList {...defaultProps} />)

      const editLink = screen.getByTestId('edit-rule-rule-1')
      expect(editLink).toHaveAttribute('href', '/admin/maintenance/rules/rule-1/edit')
    })
  })

  describe('Disabled States', () => {
    it('should disable toggle button when isTogglePending is true', () => {
      render(<RuleList {...defaultProps} isTogglePending={true} />)

      expect(screen.getByTestId('toggle-rule-rule-1')).toBeDisabled()
    })

    it('should disable scan button when isScanPending is true', () => {
      render(<RuleList {...defaultProps} isScanPending={true} />)

      expect(screen.getByTestId('scan-rule-rule-1')).toBeDisabled()
    })

    it('should disable scan button when rule is disabled', () => {
      const disabledRule = { ...mockRule, enabled: false }
      render(<RuleList {...defaultProps} rules={[disabledRule]} />)

      expect(screen.getByTestId('scan-rule-rule-1')).toBeDisabled()
    })

    it('should enable scan button when rule is enabled and not pending', () => {
      render(<RuleList {...defaultProps} />)

      expect(screen.getByTestId('scan-rule-rule-1')).not.toBeDisabled()
    })
  })

  describe('Multiple Rules', () => {
    it('should render multiple rules', () => {
      const rules = [
        mockRule,
        { ...mockRule, id: 'rule-2', name: 'TV Series Cleanup', mediaType: 'TV_SERIES' },
        { ...mockRule, id: 'rule-3', name: 'Episode Cleanup', mediaType: 'EPISODE' },
      ]

      render(<RuleList {...defaultProps} rules={rules} />)

      expect(screen.getByText('Old Unwatched Movies')).toBeInTheDocument()
      expect(screen.getByText('TV Series Cleanup')).toBeInTheDocument()
      expect(screen.getByText('Episode Cleanup')).toBeInTheDocument()
    })

    it('should have correct test IDs for multiple rules', () => {
      const rules = [
        mockRule,
        { ...mockRule, id: 'rule-2', name: 'Second Rule' },
      ]

      render(<RuleList {...defaultProps} rules={rules} />)

      expect(screen.getByTestId('rule-row-rule-1')).toBeInTheDocument()
      expect(screen.getByTestId('rule-row-rule-2')).toBeInTheDocument()
    })
  })

  describe('Media Types', () => {
    it('should display Movie media type', () => {
      render(<RuleList {...defaultProps} />)

      expect(screen.getByText('Movie')).toBeInTheDocument()
    })

    it('should display TV Series media type', () => {
      const tvRule = { ...mockRule, mediaType: 'TV_SERIES' }
      render(<RuleList {...defaultProps} rules={[tvRule]} />)

      expect(screen.getByText('TV Series')).toBeInTheDocument()
    })

    it('should display Episode media type', () => {
      const episodeRule = { ...mockRule, mediaType: 'EPISODE' }
      render(<RuleList {...defaultProps} rules={[episodeRule]} />)

      expect(screen.getByText('Episode')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have data-testid attributes for testing', () => {
      render(<RuleList {...defaultProps} />)

      expect(screen.getByTestId('rule-row-rule-1')).toBeInTheDocument()
      expect(screen.getByTestId('toggle-rule-rule-1')).toBeInTheDocument()
      expect(screen.getByTestId('scan-rule-rule-1')).toBeInTheDocument()
      expect(screen.getByTestId('edit-rule-rule-1')).toBeInTheDocument()
      expect(screen.getByTestId('delete-rule-rule-1')).toBeInTheDocument()
    })

    it('should have title attributes on action buttons', () => {
      render(<RuleList {...defaultProps} />)

      expect(screen.getByTestId('scan-rule-rule-1')).toHaveAttribute('title', 'Run Scan')
      expect(screen.getByTestId('edit-rule-rule-1')).toHaveAttribute('title', 'Edit')
      expect(screen.getByTestId('delete-rule-rule-1')).toHaveAttribute('title', 'Delete')
    })
  })

  describe('Table Headers', () => {
    it('should display all table headers', () => {
      render(<RuleList {...defaultProps} />)

      expect(screen.getByText('Rule Name')).toBeInTheDocument()
      expect(screen.getByText('Media Type')).toBeInTheDocument()
      expect(screen.getByText('Action')).toBeInTheDocument()
      expect(screen.getByText('Status')).toBeInTheDocument()
      expect(screen.getByText('Scans')).toBeInTheDocument()
      expect(screen.getByText('Last Run')).toBeInTheDocument()
      expect(screen.getByText('Actions')).toBeInTheDocument()
    })
  })
})
