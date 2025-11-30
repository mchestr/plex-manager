import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ActiveSessionsPanel } from '../active-sessions-panel'
import type { SessionsResponse } from '@/app/api/observability/sessions/route'

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

describe('ActiveSessionsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  const mockSessions: SessionsResponse = {
    available: true,
    streamCount: 2,
    sessions: [
      {
        sessionId: 'session-1',
        user: 'John Doe',
        userThumb: 'https://example.com/john.jpg',
        title: 'Episode 5',
        grandparentTitle: 'Breaking Bad',
        mediaType: 'episode',
        progress: 45,
        state: 'playing',
        player: 'Chrome',
        quality: '1080p',
        duration: 3600000,
        viewOffset: 1620000,
      },
      {
        sessionId: 'session-2',
        user: 'Jane Smith',
        userThumb: null,
        title: 'Inception',
        grandparentTitle: null,
        mediaType: 'movie',
        progress: 78,
        state: 'paused',
        player: 'Roku',
        quality: '4K',
        duration: 9000000,
        viewOffset: 7020000,
      },
    ],
  }

  describe('Loading State', () => {
    it('should show skeleton while loading', () => {
      ;(fetch as jest.Mock).mockImplementation(() => new Promise(() => {}))

      const { container } = renderWithQuery(<ActiveSessionsPanel />)

      // Should show skeleton animation
      expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
    })
  })

  describe('Error State', () => {
    it('should show error message when fetch fails', async () => {
      ;(fetch as jest.Mock).mockRejectedValue(new Error('Network error'))

      renderWithQuery(<ActiveSessionsPanel />)

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument()
      })
    })

    it('should show generic error message for non-Error exceptions', async () => {
      ;(fetch as jest.Mock).mockRejectedValue('Unknown error')

      renderWithQuery(<ActiveSessionsPanel />)

      await waitFor(() => {
        expect(screen.getByText('Failed to load sessions')).toBeInTheDocument()
      })
    })
  })

  describe('Not Configured State', () => {
    it('should show "Tautulli not configured" when not available', async () => {
      const notConfigured: SessionsResponse = {
        available: false,
        sessions: [],
        streamCount: 0,
        error: 'Tautulli not configured',
      }

      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(notConfigured),
      })

      renderWithQuery(<ActiveSessionsPanel />)

      await waitFor(() => {
        expect(screen.getByText('Tautulli not configured')).toBeInTheDocument()
      })
    })

    it('should show custom error message when provided', async () => {
      const customError: SessionsResponse = {
        available: false,
        sessions: [],
        streamCount: 0,
        error: 'Custom error message',
      }

      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(customError),
      })

      renderWithQuery(<ActiveSessionsPanel />)

      await waitFor(() => {
        expect(screen.getByText('Custom error message')).toBeInTheDocument()
      })
    })
  })

  describe('Empty Sessions State', () => {
    it('should show "No active streams" when sessions array is empty', async () => {
      const emptySessions: SessionsResponse = {
        available: true,
        sessions: [],
        streamCount: 0,
      }

      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(emptySessions),
      })

      renderWithQuery(<ActiveSessionsPanel />)

      await waitFor(() => {
        expect(screen.getByText('No active streams')).toBeInTheDocument()
      })
    })
  })

  describe('Sessions Display', () => {
    it('should render active sessions panel', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSessions),
      })

      renderWithQuery(<ActiveSessionsPanel />)

      await waitFor(() => {
        expect(screen.getByTestId('active-sessions-panel')).toBeInTheDocument()
      })
    })

    it('should display each session', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSessions),
      })

      renderWithQuery(<ActiveSessionsPanel />)

      await waitFor(() => {
        expect(screen.getByTestId('session-session-1')).toBeInTheDocument()
        expect(screen.getByTestId('session-session-2')).toBeInTheDocument()
      })
    })

    it('should display session titles correctly', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSessions),
      })

      renderWithQuery(<ActiveSessionsPanel />)

      await waitFor(() => {
        expect(screen.getByText('Breaking Bad - Episode 5')).toBeInTheDocument()
        expect(screen.getByText('Inception')).toBeInTheDocument()
      })
    })

    it('should display user names', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSessions),
      })

      renderWithQuery(<ActiveSessionsPanel />)

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument()
        expect(screen.getByText('Jane Smith')).toBeInTheDocument()
      })
    })

    it('should display player and quality info', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSessions),
      })

      renderWithQuery(<ActiveSessionsPanel />)

      await waitFor(() => {
        expect(screen.getByText('Chrome')).toBeInTheDocument()
        expect(screen.getByText('1080p')).toBeInTheDocument()
        expect(screen.getByText('Roku')).toBeInTheDocument()
        expect(screen.getByText('4K')).toBeInTheDocument()
      })
    })

    it('should display progress percentages', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSessions),
      })

      renderWithQuery(<ActiveSessionsPanel />)

      await waitFor(() => {
        expect(screen.getByText('45%')).toBeInTheDocument()
        expect(screen.getByText('78%')).toBeInTheDocument()
      })
    })

    it('should display session states', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSessions),
      })

      renderWithQuery(<ActiveSessionsPanel />)

      await waitFor(() => {
        expect(screen.getByText('playing')).toBeInTheDocument()
        expect(screen.getByText('paused')).toBeInTheDocument()
      })
    })

    it('should display stream count in footer', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSessions),
      })

      renderWithQuery(<ActiveSessionsPanel />)

      await waitFor(() => {
        expect(screen.getByText(/2 active streams/)).toBeInTheDocument()
      })
    })
  })

  describe('User Avatar', () => {
    it('should display user image when available', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSessions),
      })

      renderWithQuery(<ActiveSessionsPanel />)

      await waitFor(() => {
        const img = screen.getByAltText('John Doe') as HTMLImageElement
        expect(img.src).toBe('https://example.com/john.jpg')
      })
    })

    it('should display initial fallback when no image', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSessions),
      })

      renderWithQuery(<ActiveSessionsPanel />)

      await waitFor(() => {
        // Jane Smith has no image, should show 'J'
        expect(screen.getByText('J')).toBeInTheDocument()
      })
    })
  })

  describe('API Interaction', () => {
    it('should fetch sessions from correct endpoint', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSessions),
      })

      renderWithQuery(<ActiveSessionsPanel />)

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith('/api/observability/sessions')
      })
    })

    it('should handle non-ok response', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
      })

      renderWithQuery(<ActiveSessionsPanel />)

      await waitFor(() => {
        expect(screen.getByText('Failed to fetch sessions')).toBeInTheDocument()
      })
    })
  })
})
