import { UserWrappedViewer } from '@/components/wrapped/user-wrapped-viewer';
import { Prisma } from '@prisma/client';
import { render, screen } from '@testing-library/react';

// Mock the WrappedGeneratingAnimation component
jest.mock('@/components/generator/wrapped-generating-animation', () => ({
  WrappedGeneratingAnimation: ({ year, compact }: { year: number; compact?: boolean }) => (
    <div data-testid="generating-animation">
      Generating {year} Wrapped {compact && '(compact)'}
    </div>
  ),
}))

// Mock next/link
jest.mock('next/link', () => {
  const MockLink = ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  )
  MockLink.displayName = 'Link'
  return MockLink
})

type WrappedWithUser = Prisma.PlexWrappedGetPayload<{
  include: {
    user: {
      select: {
        id: true
        name: true
        email: true
        image: true
      }
    }
  }
}>

const mockUser = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  image: null,
}

const createMockWrapped = (
  status: string,
  data?: string,
  error?: string | null
): WrappedWithUser => ({
  id: 'wrapped-1',
  userId: 'user-1',
  year: 2024,
  status,
  data: data || '{}',
  error: error || null,
  generatedAt: new Date('2024-01-15'),
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-15'),
  shareToken: null,
  user: mockUser,
})

describe('UserWrappedViewer', () => {
  describe('generating status', () => {
    it('should show generating animation when status is generating', () => {
      const wrapped = createMockWrapped('generating')
      render(<UserWrappedViewer wrapped={wrapped} />)

      expect(screen.getByTestId('generating-animation')).toBeInTheDocument()
      expect(screen.getByText(/Generating 2024 Wrapped/)).toBeInTheDocument()
    })
  })

  describe('failed status', () => {
    it('should show error message when status is failed', () => {
      const wrapped = createMockWrapped('failed', '{}', 'Generation failed')
      render(<UserWrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Generation Failed')).toBeInTheDocument()
      expect(screen.getByText('Generation failed')).toBeInTheDocument()
      expect(screen.getByText('Try Again')).toBeInTheDocument()
    })

    it('should show generic error when no error message provided', () => {
      const wrapped = createMockWrapped('failed')
      render(<UserWrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Generation Failed')).toBeInTheDocument()
      expect(
        screen.getByText('There was an error generating your wrapped. Please try again.')
      ).toBeInTheDocument()
    })
  })

  describe('pending status', () => {
    it('should show pending message when status is pending', () => {
      const wrapped = createMockWrapped('pending')
      render(<UserWrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Wrapped Pending')).toBeInTheDocument()
      expect(
        screen.getByText('Your wrapped generation is pending. Please check back soon!')
      ).toBeInTheDocument()
    })
  })

  describe('invalid status or data', () => {
    it('should show not ready message when status is not completed', () => {
      const wrapped = createMockWrapped('unknown')
      render(<UserWrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Wrapped Not Ready')).toBeInTheDocument()
      expect(screen.getByText('Generate Your Wrapped')).toBeInTheDocument()
    })

    it('should show not ready message when data is invalid JSON', () => {
      const wrapped = createMockWrapped('completed', 'invalid json')
      render(<UserWrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Wrapped Not Ready')).toBeInTheDocument()
    })

    it('should show not ready message when data is null', () => {
      const wrapped = createMockWrapped('completed', 'null')
      render(<UserWrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Wrapped Not Ready')).toBeInTheDocument()
    })
  })

  describe('completed status with valid data', () => {
    it('should render hero section with year and generation date', () => {
      const wrappedData = {
        totalWatchTime: 5000,
        topMovies: [],
        topShows: [],
      }
      const wrapped = createMockWrapped('completed', JSON.stringify(wrappedData))
      render(<UserWrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Your 2024 Plex Year in Review')).toBeInTheDocument()
      expect(screen.getByText(/Generated on/)).toBeInTheDocument()
    })

    it('should display total watch time stat', () => {
      const wrappedData = {
        totalWatchTime: 5000, // 5000 minutes = 3 days, 11 hours, 20 minutes
        topMovies: [],
        topShows: [],
      }
      const wrapped = createMockWrapped('completed', JSON.stringify(wrappedData))
      render(<UserWrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Total Watch Time')).toBeInTheDocument()
      expect(screen.getByText(/3 days, 11 hours/)).toBeInTheDocument()
    })

    it('should display movies watched count', () => {
      const wrappedData = {
        topMovies: [
          { title: 'Movie 1', watchTime: 120, playCount: 1 },
          { title: 'Movie 2', watchTime: 90, playCount: 2 },
        ],
        topShows: [],
      }
      const wrapped = createMockWrapped('completed', JSON.stringify(wrappedData))
      render(<UserWrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Movies Watched')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
    })

    it('should display shows watched count', () => {
      const wrappedData = {
        topMovies: [],
        topShows: [
          { title: 'Show 1', watchTime: 300, playCount: 10, episodesWatched: 10 },
          { title: 'Show 2', watchTime: 200, playCount: 5, episodesWatched: 5 },
        ],
      }
      const wrapped = createMockWrapped('completed', JSON.stringify(wrappedData))
      render(<UserWrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Shows Watched')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
    })

    it('should render top movies list', () => {
      const wrappedData = {
        topMovies: [
          { title: 'Inception', watchTime: 148, playCount: 2 },
          { title: 'The Matrix', watchTime: 136, playCount: 1 },
        ],
        topShows: [],
      }
      const wrapped = createMockWrapped('completed', JSON.stringify(wrappedData))
      render(<UserWrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Top Movies')).toBeInTheDocument()
      expect(screen.getByText('Inception')).toBeInTheDocument()
      expect(screen.getByText('The Matrix')).toBeInTheDocument()
      expect(screen.getByText('#1')).toBeInTheDocument()
      expect(screen.getByText('#2')).toBeInTheDocument()
    })

    it('should render top shows list', () => {
      const wrappedData = {
        topMovies: [],
        topShows: [
          { title: 'Breaking Bad', watchTime: 500, playCount: 10, episodesWatched: 10 },
          { title: 'The Office', watchTime: 400, playCount: 20, episodesWatched: 20 },
        ],
      }
      const wrapped = createMockWrapped('completed', JSON.stringify(wrappedData))
      render(<UserWrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Top Shows')).toBeInTheDocument()
      expect(screen.getByText('Breaking Bad')).toBeInTheDocument()
      expect(screen.getByText('The Office')).toBeInTheDocument()
    })

    it('should show placeholder when no movies or shows', () => {
      const wrappedData = {
        topMovies: [],
        topShows: [],
      }
      const wrapped = createMockWrapped('completed', JSON.stringify(wrappedData))
      render(<UserWrappedViewer wrapped={wrapped} />)

      expect(
        screen.getByText(/Your wrapped data is being prepared/)
      ).toBeInTheDocument()
    })

    it('should handle missing watchTime in movies', () => {
      const wrappedData = {
        topMovies: [{ title: 'Movie Without Time', playCount: 1 }],
        topShows: [],
      }
      const wrapped = createMockWrapped('completed', JSON.stringify(wrappedData))
      render(<UserWrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Movie Without Time')).toBeInTheDocument()
    })

    it('should handle missing watchTime in shows', () => {
      const wrappedData = {
        topMovies: [],
        topShows: [{ title: 'Show Without Time', playCount: 1, episodesWatched: 5 }],
      }
      const wrapped = createMockWrapped('completed', JSON.stringify(wrappedData))
      render(<UserWrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Show Without Time')).toBeInTheDocument()
    })
  })

  describe('formatWatchTime helper', () => {
    it('should format 0 minutes correctly', () => {
      const wrappedData = { totalWatchTime: 0, topMovies: [], topShows: [] }
      const wrapped = createMockWrapped('completed', JSON.stringify(wrappedData))
      render(<UserWrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('0 minutes')).toBeInTheDocument()
    })

    it('should format minutes only when less than an hour', () => {
      const wrappedData = { totalWatchTime: 45, topMovies: [], topShows: [] }
      const wrapped = createMockWrapped('completed', JSON.stringify(wrappedData))
      render(<UserWrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('45 minutes')).toBeInTheDocument()
    })

    it('should format hours and minutes when less than a day', () => {
      const wrappedData = { totalWatchTime: 150, topMovies: [], topShows: [] } // 2 hours 30 minutes
      const wrapped = createMockWrapped('completed', JSON.stringify(wrappedData))
      render(<UserWrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('2 hours, 30 minutes')).toBeInTheDocument()
    })

    it('should format days and hours when more than a day', () => {
      const wrappedData = { totalWatchTime: 1500, topMovies: [], topShows: [] } // 1 day 1 hour
      const wrapped = createMockWrapped('completed', JSON.stringify(wrappedData))
      render(<UserWrappedViewer wrapped={wrapped} />)

      expect(screen.getByText(/1 day, 1 hour/)).toBeInTheDocument()
    })

    it('should show minutes when days are present', () => {
      const wrappedData = { totalWatchTime: 1470, topMovies: [], topShows: [] } // 1 day 30 minutes
      const wrapped = createMockWrapped('completed', JSON.stringify(wrappedData))
      render(<UserWrappedViewer wrapped={wrapped} />)

      expect(screen.getByText(/1 day, 30 minutes/)).toBeInTheDocument()
    })

    it('should use plural forms correctly', () => {
      const wrappedData = { totalWatchTime: 2940, topMovies: [], topShows: [] } // 2 days 1 hour
      const wrapped = createMockWrapped('completed', JSON.stringify(wrappedData))
      render(<UserWrappedViewer wrapped={wrapped} />)

      expect(screen.getByText(/2 days, 1 hour/)).toBeInTheDocument()
    })
  })
})

