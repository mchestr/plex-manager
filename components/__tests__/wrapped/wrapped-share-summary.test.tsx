import { WrappedShareSummary } from '@/components/wrapped/wrapped-share-summary'
import type { ShareSafeRewindV2 } from '@/lib/wrapped/data/share-safe-v2'
import { render, screen } from '@testing-library/react'

// Mock motion
jest.mock('motion/react', () => ({
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

const createMockRewind = (overrides?: Partial<ShareSafeRewindV2>): ShareSafeRewindV2 => ({
  year: 2024,
  ownerName: 'Test User',
  summary: null,
  archetypeName: null,
  totals: { minutes: 5000, movies: 50, shows: 20, episodes: 200 },
  months: [
    { month: 1, minutes: 500 },
    { month: 2, minutes: 800 },
  ],
  topMovies: [
    { title: 'Inception', minutes: 148, plays: 2, year: 2010 },
    { title: 'The Matrix', minutes: 136, plays: 1, year: 1999 },
  ],
  topShows: [
    { title: 'Breaking Bad', minutes: 500, plays: 10, episodes: 10, year: 2008 },
    { title: 'The Office', minutes: 400, plays: 20, episodes: 20, year: 2005 },
  ],
  ...overrides,
})

describe('WrappedShareSummary', () => {
  it('marks its root with the wrapped-share-summary test ID', () => {
    const { container } = render(<WrappedShareSummary rewind={createMockRewind()} />)

    expect(container.firstElementChild).toBe(screen.getByTestId('wrapped-share-summary'))
  })

  it('should render space background', () => {
    render(<WrappedShareSummary rewind={createMockRewind()} />)

    expect(screen.getByTestId('space-background')).toBeInTheDocument()
  })

  it('should display the owner name and year in header', () => {
    render(<WrappedShareSummary rewind={createMockRewind()} />)

    expect(screen.getByTestId('wrapped-share-heading')).toHaveTextContent("Test User's 2024 Plex Wrapped")
  })

  it('should display summary when provided', () => {
    const summary = 'This year was amazing!'
    render(<WrappedShareSummary rewind={createMockRewind({ summary })} />)

    expect(screen.getByText(summary)).toBeInTheDocument()
  })

  it('should display total watch time statistic', () => {
    render(<WrappedShareSummary rewind={createMockRewind()} />)

    expect(screen.getByText('Total Watch Time')).toBeInTheDocument()
    expect(screen.getByText(/3 days/)).toBeInTheDocument()
  })

  it('should display movies watched count', () => {
    render(<WrappedShareSummary rewind={createMockRewind()} />)

    expect(screen.getByText('Movies Watched')).toBeInTheDocument()
    expect(screen.getByText('50')).toBeInTheDocument()
  })

  it('should display shows watched count', () => {
    render(<WrappedShareSummary rewind={createMockRewind()} />)

    expect(screen.getByText('Shows Watched')).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
  })

  it('should display the top movies', () => {
    render(<WrappedShareSummary rewind={createMockRewind()} />)

    expect(screen.getByText('Top Movies')).toBeInTheDocument()
    expect(screen.getByText('Inception')).toBeInTheDocument()
    expect(screen.getByText('The Matrix')).toBeInTheDocument()
  })

  it('should display the top shows', () => {
    render(<WrappedShareSummary rewind={createMockRewind()} />)

    expect(screen.getByText('Top Shows')).toBeInTheDocument()
    expect(screen.getByText('Breaking Bad')).toBeInTheDocument()
    expect(screen.getByText('The Office')).toBeInTheDocument()
  })

  it('should display movie with year', () => {
    render(<WrappedShareSummary rewind={createMockRewind()} />)

    expect(screen.getByText('Inception')).toBeInTheDocument()
    expect(screen.getByText('(2010)')).toBeInTheDocument()
  })

  it('should display show with year', () => {
    render(<WrappedShareSummary rewind={createMockRewind()} />)

    expect(screen.getByText('Breaking Bad')).toBeInTheDocument()
    expect(screen.getByText('(2008)')).toBeInTheDocument()
  })

  it('should display movie watch time and play count', () => {
    render(<WrappedShareSummary rewind={createMockRewind()} />)

    expect(screen.getByText(/2 hours, 28 minutes • 2 plays/)).toBeInTheDocument()
  })

  it('should display show watch time and episodes', () => {
    render(<WrappedShareSummary rewind={createMockRewind()} />)

    expect(screen.getByText(/8 hours, 20 minutes • 10 episodes/)).toBeInTheDocument()
  })

  it('should display episodes watched statistic', () => {
    render(<WrappedShareSummary rewind={createMockRewind()} />)

    expect(screen.getByText('Episodes Watched')).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()
  })

  it('should display the busiest month by name', () => {
    render(<WrappedShareSummary rewind={createMockRewind()} />)

    expect(screen.getByText('Most Active Month')).toBeInTheDocument()
    expect(screen.getByText('February')).toBeInTheDocument()
  })

  it('should keep the earlier month on a tie', () => {
    render(
      <WrappedShareSummary
        rewind={createMockRewind({ months: [{ month: 12, minutes: 800 }, { month: 2, minutes: 800 }] })}
      />
    )

    expect(screen.getByText('December')).toBeInTheDocument()
  })

  it('should not display episodes watched when zero', () => {
    render(
      <WrappedShareSummary rewind={createMockRewind({ totals: { minutes: 5000, movies: 50, shows: 20, episodes: 0 } })} />
    )

    expect(screen.queryByText('Episodes Watched')).not.toBeInTheDocument()
  })

  it('should not display most active month when no data', () => {
    render(<WrappedShareSummary rewind={createMockRewind({ months: [] })} />)

    expect(screen.queryByText('Most Active Month')).not.toBeInTheDocument()
  })

  it('should not display top movies section when empty', () => {
    render(<WrappedShareSummary rewind={createMockRewind({ topMovies: [] })} />)

    expect(screen.queryByText('Top Movies')).not.toBeInTheDocument()
  })

  it('should not display top shows section when empty', () => {
    render(<WrappedShareSummary rewind={createMockRewind({ topShows: [] })} />)

    expect(screen.queryByText('Top Shows')).not.toBeInTheDocument()
  })

  it('should display call to action link', () => {
    render(<WrappedShareSummary rewind={createMockRewind()} />)

    const link = screen.getByText('Create Your Own Plex Wrapped')
    expect(link).toBeInTheDocument()
    expect(link.closest('a')).toHaveAttribute('href', '/')
  })

  it('should format large numbers with locale formatting', () => {
    render(
      <WrappedShareSummary rewind={createMockRewind({ totals: { minutes: 5000, movies: 1500, shows: 20, episodes: 200 } })} />
    )

    expect(screen.getByText('1,500')).toBeInTheDocument()
  })

  it('should format watch time in hours when less than a day', () => {
    render(
      <WrappedShareSummary rewind={createMockRewind({ totals: { minutes: 300, movies: 50, shows: 20, episodes: 200 } })} />
    )

    expect(screen.getByText('5 hours')).toBeInTheDocument()
  })

  it('should format watch time in days when more than 24 hours', () => {
    render(
      <WrappedShareSummary rewind={createMockRewind({ totals: { minutes: 2880, movies: 50, shows: 20, episodes: 200 } })} />
    )

    expect(screen.getByText('2 days')).toBeInTheDocument()
  })

  it('should use singular form for 1 play', () => {
    render(<WrappedShareSummary rewind={createMockRewind({ topMovies: [{ title: 'Movie', minutes: 120, plays: 1 }] })} />)

    expect(screen.getByText(/1 play$/)).toBeInTheDocument()
  })

  it('should use singular form for 1 episode', () => {
    render(
      <WrappedShareSummary rewind={createMockRewind({ topShows: [{ title: 'Show', minutes: 30, plays: 1, episodes: 1 }] })} />
    )

    expect(screen.getByText(/1 episode$/)).toBeInTheDocument()
  })
})
