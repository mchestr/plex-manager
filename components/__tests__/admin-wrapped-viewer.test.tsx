import { WrappedViewer } from '@/components/admin/wrapped/wrapped-viewer'
import { Prisma } from '@/lib/generated/prisma/client'
import { render, screen } from '@testing-library/react'

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

describe('WrappedViewer (Admin)', () => {
  const createMockWrapped = (overrides?: Partial<WrappedWithUser>): WrappedWithUser => ({
    id: 'wrapped-1',
    userId: 'user-1',
    year: 2024,
    status: 'completed',
    data: JSON.stringify({
      userName: 'Test User',
      topMovies: [
        { title: 'Movie 1', watchTime: '2 hours' },
        { title: 'Movie 2', watchTime: '1.5 hours' },
      ],
      topShows: [
        { title: 'Show 1', watchTime: '10 hours' },
        { title: 'Show 2', watchTime: '8 hours' },
      ],
      totalWatchTime: 1200,
    }),
    error: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    generatedAt: new Date('2024-01-15T10:00:00Z'),
    user: {
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
      image: null,
    },
    ...overrides,
  })

  describe('Status Display', () => {
    it('should display completed status badge', () => {
      const wrapped = createMockWrapped({ status: 'completed' })
      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Completed')).toBeInTheDocument()
      expect(screen.getByText('Completed')).toHaveClass('bg-green-500/20', 'text-green-400')
    })

    it('should display generating status badge', () => {
      const wrapped = createMockWrapped({ status: 'generating' })
      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Generating')).toBeInTheDocument()
      expect(screen.getByText('Generating')).toHaveClass('bg-yellow-500/20', 'text-yellow-400')
    })

    it('should display failed status badge', () => {
      const wrapped = createMockWrapped({ status: 'failed' })
      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Failed')).toBeInTheDocument()
      expect(screen.getByText('Failed')).toHaveClass('bg-red-500/20', 'text-red-400')
    })

    it('should display pending status badge', () => {
      const wrapped = createMockWrapped({ status: 'pending' })
      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Pending')).toBeInTheDocument()
      expect(screen.getByText('Pending')).toHaveClass('bg-blue-500/20', 'text-blue-400')
    })

    it('should not display badge for unknown status', () => {
      const wrapped = createMockWrapped({ status: 'unknown' as any })
      const { container } = render(<WrappedViewer wrapped={wrapped} />)

      const badges = container.querySelectorAll('.px-3.py-1.rounded-full')
      expect(badges.length).toBe(0)
    })
  })

  describe('Metadata Display', () => {
    it('should display year', () => {
      const wrapped = createMockWrapped({ year: 2024 })
      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Year:')).toBeInTheDocument()
      expect(screen.getByText('2024')).toBeInTheDocument()
    })

    it('should display generated date when available', () => {
      const wrapped = createMockWrapped({
        generatedAt: new Date('2024-01-15T10:30:00Z'),
      })
      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Generated:')).toBeInTheDocument()
    })

    it('should not display generated date when null', () => {
      const wrapped = createMockWrapped({ generatedAt: null })
      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.queryByText('Generated:')).not.toBeInTheDocument()
    })

    it('should display created date', () => {
      const wrapped = createMockWrapped({
        createdAt: new Date('2024-01-01T00:00:00Z'),
      })
      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Created:')).toBeInTheDocument()
    })
  })

  describe('Error Display', () => {
    it('should display error message when present', () => {
      const wrapped = createMockWrapped({
        error: 'Failed to generate wrapped',
        status: 'failed',
      })
      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Error:')).toBeInTheDocument()
      expect(screen.getByText('Failed to generate wrapped')).toBeInTheDocument()
    })

    it('should not display error section when error is null', () => {
      const wrapped = createMockWrapped({ error: null })
      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.queryByText('Error:')).not.toBeInTheDocument()
    })

    it('should style error message correctly', () => {
      const wrapped = createMockWrapped({
        error: 'Test error',
        status: 'failed',
      })
      const { container } = render(<WrappedViewer wrapped={wrapped} />)

      const errorContainer = container.querySelector('.bg-red-900\\/30')
      expect(errorContainer).toBeInTheDocument()
    })
  })

  describe('Wrapped Data Display - Completed Status', () => {
    it('should display wrapped data section when status is completed', () => {
      const wrapped = createMockWrapped({ status: 'completed' })
      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Wrapped Data')).toBeInTheDocument()
    })

    it('should not display wrapped data section when status is not completed', () => {
      const wrapped = createMockWrapped({ status: 'generating' })
      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.queryByText('Wrapped Data')).not.toBeInTheDocument()
    })

    it('should display user name', () => {
      const wrapped = createMockWrapped({ status: 'completed' })
      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('User')).toBeInTheDocument()
      expect(screen.getByText('Test User')).toBeInTheDocument()
    })

    it('should display top movies', () => {
      const wrapped = createMockWrapped({ status: 'completed' })
      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Top Movies')).toBeInTheDocument()
      expect(screen.getByText('Movie 1')).toBeInTheDocument()
      expect(screen.getByText('Movie 2')).toBeInTheDocument()
      expect(screen.getByText('2 hours watched')).toBeInTheDocument()
    })

    it('should display top shows', () => {
      const wrapped = createMockWrapped({ status: 'completed' })
      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Top Shows')).toBeInTheDocument()
      expect(screen.getByText('Show 1')).toBeInTheDocument()
      expect(screen.getByText('Show 2')).toBeInTheDocument()
      expect(screen.getByText('10 hours watched')).toBeInTheDocument()
    })

    it('should display total watch time', () => {
      const wrapped = createMockWrapped({ status: 'completed' })
      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Total Watch Time')).toBeInTheDocument()
      expect(screen.getByText('20 hours')).toBeInTheDocument()
    })

    it('should display raw JSON data in details', () => {
      const wrapped = createMockWrapped({ status: 'completed' })
      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('View Raw JSON Data')).toBeInTheDocument()
    })
  })

  describe('Data Parsing', () => {
    it('should handle invalid JSON gracefully', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
      const wrapped = createMockWrapped({
        status: 'completed',
        data: 'invalid json',
      })

      render(<WrappedViewer wrapped={wrapped} />)

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to parse wrapped data:',
        expect.any(Error)
      )
      expect(screen.getByText('Wrapped data is empty or invalid.')).toBeInTheDocument()

      consoleErrorSpy.mockRestore()
    })

    it('should display wrapped data section even with empty object', () => {
      const wrapped = createMockWrapped({
        status: 'completed',
        data: '{}',
      })

      render(<WrappedViewer wrapped={wrapped} />)

      // Empty object is still valid, so it shows Wrapped Data section with just raw JSON
      expect(screen.getByText('Wrapped Data')).toBeInTheDocument()
      expect(screen.getByText('View Raw JSON Data')).toBeInTheDocument()
    })

    it('should handle null data', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
      const wrapped = createMockWrapped({
        status: 'completed',
        data: null as any,
      })

      render(<WrappedViewer wrapped={wrapped} />)

      // null data will cause JSON.parse to fail, but component handles it gracefully
      // The component still renders but shows the empty/invalid message
      expect(screen.getByText('Wrapped data is empty or invalid.')).toBeInTheDocument()

      consoleErrorSpy.mockRestore()
    })
  })

  describe('Conditional Data Display', () => {
    it('should not display user section when userName is missing', () => {
      const wrapped = createMockWrapped({
        status: 'completed',
        data: JSON.stringify({}),
      })

      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.queryByText('User')).not.toBeInTheDocument()
    })

    it('should not display top movies when array is empty', () => {
      const wrapped = createMockWrapped({
        status: 'completed',
        data: JSON.stringify({ topMovies: [] }),
      })

      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.queryByText('Top Movies')).not.toBeInTheDocument()
    })

    it('should not display top movies when not an array', () => {
      const wrapped = createMockWrapped({
        status: 'completed',
        data: JSON.stringify({ topMovies: 'not an array' }),
      })

      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.queryByText('Top Movies')).not.toBeInTheDocument()
    })

    it('should not display top shows when array is empty', () => {
      const wrapped = createMockWrapped({
        status: 'completed',
        data: JSON.stringify({ topShows: [] }),
      })

      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.queryByText('Top Shows')).not.toBeInTheDocument()
    })

    it('should not display total watch time when undefined', () => {
      const wrapped = createMockWrapped({
        status: 'completed',
        data: JSON.stringify({}),
      })

      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.queryByText('Total Watch Time')).not.toBeInTheDocument()
    })

    it('should display total watch time when it is 0', () => {
      const wrapped = createMockWrapped({
        status: 'completed',
        data: JSON.stringify({ totalWatchTime: 0 }),
      })

      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Total Watch Time')).toBeInTheDocument()
      expect(screen.getByText('0 minutes')).toBeInTheDocument()
    })
  })

  describe('Movie and Show Display', () => {
    it('should display movie without title as "Movie N"', () => {
      const wrapped = createMockWrapped({
        status: 'completed',
        data: JSON.stringify({
          topMovies: [{ watchTime: '2 hours' }],
        }),
      })

      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Movie 1')).toBeInTheDocument()
    })

    it('should display show without title as "Show N"', () => {
      const wrapped = createMockWrapped({
        status: 'completed',
        data: JSON.stringify({
          topShows: [{ watchTime: '10 hours' }],
        }),
      })

      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Show 1')).toBeInTheDocument()
    })

    it('should not display watch time when missing', () => {
      const wrapped = createMockWrapped({
        status: 'completed',
        data: JSON.stringify({
          topMovies: [{ title: 'Movie without watch time' }],
        }),
      })

      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Movie without watch time')).toBeInTheDocument()
      expect(screen.queryByText('watched')).not.toBeInTheDocument()
    })
  })

  describe('Watch Time Formatting', () => {
    it('should format minutes correctly', () => {
      const wrapped = createMockWrapped({
        status: 'completed',
        data: JSON.stringify({ totalWatchTime: 45 }),
      })

      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('45 minutes')).toBeInTheDocument()
    })

    it('should format hours correctly', () => {
      const wrapped = createMockWrapped({
        status: 'completed',
        data: JSON.stringify({ totalWatchTime: 120 }),
      })

      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('2 hours')).toBeInTheDocument()
    })

    it('should format days and hours correctly', () => {
      const wrapped = createMockWrapped({
        status: 'completed',
        data: JSON.stringify({ totalWatchTime: 1500 }), // 25 hours = 1 day, 1 hour
      })

      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('1 day, 1 hour')).toBeInTheDocument()
    })

    it('should format days correctly (plural)', () => {
      const wrapped = createMockWrapped({
        status: 'completed',
        data: JSON.stringify({ totalWatchTime: 2880 }), // 48 hours = 2 days
      })

      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('2 days')).toBeInTheDocument()
    })

    it('should not show minutes when days are present', () => {
      const wrapped = createMockWrapped({
        status: 'completed',
        data: JSON.stringify({ totalWatchTime: 1470 }), // 1 day, 30 minutes (but minutes are hidden when days > 0)
      })

      render(<WrappedViewer wrapped={wrapped} />)

      // When days > 0, minutes are not shown per the formatWatchTime logic
      expect(screen.getByText('1 day')).toBeInTheDocument()
      expect(screen.queryByText(/30 minutes/)).not.toBeInTheDocument()
    })

    it('should handle singular hour', () => {
      const wrapped = createMockWrapped({
        status: 'completed',
        data: JSON.stringify({ totalWatchTime: 60 }),
      })

      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('1 hour')).toBeInTheDocument()
    })

    it('should handle singular minute', () => {
      const wrapped = createMockWrapped({
        status: 'completed',
        data: JSON.stringify({ totalWatchTime: 1 }),
      })

      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('1 minute')).toBeInTheDocument()
    })

    it('should handle zero watch time', () => {
      const wrapped = createMockWrapped({
        status: 'completed',
        data: JSON.stringify({ totalWatchTime: 0 }),
      })

      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('0 minutes')).toBeInTheDocument()
    })
  })

  describe('Layout and Styling', () => {
    it('should render status section with proper styling', () => {
      const wrapped = createMockWrapped()
      const { container } = render(<WrappedViewer wrapped={wrapped} />)

      const statusSection = container.querySelector('.bg-slate-800\\/50')
      expect(statusSection).toBeInTheDocument()
      expect(statusSection).toHaveClass('backdrop-blur-sm', 'border', 'border-slate-700')
    })

    it('should render wrapped data section with proper styling', () => {
      const wrapped = createMockWrapped({ status: 'completed' })
      render(<WrappedViewer wrapped={wrapped} />)

      const dataSection = screen.getByText('Wrapped Data').closest('.bg-slate-800\\/50')
      expect(dataSection).toBeInTheDocument()
    })

    it('should render movie cards in grid layout', () => {
      const wrapped = createMockWrapped({ status: 'completed' })
      const { container } = render(<WrappedViewer wrapped={wrapped} />)

      const movieGrid = container.querySelector('.grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-3')
      expect(movieGrid).toBeInTheDocument()
    })

    it('should style raw JSON details properly', () => {
      const wrapped = createMockWrapped({ status: 'completed' })
      const { container } = render(<WrappedViewer wrapped={wrapped} />)

      const details = container.querySelector('details')
      expect(details).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('should handle very large watch times', () => {
      const wrapped = createMockWrapped({
        status: 'completed',
        data: JSON.stringify({ totalWatchTime: 100000 }), // ~69 days
      })

      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.getByText(/69 days/)).toBeInTheDocument()
    })

    it('should handle negative watch time', () => {
      const wrapped = createMockWrapped({
        status: 'completed',
        data: JSON.stringify({ totalWatchTime: -100 }),
      })

      render(<WrappedViewer wrapped={wrapped} />)

      // Should handle gracefully, likely showing 0 or empty
      expect(screen.getByText('Total Watch Time')).toBeInTheDocument()
    })

    it('should handle very long movie titles', () => {
      const wrapped = createMockWrapped({
        status: 'completed',
        data: JSON.stringify({
          topMovies: [
            {
              title: 'A'.repeat(200),
              watchTime: '2 hours',
            },
          ],
        }),
      })

      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('A'.repeat(200))).toBeInTheDocument()
    })

    it('should handle many movies', () => {
      const movies = Array.from({ length: 20 }, (_, i) => ({
        title: `Movie ${i + 1}`,
        watchTime: `${i + 1} hours`,
      }))

      const wrapped = createMockWrapped({
        status: 'completed',
        data: JSON.stringify({ topMovies: movies }),
      })

      render(<WrappedViewer wrapped={wrapped} />)

      expect(screen.getByText('Movie 1')).toBeInTheDocument()
      expect(screen.getByText('Movie 20')).toBeInTheDocument()
    })

    it('should handle special characters in data', () => {
      const wrapped = createMockWrapped({
        status: 'completed',
        data: JSON.stringify({
          userName: 'User <script>alert("xss")</script>',
          topMovies: [{ title: 'Movie & Show "Special"', watchTime: '2 hours' }],
        }),
      })

      render(<WrappedViewer wrapped={wrapped} />)

      // React should escape these automatically - text appears in multiple places (user section and raw JSON)
      const matches = screen.getAllByText(/User.*script/)
      expect(matches.length).toBeGreaterThan(0)
    })
  })

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      const wrapped = createMockWrapped({ status: 'completed' })
      render(<WrappedViewer wrapped={wrapped} />)

      const h2Elements = screen.getAllByRole('heading', { level: 2 })
      expect(h2Elements.length).toBeGreaterThan(0)
    })

    it('should have proper heading for sections', () => {
      const wrapped = createMockWrapped({ status: 'completed' })
      render(<WrappedViewer wrapped={wrapped} />)

      const h3Elements = screen.getAllByRole('heading', { level: 3 })
      expect(h3Elements.length).toBeGreaterThan(0)
    })
  })
})

