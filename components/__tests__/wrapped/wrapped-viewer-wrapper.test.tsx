import { render, screen, waitFor, act } from '@testing-library/react'
import { WrappedViewerWrapper } from '@/components/wrapped/wrapped-viewer-wrapper'
import { WrappedData } from '@/types/wrapped'

// Mock motion
jest.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

// Mock WrappedTransition
jest.mock('@/components/wrapped/wrapped-transition', () => ({
  WrappedTransition: ({ year, onComplete }: { year: number; onComplete: () => void }) => (
    <div data-testid="wrapped-transition">
      <div>Transition for {year}</div>
      <button onClick={onComplete}>Complete Transition</button>
    </div>
  ),
}))

// Mock WrappedViewer
jest.mock('@/components/wrapped/wrapped-viewer', () => ({
  WrappedViewer: ({
    wrappedData,
    isShared,
    userName,
    summary,
    shareToken,
  }: {
    wrappedData: WrappedData
    isShared?: boolean
    userName?: string
    summary?: string
    shareToken?: string
  }) => (
    <div data-testid="wrapped-viewer">
      <div>Wrapped Viewer</div>
      <div>Year: {wrappedData.year}</div>
      <div>User: {userName || wrappedData.userName}</div>
      {isShared && <div>Shared View</div>}
      {summary && <div>Summary: {summary}</div>}
      {shareToken && <div>Token: {shareToken}</div>}
    </div>
  ),
}))

const createMockWrappedData = (): WrappedData => ({
  year: 2024,
  userId: 'user-1',
  userName: 'Test User',
  generatedAt: '2024-01-15T00:00:00Z',
  statistics: {
    totalWatchTime: {
      total: 5000,
      movies: 3000,
      shows: 2000,
    },
    moviesWatched: 50,
    showsWatched: 20,
    episodesWatched: 200,
    topMovies: [],
    topShows: [],
  },
  sections: [],
  insights: {
    personality: 'Cinephile',
    topGenre: 'Action',
    bingeWatcher: true,
    discoveryScore: 85,
    funFacts: [],
  },
  metadata: {
    totalSections: 5,
    generationTime: 30,
  },
})

describe('WrappedViewerWrapper', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  it('should show transition by default for non-shared wrapped', () => {
    const wrappedData = createMockWrappedData()
    render(<WrappedViewerWrapper wrappedData={wrappedData} year={2024} />)

    expect(screen.getByTestId('wrapped-transition')).toBeInTheDocument()
    expect(screen.getByText('Transition for 2024')).toBeInTheDocument()
  })

  it('should skip transition for shared wrapped', () => {
    const wrappedData = createMockWrappedData()
    render(<WrappedViewerWrapper wrappedData={wrappedData} year={2024} isShared />)

    expect(screen.queryByTestId('wrapped-transition')).not.toBeInTheDocument()
    expect(screen.getByTestId('wrapped-viewer')).toBeInTheDocument()
  })

  it('should show wrapped viewer after transition completes', async () => {
    const wrappedData = createMockWrappedData()
    render(<WrappedViewerWrapper wrappedData={wrappedData} year={2024} />)

    // Initially shows transition
    expect(screen.getByTestId('wrapped-transition')).toBeInTheDocument()
    expect(screen.queryByTestId('wrapped-viewer')).not.toBeInTheDocument()

    // Complete transition
    const completeButton = screen.getByText('Complete Transition')
    act(() => {
      completeButton.click()
    })

    await waitFor(() => {
      expect(screen.queryByTestId('wrapped-transition')).not.toBeInTheDocument()
      expect(screen.getByTestId('wrapped-viewer')).toBeInTheDocument()
    })
  })

  it('should pass wrappedData to WrappedViewer', () => {
    const wrappedData = createMockWrappedData()
    render(<WrappedViewerWrapper wrappedData={wrappedData} year={2024} isShared />)

    expect(screen.getByText('Year: 2024')).toBeInTheDocument()
    expect(screen.getByText('User: Test User')).toBeInTheDocument()
  })

  it('should pass isShared prop to WrappedViewer', () => {
    const wrappedData = createMockWrappedData()
    render(<WrappedViewerWrapper wrappedData={wrappedData} year={2024} isShared />)

    expect(screen.getByText('Shared View')).toBeInTheDocument()
  })

  it('should pass userName prop to WrappedViewer', () => {
    const wrappedData = createMockWrappedData()
    render(
      <WrappedViewerWrapper
        wrappedData={wrappedData}
        year={2024}
        isShared
        userName="Custom Name"
      />
    )

    expect(screen.getByText('User: Custom Name')).toBeInTheDocument()
  })

  it('should pass summary prop to WrappedViewer', () => {
    const wrappedData = createMockWrappedData()
    const summary = 'This year was amazing!'
    render(
      <WrappedViewerWrapper
        wrappedData={wrappedData}
        year={2024}
        isShared
        summary={summary}
      />
    )

    expect(screen.getByText(`Summary: ${summary}`)).toBeInTheDocument()
  })

  it('should pass shareToken prop to WrappedViewer', () => {
    const wrappedData = createMockWrappedData()
    render(
      <WrappedViewerWrapper
        wrappedData={wrappedData}
        year={2024}
        isShared
        shareToken="abc123"
      />
    )

    expect(screen.getByText('Token: abc123')).toBeInTheDocument()
  })

  it('should handle transition completion callback', async () => {
    const wrappedData = createMockWrappedData()
    render(<WrappedViewerWrapper wrappedData={wrappedData} year={2024} />)

    expect(screen.getByTestId('wrapped-transition')).toBeInTheDocument()

    // Trigger transition completion
    const completeButton = screen.getByText('Complete Transition')
    act(() => {
      completeButton.click()
    })

    await waitFor(() => {
      expect(screen.getByTestId('wrapped-viewer')).toBeInTheDocument()
    })
  })

  it('should use correct year for transition', () => {
    const wrappedData = createMockWrappedData()
    render(<WrappedViewerWrapper wrappedData={wrappedData} year={2023} />)

    expect(screen.getByText('Transition for 2023')).toBeInTheDocument()
  })

  it('should maintain state when transitioning', async () => {
    const wrappedData = createMockWrappedData()
    render(<WrappedViewerWrapper wrappedData={wrappedData} year={2024} />)

    // Complete transition
    const completeButton = screen.getByText('Complete Transition')
    act(() => {
      completeButton.click()
    })

    await waitFor(() => {
      // Data should be preserved
      expect(screen.getByText('Year: 2024')).toBeInTheDocument()
      expect(screen.getByText('User: Test User')).toBeInTheDocument()
    })
  })

  it('should not show transition when isShared is true', () => {
    const wrappedData = createMockWrappedData()
    render(<WrappedViewerWrapper wrappedData={wrappedData} year={2024} isShared />)

    expect(screen.queryByTestId('wrapped-transition')).not.toBeInTheDocument()
    expect(screen.getByTestId('wrapped-viewer')).toBeInTheDocument()
  })

  it('should handle multiple prop combinations', () => {
    const wrappedData = createMockWrappedData()
    render(
      <WrappedViewerWrapper
        wrappedData={wrappedData}
        year={2024}
        isShared
        userName="John Doe"
        summary="Great year!"
        shareToken="token123"
      />
    )

    expect(screen.getByText('User: John Doe')).toBeInTheDocument()
    expect(screen.getByText('Summary: Great year!')).toBeInTheDocument()
    expect(screen.getByText('Token: token123')).toBeInTheDocument()
    expect(screen.getByText('Shared View')).toBeInTheDocument()
  })

  it('should render with minimal props', () => {
    const wrappedData = createMockWrappedData()
    render(<WrappedViewerWrapper wrappedData={wrappedData} year={2024} />)

    expect(screen.getByTestId('wrapped-transition')).toBeInTheDocument()
  })

  it('should handle transition state change correctly', async () => {
    const wrappedData = createMockWrappedData()
    const { rerender } = render(<WrappedViewerWrapper wrappedData={wrappedData} year={2024} />)

    expect(screen.getByTestId('wrapped-transition')).toBeInTheDocument()

    // Complete transition
    const completeButton = screen.getByText('Complete Transition')
    act(() => {
      completeButton.click()
    })

    await waitFor(() => {
      expect(screen.getByTestId('wrapped-viewer')).toBeInTheDocument()
    })

    // Rerender should maintain viewer state
    rerender(<WrappedViewerWrapper wrappedData={wrappedData} year={2024} />)

    expect(screen.getByTestId('wrapped-viewer')).toBeInTheDocument()
    expect(screen.queryByTestId('wrapped-transition')).not.toBeInTheDocument()
  })

  it('should pass all props through to WrappedViewer after transition', async () => {
    const wrappedData = createMockWrappedData()
    render(
      <WrappedViewerWrapper
        wrappedData={wrappedData}
        year={2024}
        userName="Test"
        summary="Summary"
        shareToken="token"
      />
    )

    // Complete transition
    const completeButton = screen.getByText('Complete Transition')
    act(() => {
      completeButton.click()
    })

    await waitFor(() => {
      expect(screen.getByText('User: Test')).toBeInTheDocument()
      expect(screen.getByText('Summary: Summary')).toBeInTheDocument()
      expect(screen.getByText('Token: token')).toBeInTheDocument()
    })
  })
})

