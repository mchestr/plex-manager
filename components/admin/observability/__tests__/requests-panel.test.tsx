import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RequestsPanel } from '../requests-panel'
import type { RequestsStatsResponse } from '@/app/api/observability/requests/route'

// Mock fetch
global.fetch = jest.fn()

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

describe('RequestsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  const mockRequests: RequestsStatsResponse = {
    available: true,
    configured: true,
    stats: {
      pending: 5,
      approved: 12,
      available: 45,
      declined: 3,
      total: 65,
    },
    recentRequests: [
      {
        id: 1,
        type: 'movie',
        title: 'Inception',
        status: 'available',
        requestedBy: 'John Doe',
        requestedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      },
      {
        id: 2,
        type: 'tv',
        title: 'Breaking Bad',
        status: 'pending',
        requestedBy: 'Jane Smith',
        requestedAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
      },
      {
        id: 3,
        type: 'movie',
        title: 'The Dark Knight',
        status: 'approved',
        requestedBy: 'Bob Wilson',
        requestedAt: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
      },
    ],
  }

  describe('Loading State', () => {
    it('should show skeleton while loading', () => {
      ;(fetch as jest.Mock).mockImplementation(() => new Promise(() => {}))

      const { container } = renderWithQuery(<RequestsPanel />)

      expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
    })
  })

  describe('Error State', () => {
    it('should show error message when fetch fails', async () => {
      ;(fetch as jest.Mock).mockRejectedValue(new Error('Network error'))

      renderWithQuery(<RequestsPanel />)

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument()
      })
    })
  })

  describe('Not Configured State', () => {
    it('should show message when Overseerr is not configured', async () => {
      const notConfigured: RequestsStatsResponse = {
        available: false,
        configured: false,
        stats: { pending: 0, approved: 0, available: 0, declined: 0, total: 0 },
        recentRequests: [],
        error: 'Overseerr not configured',
      }

      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(notConfigured),
      })

      renderWithQuery(<RequestsPanel />)

      await waitFor(() => {
        expect(screen.getByText('Overseerr not configured')).toBeInTheDocument()
      })
    })

    it('should show message when Overseerr is configured but unavailable', async () => {
      const unavailable: RequestsStatsResponse = {
        available: false,
        configured: true,
        stats: { pending: 0, approved: 0, available: 0, declined: 0, total: 0 },
        recentRequests: [],
        error: 'Unable to fetch request data',
      }

      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(unavailable),
      })

      renderWithQuery(<RequestsPanel />)

      await waitFor(() => {
        expect(screen.getByText('Unable to fetch request data')).toBeInTheDocument()
      })
    })
  })

  describe('Stats Display', () => {
    it('should render requests panel', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockRequests),
      })

      renderWithQuery(<RequestsPanel />)

      await waitFor(() => {
        expect(screen.getByTestId('requests-panel')).toBeInTheDocument()
      })
    })

    it('should display pending count', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockRequests),
      })

      renderWithQuery(<RequestsPanel />)

      await waitFor(() => {
        expect(screen.getByText('5')).toBeInTheDocument()
        expect(screen.getByText('Pending')).toBeInTheDocument()
      })
    })

    it('should display approved count', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockRequests),
      })

      renderWithQuery(<RequestsPanel />)

      await waitFor(() => {
        expect(screen.getByText('12')).toBeInTheDocument()
        expect(screen.getByText('Approved')).toBeInTheDocument()
      })
    })

    it('should display available count', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockRequests),
      })

      renderWithQuery(<RequestsPanel />)

      await waitFor(() => {
        expect(screen.getByText('45')).toBeInTheDocument()
        expect(screen.getByText('Available')).toBeInTheDocument()
      })
    })

    it('should display declined count', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockRequests),
      })

      renderWithQuery(<RequestsPanel />)

      await waitFor(() => {
        expect(screen.getByText('3')).toBeInTheDocument()
        expect(screen.getByText('Declined')).toBeInTheDocument()
      })
    })

    it('should display total in footer', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockRequests),
      })

      renderWithQuery(<RequestsPanel />)

      await waitFor(() => {
        expect(screen.getByText(/65 total requests/)).toBeInTheDocument()
      })
    })
  })

  describe('Recent Requests Display', () => {
    it('should display "Recent Requests" heading', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockRequests),
      })

      renderWithQuery(<RequestsPanel />)

      await waitFor(() => {
        expect(screen.getByText('Recent Requests')).toBeInTheDocument()
      })
    })

    it('should display request titles', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockRequests),
      })

      renderWithQuery(<RequestsPanel />)

      await waitFor(() => {
        expect(screen.getByText('Inception')).toBeInTheDocument()
        expect(screen.getByText('Breaking Bad')).toBeInTheDocument()
        expect(screen.getByText('The Dark Knight')).toBeInTheDocument()
      })
    })

    it('should display media types', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockRequests),
      })

      renderWithQuery(<RequestsPanel />)

      await waitFor(() => {
        expect(screen.getAllByText('Movie')).toHaveLength(2)
        expect(screen.getByText('TV')).toBeInTheDocument()
      })
    })

    it('should display requester names', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockRequests),
      })

      renderWithQuery(<RequestsPanel />)

      await waitFor(() => {
        expect(screen.getByText(/John Doe/)).toBeInTheDocument()
        expect(screen.getByText(/Jane Smith/)).toBeInTheDocument()
        expect(screen.getByText(/Bob Wilson/)).toBeInTheDocument()
      })
    })

    it('should display request test IDs', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockRequests),
      })

      renderWithQuery(<RequestsPanel />)

      await waitFor(() => {
        expect(screen.getByTestId('request-1')).toBeInTheDocument()
        expect(screen.getByTestId('request-2')).toBeInTheDocument()
        expect(screen.getByTestId('request-3')).toBeInTheDocument()
      })
    })

    it('should display status badges', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockRequests),
      })

      renderWithQuery(<RequestsPanel />)

      await waitFor(() => {
        expect(screen.getByText('available')).toBeInTheDocument()
        expect(screen.getByText('pending')).toBeInTheDocument()
        expect(screen.getByText('approved')).toBeInTheDocument()
      })
    })
  })

  describe('Time Formatting', () => {
    it('should format recent time as "Xh ago"', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockRequests),
      })

      renderWithQuery(<RequestsPanel />)

      await waitFor(() => {
        expect(screen.getByText(/1h ago/)).toBeInTheDocument()
      })
    })

    it('should format days as "Xd ago"', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockRequests),
      })

      renderWithQuery(<RequestsPanel />)

      await waitFor(() => {
        expect(screen.getByText(/1d ago/)).toBeInTheDocument()
        expect(screen.getByText(/2d ago/)).toBeInTheDocument()
      })
    })
  })

  describe('API Interaction', () => {
    it('should fetch from correct endpoint', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockRequests),
      })

      renderWithQuery(<RequestsPanel />)

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith('/api/observability/requests')
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle zero stats', async () => {
      const zeroStats: RequestsStatsResponse = {
        available: true,
        configured: true,
        stats: { pending: 0, approved: 0, available: 0, declined: 0, total: 0 },
        recentRequests: [],
      }

      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(zeroStats),
      })

      renderWithQuery(<RequestsPanel />)

      await waitFor(() => {
        expect(screen.getByTestId('requests-panel')).toBeInTheDocument()
        // All stat boxes should show 0
        const zeros = screen.getAllByText('0')
        expect(zeros.length).toBeGreaterThanOrEqual(4)
      })
    })

    it('should not show Recent Requests section when empty', async () => {
      const noRecent: RequestsStatsResponse = {
        available: true,
        configured: true,
        stats: { pending: 5, approved: 10, available: 20, declined: 2, total: 37 },
        recentRequests: [],
      }

      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(noRecent),
      })

      renderWithQuery(<RequestsPanel />)

      await waitFor(() => {
        expect(screen.getByTestId('requests-panel')).toBeInTheDocument()
        expect(screen.queryByText('Recent Requests')).not.toBeInTheDocument()
      })
    })
  })
})
