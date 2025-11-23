import { WrappedShareSummary } from '@/components/wrapped/wrapped-share-summary'
import { WrappedData } from '@/types/wrapped'
import { render, screen } from '@testing-library/react'

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}))

// Mock FormattedText
jest.mock('@/components/shared/formatted-text', () => ({
  FormattedText: ({ text }: { text: string }) => <div>{text}</div>,
}))

// Mock SpaceBackground
jest.mock('@/components/setup/setup-wizard/space-background', () => ({
  SpaceBackground: () => <div data-testid="space-background">Space Background</div>,
}))

// Mock next/link
jest.mock('next/link', () => {
  const MockLink = ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  )
  MockLink.displayName = 'Link'
  return MockLink
})

const createMockWrappedData = (overrides?: Partial<WrappedData>): WrappedData => ({
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
    topMovies: [
      { title: 'Inception', watchTime: 148, playCount: 2, year: 2010 },
      { title: 'The Matrix', watchTime: 136, playCount: 1, year: 1999 },
    ],
    topShows: [
      { title: 'Breaking Bad', watchTime: 500, playCount: 10, episodesWatched: 10, year: 2008 },
      { title: 'The Office', watchTime: 400, playCount: 20, episodesWatched: 20, year: 2005 },
    ],
    watchTimeByMonth: [
      { month: 1, monthName: 'January', watchTime: 500 },
      { month: 2, monthName: 'February', watchTime: 800 },
    ],
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
  ...overrides,
})

describe('WrappedShareSummary', () => {
  it('should render space background', () => {
    const wrappedData = createMockWrappedData()
    render(<WrappedShareSummary wrappedData={wrappedData} year={2024} />)

    expect(screen.getByTestId('space-background')).toBeInTheDocument()
  })

  it('should display user name and year in header', () => {
    const wrappedData = createMockWrappedData()
    render(<WrappedShareSummary wrappedData={wrappedData} year={2024} />)

    expect(screen.getByText("Test User's 2024 Plex Wrapped")).toBeInTheDocument()
  })

  it('should use userName prop over wrappedData.userName', () => {
    const wrappedData = createMockWrappedData()
    render(<WrappedShareSummary wrappedData={wrappedData} userName="Custom Name" year={2024} />)

    expect(screen.getByText("Custom Name's 2024 Plex Wrapped")).toBeInTheDocument()
  })

  it('should fallback to "User" when no name provided', () => {
    const wrappedData = createMockWrappedData({ userName: '' })
    render(<WrappedShareSummary wrappedData={wrappedData} year={2024} />)

    expect(screen.getByText("User's 2024 Plex Wrapped")).toBeInTheDocument()
  })

  it('should display summary when provided', () => {
    const wrappedData = createMockWrappedData()
    const summary = 'This year was amazing!'
    render(<WrappedShareSummary wrappedData={wrappedData} summary={summary} year={2024} />)

    expect(screen.getByText(summary)).toBeInTheDocument()
  })

  it('should display total watch time statistic', () => {
    const wrappedData = createMockWrappedData()
    render(<WrappedShareSummary wrappedData={wrappedData} year={2024} />)

    expect(screen.getByText('Total Watch Time')).toBeInTheDocument()
    expect(screen.getByText(/3 days/)).toBeInTheDocument()
  })

  it('should display movies watched count', () => {
    const wrappedData = createMockWrappedData()
    render(<WrappedShareSummary wrappedData={wrappedData} year={2024} />)

    expect(screen.getByText('Movies Watched')).toBeInTheDocument()
    expect(screen.getByText('50')).toBeInTheDocument()
  })

  it('should display shows watched count', () => {
    const wrappedData = createMockWrappedData()
    render(<WrappedShareSummary wrappedData={wrappedData} year={2024} />)

    expect(screen.getByText('Shows Watched')).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
  })

  it('should display top 5 movies', () => {
    const wrappedData = createMockWrappedData({
      statistics: {
        ...createMockWrappedData().statistics,
        topMovies: [
          { title: 'Movie 1', watchTime: 120, playCount: 1 },
          { title: 'Movie 2', watchTime: 110, playCount: 1 },
          { title: 'Movie 3', watchTime: 100, playCount: 1 },
          { title: 'Movie 4', watchTime: 90, playCount: 1 },
          { title: 'Movie 5', watchTime: 80, playCount: 1 },
          { title: 'Movie 6', watchTime: 70, playCount: 1 }, // Should not be displayed
        ],
      },
    })
    render(<WrappedShareSummary wrappedData={wrappedData} year={2024} />)

    expect(screen.getByText('Top Movies')).toBeInTheDocument()
    expect(screen.getByText('Movie 1')).toBeInTheDocument()
    expect(screen.getByText('Movie 5')).toBeInTheDocument()
    expect(screen.queryByText('Movie 6')).not.toBeInTheDocument()
  })

  it('should display top 5 shows', () => {
    const wrappedData = createMockWrappedData({
      statistics: {
        ...createMockWrappedData().statistics,
        topShows: [
          { title: 'Show 1', watchTime: 500, playCount: 10, episodesWatched: 10 },
          { title: 'Show 2', watchTime: 400, playCount: 9, episodesWatched: 9 },
          { title: 'Show 3', watchTime: 300, playCount: 8, episodesWatched: 8 },
          { title: 'Show 4', watchTime: 200, playCount: 7, episodesWatched: 7 },
          { title: 'Show 5', watchTime: 100, playCount: 6, episodesWatched: 6 },
          { title: 'Show 6', watchTime: 50, playCount: 5, episodesWatched: 5 }, // Should not be displayed
        ],
      },
    })
    render(<WrappedShareSummary wrappedData={wrappedData} year={2024} />)

    expect(screen.getByText('Top Shows')).toBeInTheDocument()
    expect(screen.getByText('Show 1')).toBeInTheDocument()
    expect(screen.getByText('Show 5')).toBeInTheDocument()
    expect(screen.queryByText('Show 6')).not.toBeInTheDocument()
  })

  it('should display movie with year', () => {
    const wrappedData = createMockWrappedData()
    render(<WrappedShareSummary wrappedData={wrappedData} year={2024} />)

    expect(screen.getByText('Inception')).toBeInTheDocument()
    expect(screen.getByText('(2010)')).toBeInTheDocument()
  })

  it('should display show with year', () => {
    const wrappedData = createMockWrappedData()
    render(<WrappedShareSummary wrappedData={wrappedData} year={2024} />)

    expect(screen.getByText('Breaking Bad')).toBeInTheDocument()
    expect(screen.getByText('(2008)')).toBeInTheDocument()
  })

  it('should display movie watch time and play count', () => {
    const wrappedData = createMockWrappedData()
    render(<WrappedShareSummary wrappedData={wrappedData} year={2024} />)

    expect(screen.getByText(/2 hours, 28 minutes • 2 plays/)).toBeInTheDocument()
  })

  it('should display show watch time and episodes', () => {
    const wrappedData = createMockWrappedData()
    render(<WrappedShareSummary wrappedData={wrappedData} year={2024} />)

    expect(screen.getByText(/8 hours, 20 minutes • 10 episodes/)).toBeInTheDocument()
  })

  it('should display episodes watched statistic', () => {
    const wrappedData = createMockWrappedData()
    render(<WrappedShareSummary wrappedData={wrappedData} year={2024} />)

    expect(screen.getByText('Episodes Watched')).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()
  })

  it('should display most active month', () => {
    const wrappedData = createMockWrappedData()
    render(<WrappedShareSummary wrappedData={wrappedData} year={2024} />)

    expect(screen.getByText('Most Active Month')).toBeInTheDocument()
    expect(screen.getByText('February')).toBeInTheDocument()
  })

  it('should not display episodes watched when zero', () => {
    const wrappedData = createMockWrappedData({
      statistics: {
        ...createMockWrappedData().statistics,
        episodesWatched: 0,
      },
    })
    render(<WrappedShareSummary wrappedData={wrappedData} year={2024} />)

    expect(screen.queryByText('Episodes Watched')).not.toBeInTheDocument()
  })

  it('should not display most active month when no data', () => {
    const wrappedData = createMockWrappedData({
      statistics: {
        ...createMockWrappedData().statistics,
        watchTimeByMonth: undefined,
      },
    })
    render(<WrappedShareSummary wrappedData={wrappedData} year={2024} />)

    expect(screen.queryByText('Most Active Month')).not.toBeInTheDocument()
  })

  it('should not display top movies section when empty', () => {
    const wrappedData = createMockWrappedData({
      statistics: {
        ...createMockWrappedData().statistics,
        topMovies: [],
      },
    })
    render(<WrappedShareSummary wrappedData={wrappedData} year={2024} />)

    expect(screen.queryByText('Top Movies')).not.toBeInTheDocument()
  })

  it('should not display top shows section when empty', () => {
    const wrappedData = createMockWrappedData({
      statistics: {
        ...createMockWrappedData().statistics,
        topShows: [],
      },
    })
    render(<WrappedShareSummary wrappedData={wrappedData} year={2024} />)

    expect(screen.queryByText('Top Shows')).not.toBeInTheDocument()
  })

  it('should display call to action link', () => {
    const wrappedData = createMockWrappedData()
    render(<WrappedShareSummary wrappedData={wrappedData} year={2024} />)

    const link = screen.getByText('Create Your Own Plex Wrapped')
    expect(link).toBeInTheDocument()
    expect(link.closest('a')).toHaveAttribute('href', '/')
  })

  it('should format large numbers with locale formatting', () => {
    const wrappedData = createMockWrappedData({
      statistics: {
        ...createMockWrappedData().statistics,
        moviesWatched: 1500,
      },
    })
    render(<WrappedShareSummary wrappedData={wrappedData} year={2024} />)

    expect(screen.getByText('1,500')).toBeInTheDocument()
  })

  it('should format watch time in hours when less than a day', () => {
    const wrappedData = createMockWrappedData({
      statistics: {
        ...createMockWrappedData().statistics,
        totalWatchTime: {
          total: 300, // 5 hours
          movies: 200,
          shows: 100,
        },
      },
    })
    render(<WrappedShareSummary wrappedData={wrappedData} year={2024} />)

    expect(screen.getByText('5 hours')).toBeInTheDocument()
  })

  it('should format watch time in days when more than 24 hours', () => {
    const wrappedData = createMockWrappedData({
      statistics: {
        ...createMockWrappedData().statistics,
        totalWatchTime: {
          total: 2880, // 2 days
          movies: 1440,
          shows: 1440,
        },
      },
    })
    render(<WrappedShareSummary wrappedData={wrappedData} year={2024} />)

    expect(screen.getByText('2 days')).toBeInTheDocument()
  })

  it('should use singular form for 1 play', () => {
    const wrappedData = createMockWrappedData({
      statistics: {
        ...createMockWrappedData().statistics,
        topMovies: [{ title: 'Movie', watchTime: 120, playCount: 1 }],
      },
    })
    render(<WrappedShareSummary wrappedData={wrappedData} year={2024} />)

    expect(screen.getByText(/1 play$/)).toBeInTheDocument()
  })

  it('should use singular form for 1 episode', () => {
    const wrappedData = createMockWrappedData({
      statistics: {
        ...createMockWrappedData().statistics,
        topShows: [{ title: 'Show', watchTime: 30, playCount: 1, episodesWatched: 1 }],
      },
    })
    render(<WrappedShareSummary wrappedData={wrappedData} year={2024} />)

    expect(screen.getByText(/1 episode$/)).toBeInTheDocument()
  })
})

