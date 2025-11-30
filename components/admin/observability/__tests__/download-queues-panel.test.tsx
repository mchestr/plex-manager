import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DownloadQueuesPanel } from '../download-queues-panel'
import type { QueuesResponse } from '@/app/api/observability/queues/route'

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

describe('DownloadQueuesPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  const mockQueues: QueuesResponse = {
    available: true,
    sonarrConfigured: true,
    radarrConfigured: true,
    items: [
      {
        id: 1,
        source: 'sonarr',
        title: 'Breaking Bad - S01E05',
        status: 'downloading',
        progress: 65,
        size: 1073741824, // 1 GB
        sizeLeft: 375809638,
        estimatedCompletionTime: new Date(Date.now() + 3600000).toISOString(),
        quality: '1080p',
      },
      {
        id: 2,
        source: 'radarr',
        title: 'Inception',
        status: 'queued',
        progress: 0,
        size: 2147483648, // 2 GB
        sizeLeft: 2147483648,
        estimatedCompletionTime: null,
        quality: '4K',
      },
      {
        id: 3,
        source: 'sonarr',
        title: 'The Office - S05E12',
        status: 'paused',
        progress: 30,
        size: 536870912, // 512 MB
        sizeLeft: 375809638,
        estimatedCompletionTime: null,
        quality: '720p',
      },
    ],
  }

  describe('Loading State', () => {
    it('should show skeleton while loading', () => {
      ;(fetch as jest.Mock).mockImplementation(() => new Promise(() => {}))

      const { container } = renderWithQuery(<DownloadQueuesPanel />)

      expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
    })
  })

  describe('Error State', () => {
    it('should show error message when fetch fails', async () => {
      ;(fetch as jest.Mock).mockRejectedValue(new Error('Network error'))

      renderWithQuery(<DownloadQueuesPanel />)

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument()
      })
    })
  })

  describe('Not Configured State', () => {
    it('should show message when neither service is configured', async () => {
      const notConfigured: QueuesResponse = {
        available: false,
        sonarrConfigured: false,
        radarrConfigured: false,
        items: [],
        error: 'Neither Sonarr nor Radarr configured',
      }

      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(notConfigured),
      })

      renderWithQuery(<DownloadQueuesPanel />)

      await waitFor(() => {
        expect(screen.getByText('Neither Sonarr nor Radarr configured')).toBeInTheDocument()
      })
    })
  })

  describe('Empty Queue State', () => {
    it('should show "No items in queue" when queue is empty', async () => {
      const emptyQueue: QueuesResponse = {
        available: true,
        sonarrConfigured: true,
        radarrConfigured: true,
        items: [],
      }

      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(emptyQueue),
      })

      renderWithQuery(<DownloadQueuesPanel />)

      await waitFor(() => {
        expect(screen.getByText('No items in queue')).toBeInTheDocument()
      })
    })
  })

  describe('Queue Items Display', () => {
    it('should render download queues panel', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockQueues),
      })

      renderWithQuery(<DownloadQueuesPanel />)

      await waitFor(() => {
        expect(screen.getByTestId('download-queues-panel')).toBeInTheDocument()
      })
    })

    it('should display each queue item', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockQueues),
      })

      renderWithQuery(<DownloadQueuesPanel />)

      await waitFor(() => {
        expect(screen.getByTestId('queue-item-sonarr-1')).toBeInTheDocument()
        expect(screen.getByTestId('queue-item-radarr-2')).toBeInTheDocument()
        expect(screen.getByTestId('queue-item-sonarr-3')).toBeInTheDocument()
      })
    })

    it('should display item titles', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockQueues),
      })

      renderWithQuery(<DownloadQueuesPanel />)

      await waitFor(() => {
        expect(screen.getByText('Breaking Bad - S01E05')).toBeInTheDocument()
        expect(screen.getByText('Inception')).toBeInTheDocument()
        expect(screen.getByText('The Office - S05E12')).toBeInTheDocument()
      })
    })

    it('should display status labels', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockQueues),
      })

      renderWithQuery(<DownloadQueuesPanel />)

      await waitFor(() => {
        expect(screen.getByText('Downloading')).toBeInTheDocument()
        expect(screen.getByText('Queued')).toBeInTheDocument()
        expect(screen.getByText('Paused')).toBeInTheDocument()
      })
    })

    it('should display quality info', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockQueues),
      })

      renderWithQuery(<DownloadQueuesPanel />)

      await waitFor(() => {
        expect(screen.getByText('1080p')).toBeInTheDocument()
        expect(screen.getByText('4K')).toBeInTheDocument()
        expect(screen.getByText('720p')).toBeInTheDocument()
      })
    })

    it('should display progress percentages', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockQueues),
      })

      renderWithQuery(<DownloadQueuesPanel />)

      await waitFor(() => {
        expect(screen.getByText('65%')).toBeInTheDocument()
        expect(screen.getByText('0%')).toBeInTheDocument()
        expect(screen.getByText('30%')).toBeInTheDocument()
      })
    })

    it('should display item count in footer', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockQueues),
      })

      renderWithQuery(<DownloadQueuesPanel />)

      await waitFor(() => {
        expect(screen.getByText(/3 items in queue/)).toBeInTheDocument()
      })
    })
  })

  describe('Size Formatting', () => {
    it('should format sizes correctly', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockQueues),
      })

      renderWithQuery(<DownloadQueuesPanel />)

      await waitFor(() => {
        expect(screen.getByText('1 GB')).toBeInTheDocument()
        expect(screen.getByText('2 GB')).toBeInTheDocument()
      })
    })
  })

  describe('Limits Display', () => {
    it('should only show first 5 items', async () => {
      const manyItems: QueuesResponse = {
        available: true,
        sonarrConfigured: true,
        radarrConfigured: true,
        items: Array.from({ length: 10 }, (_, i) => ({
          id: i + 1,
          source: 'sonarr' as const,
          title: `Show ${i + 1}`,
          status: 'queued' as const,
          progress: 0,
          size: 1000000000,
          sizeLeft: 1000000000,
          estimatedCompletionTime: null,
          quality: '1080p',
        })),
      }

      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(manyItems),
      })

      renderWithQuery(<DownloadQueuesPanel />)

      await waitFor(() => {
        expect(screen.getByText('Show 1')).toBeInTheDocument()
        expect(screen.getByText('Show 5')).toBeInTheDocument()
        expect(screen.queryByText('Show 6')).not.toBeInTheDocument()
      })
    })

    it('should show count with "showing 5" when more than 5 items', async () => {
      const manyItems: QueuesResponse = {
        available: true,
        sonarrConfigured: true,
        radarrConfigured: true,
        items: Array.from({ length: 10 }, (_, i) => ({
          id: i + 1,
          source: 'sonarr' as const,
          title: `Show ${i + 1}`,
          status: 'queued' as const,
          progress: 0,
          size: 1000000000,
          sizeLeft: 1000000000,
          estimatedCompletionTime: null,
          quality: '1080p',
        })),
      }

      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(manyItems),
      })

      renderWithQuery(<DownloadQueuesPanel />)

      await waitFor(() => {
        expect(screen.getByText(/10 items in queue.*showing 5/)).toBeInTheDocument()
      })
    })
  })

  describe('API Interaction', () => {
    it('should fetch from correct endpoint', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockQueues),
      })

      renderWithQuery(<DownloadQueuesPanel />)

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith('/api/observability/queues')
      })
    })
  })
})
