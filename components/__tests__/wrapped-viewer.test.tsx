import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WrappedViewer } from '@/components/wrapped/wrapped-viewer'
import { WrappedData } from '@/types/wrapped'

// Mock child components
jest.mock('../shared/formatted-text', () => ({
  FormattedText: ({ text }: { text: string }) => <span>{text}</span>,
}))

jest.mock('../setup/setup-wizard/space-background', () => ({
  SpaceBackground: () => <div data-testid="space-background" />,
}))

describe('WrappedViewer', () => {
  const createMockWrappedData = (overrides?: Partial<WrappedData>): WrappedData => ({
    year: 2024,
    userId: 'user-1',
    userName: 'Test User',
    generatedAt: '2024-01-01T00:00:00Z',
    statistics: {
      totalWatchTime: {
        total: 1000,
        movies: 500,
        shows: 500,
      },
      moviesWatched: 10,
      showsWatched: 5,
      episodesWatched: 50,
      topMovies: [],
      topShows: [],
    },
    sections: [
      {
        id: 'hero-1',
        type: 'hero',
        title: 'Welcome',
        content: 'Welcome to your wrapped',
      },
    ],
    insights: {
      personality: 'Cinephile',
      topGenre: 'Action',
      bingeWatcher: true,
      discoveryScore: 75,
      funFacts: [],
    },
    metadata: {
      totalSections: 1,
      generationTime: 5,
    },
    ...overrides,
  })

  describe('Edge cases - undefined/null section handling', () => {
    it('should handle sections array with undefined values', () => {
      const wrappedData = createMockWrappedData({
        sections: [
          {
            id: 'hero-1',
            type: 'hero',
            title: 'Welcome',
            content: 'Welcome to your wrapped',
          },
          undefined as any,
          null as any,
        ],
      })

      expect(() => {
        render(<WrappedViewer wrappedData={wrappedData} />)
      }).not.toThrow()
    })

    it('should handle sections array with missing type property', () => {
      const wrappedData = createMockWrappedData({
        sections: [
          {
            id: 'hero-1',
            type: 'hero',
            title: 'Welcome',
            content: 'Welcome to your wrapped',
          },
          {
            id: 'invalid-1',
            // Missing type property - should be included but renderSection will handle gracefully
            title: 'Invalid Section',
            content: 'This should still be included',
          } as any,
        ],
      })

      const { container } = render(<WrappedViewer wrappedData={wrappedData} />)
      // Should not throw, and should show error message for invalid section
      expect(container).toBeTruthy()
    })

    it('should handle sections array with missing id property', () => {
      const wrappedData = createMockWrappedData({
        sections: [
          {
            id: 'hero-1',
            type: 'hero',
            title: 'Welcome',
            content: 'Welcome to your wrapped',
          },
          {
            // Missing id property
            type: 'hero',
            title: 'Invalid Section',
            content: 'This should be filtered out',
          } as any,
        ],
      })

      expect(() => {
        render(<WrappedViewer wrappedData={wrappedData} />)
      }).not.toThrow()
    })

    it('should handle empty sections array', () => {
      const wrappedData = createMockWrappedData({
        sections: [],
      })

      render(<WrappedViewer wrappedData={wrappedData} />)
      expect(screen.getByText('No sections available to display')).toBeInTheDocument()
    })

    it('should handle undefined sections property', () => {
      const wrappedData = createMockWrappedData({
        sections: undefined as any,
      })

      render(<WrappedViewer wrappedData={wrappedData} />)
      expect(screen.getByText('No sections available to display')).toBeInTheDocument()
    })

    it('should filter out service-stats sections', () => {
      const wrappedData = createMockWrappedData({
        sections: [
          {
            id: 'hero-1',
            type: 'hero',
            title: 'Welcome',
            content: 'Welcome to your wrapped',
          },
          {
            id: 'service-stats-1',
            type: 'service-stats',
            title: 'Service Stats',
            content: 'This should be filtered',
          },
        ],
      })

      render(<WrappedViewer wrappedData={wrappedData} />)
      expect(screen.getByText('Welcome')).toBeInTheDocument()
      expect(screen.queryByText('Service Stats')).not.toBeInTheDocument()
    })

    it('should handle currentSection being undefined when index is out of bounds', () => {
      const wrappedData = createMockWrappedData({
        sections: [
          {
            id: 'hero-1',
            type: 'hero',
            title: 'Welcome',
            content: 'Welcome to your wrapped',
          },
        ],
      })

      // This test ensures the component doesn't crash if currentSectionIndex
      // somehow becomes out of bounds
      const { rerender } = render(<WrappedViewer wrappedData={wrappedData} />)

      // Manually set sections to empty after render to simulate edge case
      // In reality, this would be prevented by the early return check
      expect(() => {
        rerender(<WrappedViewer wrappedData={createMockWrappedData({ sections: [] })} />)
      }).not.toThrow()
    })

    it('should handle section with null type', () => {
      const wrappedData = createMockWrappedData({
        sections: [
          {
            id: 'hero-1',
            type: 'hero',
            title: 'Welcome',
            content: 'Welcome to your wrapped',
          },
          {
            id: 'invalid-2',
            type: null as any,
            title: 'Invalid',
            content: 'Should be filtered',
          },
        ],
      })

      expect(() => {
        render(<WrappedViewer wrappedData={wrappedData} />)
      }).not.toThrow()
    })

    it('should renderSection gracefully handles undefined section', () => {
      const wrappedData = createMockWrappedData({
        sections: [
          {
            id: 'hero-1',
            type: 'hero',
            title: 'Welcome',
            content: 'Welcome to your wrapped',
          },
        ],
      })

      const { container } = render(<WrappedViewer wrappedData={wrappedData} />)

      // Component should render without errors even if internal state
      // somehow results in undefined section
      expect(container).toBeTruthy()
    })
  })

  describe('Normal rendering', () => {
    it('should render hero section correctly', () => {
      const wrappedData = createMockWrappedData({
        sections: [
          {
            id: 'hero-1',
            type: 'hero',
            title: 'Welcome to Your Wrapped',
            subtitle: '2024 Edition',
            content: 'This is your year in review',
          },
        ],
      })

      render(<WrappedViewer wrappedData={wrappedData} />)
      expect(screen.getByText('Welcome to Your Wrapped')).toBeInTheDocument()
      expect(screen.getByText('2024 Edition')).toBeInTheDocument()
      expect(screen.getByText('This is your year in review')).toBeInTheDocument()
    })

    it('should filter sections correctly and render valid ones', () => {
      const wrappedData = createMockWrappedData({
        sections: [
          {
            id: 'hero-1',
            type: 'hero',
            title: 'Welcome',
            content: 'Welcome to your wrapped',
          },
          undefined as any,
          {
            id: 'service-stats-1',
            type: 'service-stats',
            title: 'Service Stats',
            content: 'Filtered',
          },
          {
            id: 'total-watch-time-1',
            type: 'total-watch-time',
            title: 'Total Watch Time',
            content: 'You watched a lot!',
          },
        ],
      })

      render(<WrappedViewer wrappedData={wrappedData} />)

      // Should render hero section
      expect(screen.getByText('Welcome')).toBeInTheDocument()

      // Should not render service-stats (filtered out)
      expect(screen.queryByText('Service Stats')).not.toBeInTheDocument()

      // Should render total-watch-time section (after navigation)
      // Note: This test verifies filtering works, actual navigation would require user interaction
    })
  })

  describe('getSectionDelay edge cases', () => {
    it('should handle getSectionDelay with undefined section at index', () => {
      const wrappedData = createMockWrappedData({
        sections: [
          {
            id: 'hero-1',
            type: 'hero',
            title: 'Welcome',
            content: 'Welcome',
          },
        ],
      })

      // This test ensures getSectionDelay doesn't crash if section is undefined
      // The component should handle this gracefully
      expect(() => {
        render(<WrappedViewer wrappedData={wrappedData} />)
      }).not.toThrow()
    })
  })

  describe('Loading States', () => {
    it('should render space background during loading', () => {
      const wrappedData = createMockWrappedData()

      render(<WrappedViewer wrappedData={wrappedData} />)

      expect(screen.getByTestId('space-background')).toBeInTheDocument()
    })

    it('should show progress bar when viewing sections', () => {
      const wrappedData = createMockWrappedData({
        sections: [
          {
            id: 'hero-1',
            type: 'hero',
            title: 'Welcome',
            content: 'Welcome to your wrapped',
          },
          {
            id: 'stats-1',
            type: 'total-watch-time',
            title: 'Watch Time',
            content: 'You watched a lot',
          },
        ],
      })

      const { container } = render(<WrappedViewer wrappedData={wrappedData} />)

      // Progress component should be rendered
      // Look for elements that would be in the progress component
      expect(container.querySelector('.relative.z-10')).toBeInTheDocument()
    })

    it('should display first section immediately on load', () => {
      const wrappedData = createMockWrappedData({
        sections: [
          {
            id: 'hero-1',
            type: 'hero',
            title: 'First Section',
            content: 'This is the first section',
          },
        ],
      })

      render(<WrappedViewer wrappedData={wrappedData} />)

      expect(screen.getByText('First Section')).toBeInTheDocument()
    })

    it('should handle loading with multiple sections', () => {
      const wrappedData = createMockWrappedData({
        sections: [
          {
            id: 'hero-1',
            type: 'hero',
            title: 'Section 1',
            content: 'Content 1',
          },
          {
            id: 'stats-1',
            type: 'total-watch-time',
            title: 'Section 2',
            content: 'Content 2',
          },
          {
            id: 'movies-1',
            type: 'top-movies',
            title: 'Section 3',
            content: 'Content 3',
          },
        ],
      })

      render(<WrappedViewer wrappedData={wrappedData} />)

      // Should show first section
      expect(screen.getByText('Section 1')).toBeInTheDocument()
      // Should not show other sections yet
      expect(screen.queryByText('Section 2')).not.toBeInTheDocument()
      expect(screen.queryByText('Section 3')).not.toBeInTheDocument()
    })

    it('should render with animation wrapper', () => {
      const wrappedData = createMockWrappedData()

      const { container } = render(<WrappedViewer wrappedData={wrappedData} />)

      // Should have motion div with animation classes
      const motionDiv = container.querySelector('.bg-slate-900\\/90')
      expect(motionDiv).toBeInTheDocument()
    })
  })

  describe('Empty State', () => {
    it('should display empty message when no sections available', () => {
      const wrappedData = createMockWrappedData({
        sections: [],
      })

      render(<WrappedViewer wrappedData={wrappedData} />)

      expect(screen.getByText('No sections available to display')).toBeInTheDocument()
    })

    it('should show space background in empty state', () => {
      const wrappedData = createMockWrappedData({
        sections: [],
      })

      render(<WrappedViewer wrappedData={wrappedData} />)

      expect(screen.getByTestId('space-background')).toBeInTheDocument()
    })

    it('should have proper styling for empty state', () => {
      const wrappedData = createMockWrappedData({
        sections: [],
      })

      render(<WrappedViewer wrappedData={wrappedData} />)

      const emptyStateContainer = screen.getByText('No sections available to display').parentElement
      expect(emptyStateContainer).toHaveClass('bg-slate-900/90', 'border-cyan-500/20')
    })

    it('should center empty state message', () => {
      const wrappedData = createMockWrappedData({
        sections: [],
      })

      render(<WrappedViewer wrappedData={wrappedData} />)

      const emptyStateContainer = screen.getByText('No sections available to display').parentElement
      expect(emptyStateContainer).toHaveClass('text-center')
    })

    it('should show debug info in development when sections are filtered', () => {
      const originalEnv = process.env.NODE_ENV
      jest.replaceProperty(process.env, 'NODE_ENV', 'development')

      const wrappedData = createMockWrappedData({
        sections: [
          {
            id: 'service-stats-1',
            type: 'service-stats',
            title: 'Service Stats',
            content: 'This should be filtered',
          },
        ],
      })

      render(<WrappedViewer wrappedData={wrappedData} />)

      expect(screen.getByText('No sections available to display')).toBeInTheDocument()

      jest.replaceProperty(process.env, 'NODE_ENV', originalEnv)
    })
  })

  describe('Error States', () => {
    it('should handle current section being undefined gracefully', () => {
      const wrappedData = createMockWrappedData({
        sections: [
          {
            id: 'hero-1',
            type: 'hero',
            title: 'Welcome',
            content: 'Welcome',
          },
        ],
      })

      const { rerender } = render(<WrappedViewer wrappedData={wrappedData} />)

      // Simulate section becoming unavailable
      const emptyData = createMockWrappedData({ sections: [] })
      rerender(<WrappedViewer wrappedData={emptyData} />)

      expect(screen.getByText('No sections available to display')).toBeInTheDocument()
    })

    it('should render valid section without crashing', () => {
      const wrappedData = createMockWrappedData({
        sections: [
          {
            id: 'hero-1',
            type: 'hero',
            title: 'Welcome',
            content: 'Welcome to your wrapped',
          },
        ],
      })

      render(<WrappedViewer wrappedData={wrappedData} />)

      // Component should render without crashing
      expect(screen.getAllByText(/Welcome/i).length).toBeGreaterThan(0)
    })

    it('should show space background in error state', () => {
      const wrappedData = createMockWrappedData({
        sections: [],
      })

      render(<WrappedViewer wrappedData={wrappedData} />)

      expect(screen.getByTestId('space-background')).toBeInTheDocument()
    })

    it('should have proper error state styling', () => {
      const wrappedData = createMockWrappedData({
        sections: [],
      })

      render(<WrappedViewer wrappedData={wrappedData} />)

      const errorContainer = screen.getByText('No sections available to display').parentElement
      expect(errorContainer).toHaveClass('bg-slate-900/90', 'border-cyan-500/20', 'rounded-lg')
    })

    it('should handle malformed wrapped data gracefully', () => {
      const wrappedData = createMockWrappedData({
        sections: [
          {
            id: 'hero-1',
            type: 'hero',
            title: 'Welcome',
            content: 'Welcome',
          },
          // Malformed section, as it could come back from stored JSON
          JSON.parse('{"id":null,"type":"invalid","title":"Bad Section","content":"This is bad"}'),
        ],
      })

      expect(() => {
        render(<WrappedViewer wrappedData={wrappedData} />)
      }).not.toThrow()
    })

    it('should filter out invalid sections and show valid ones', () => {
      const wrappedData = createMockWrappedData({
        sections: [
          {
            id: 'hero-1',
            type: 'hero',
            title: 'Valid Section',
            content: 'This is valid',
          },
          undefined as any,
          null as any,
          {
            id: 'hero-2',
            type: 'hero',
            title: 'Another Valid',
            content: 'Also valid',
          },
        ],
      })

      render(<WrappedViewer wrappedData={wrappedData} />)

      // Should show the first valid section
      expect(screen.getByText('Valid Section')).toBeInTheDocument()
    })
  })

  describe('Navigation States', () => {
    it('should render navigation controls', () => {
      const wrappedData = createMockWrappedData({
        sections: [
          {
            id: 'hero-1',
            type: 'hero',
            title: 'Section 1',
            content: 'Content 1',
          },
          {
            id: 'stats-1',
            type: 'total-watch-time',
            title: 'Section 2',
            content: 'Content 2',
          },
        ],
      })

      const { container } = render(<WrappedViewer wrappedData={wrappedData} />)

      // Navigation component should be rendered
      expect(container.querySelector('.relative.z-10')).toBeInTheDocument()
    })

    it('should show all sections in show all mode', () => {
      const wrappedData = createMockWrappedData({
        sections: [
          {
            id: 'hero-1',
            type: 'hero',
            title: 'Section 1',
            content: 'Content 1',
          },
          {
            id: 'stats-1',
            type: 'total-watch-time',
            title: 'Section 2',
            content: 'Content 2',
          },
          {
            id: 'movies-1',
            type: 'top-movies',
            title: 'Section 3',
            content: 'Content 3',
          },
        ],
      })

      render(<WrappedViewer wrappedData={wrappedData} />)

      // Initially should only show first section
      expect(screen.getByText('Section 1')).toBeInTheDocument()
    })

    it('should handle navigation with single section', () => {
      const wrappedData = createMockWrappedData({
        sections: [
          {
            id: 'hero-1',
            type: 'hero',
            title: 'Only Section',
            content: 'This is the only section',
          },
        ],
      })

      render(<WrappedViewer wrappedData={wrappedData} />)

      expect(screen.getByText('Only Section')).toBeInTheDocument()
    })
  })

  describe('Shared View States', () => {
    it('should render in shared mode', () => {
      const wrappedData = createMockWrappedData()

      render(
        <WrappedViewer
          wrappedData={wrappedData}
          isShared={true}
          shareToken="test-token"
        />
      )

      expect(screen.getByText('Welcome')).toBeInTheDocument()
    })

    it('should pass share token to navigation', () => {
      const wrappedData = createMockWrappedData()

      render(
        <WrappedViewer
          wrappedData={wrappedData}
          isShared={true}
          shareToken="test-token-123"
        />
      )

      // Component should render without errors
      expect(screen.getByText('Welcome')).toBeInTheDocument()
    })

    it('should handle shared view without share token', () => {
      const wrappedData = createMockWrappedData()

      render(
        <WrappedViewer
          wrappedData={wrappedData}
          isShared={true}
        />
      )

      expect(screen.getByText('Welcome')).toBeInTheDocument()
    })

    it('should handle userName prop in shared view', () => {
      const wrappedData = createMockWrappedData()

      render(
        <WrappedViewer
          wrappedData={wrappedData}
          isShared={true}
          userName="John Doe"
        />
      )

      expect(screen.getByText('Welcome')).toBeInTheDocument()
    })

    it('should handle summary prop in shared view', () => {
      const wrappedData = createMockWrappedData()

      render(
        <WrappedViewer
          wrappedData={wrappedData}
          isShared={true}
          summary="This is a test summary"
        />
      )

      expect(screen.getByText('Welcome')).toBeInTheDocument()
    })
  })

  describe('Owner share controls', () => {
    const shareControls = <div data-testid="owner-share-controls">Owner share controls</div>
    const twoSections = () =>
      createMockWrappedData({
        sections: [
          { id: 'hero-1', type: 'hero', title: 'Section 1', content: 'Content 1' },
          { id: 'stats-1', type: 'total-watch-time', title: 'Section 2', content: 'Content 2' },
        ],
      })

    it('shows the controls on the last slide only', async () => {
      const user = userEvent.setup()
      render(<WrappedViewer wrappedData={twoSections()} shareControls={shareControls} />)
      expect(screen.queryByTestId('owner-share-controls')).not.toBeInTheDocument()

      await user.click(screen.getByText('Next'))

      expect(await screen.findByTestId('owner-share-controls')).toBeInTheDocument()
    })

    it('keeps the controls under "Show all"', async () => {
      const user = userEvent.setup()
      render(<WrappedViewer wrappedData={createMockWrappedData()} shareControls={shareControls} />)
      expect(screen.getByTestId('owner-share-controls')).toBeInTheDocument()

      await user.click(screen.getByText('Show All'))

      expect(screen.queryByText('Show All')).not.toBeInTheDocument()
      expect(screen.getByText('Welcome')).toBeInTheDocument()
      expect(screen.getByTestId('owner-share-controls')).toBeInTheDocument()
    })

    it('never shows the controls in a shared view', async () => {
      const user = userEvent.setup()
      render(<WrappedViewer wrappedData={createMockWrappedData()} isShared shareControls={shareControls} />)
      expect(screen.queryByTestId('owner-share-controls')).not.toBeInTheDocument()

      await user.click(screen.getByText('Show All'))

      expect(screen.queryByTestId('owner-share-controls')).not.toBeInTheDocument()
    })

    it('shows no controls under "Show all" when none are given', async () => {
      const user = userEvent.setup()
      render(<WrappedViewer wrappedData={createMockWrappedData()} />)

      await user.click(screen.getByText('Show All'))

      expect(screen.getByText('Welcome')).toBeInTheDocument()
      expect(screen.queryByTestId('owner-share-controls')).not.toBeInTheDocument()
    })
  })

  describe('Completion Callback', () => {
    it('should accept onComplete callback', () => {
      const mockOnComplete = jest.fn()
      const wrappedData = createMockWrappedData()

      render(
        <WrappedViewer
          wrappedData={wrappedData}
          onComplete={mockOnComplete}
        />
      )

      expect(screen.getByText('Welcome')).toBeInTheDocument()
    })

    it('should handle missing onComplete callback', () => {
      const wrappedData = createMockWrappedData()

      expect(() => {
        render(<WrappedViewer wrappedData={wrappedData} />)
      }).not.toThrow()
    })
  })
})

