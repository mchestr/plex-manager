import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StoragePanel } from '../storage-panel'
import type { StorageResponse } from '@/app/api/observability/storage/route'

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

describe('StoragePanel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  const mockStorage: StorageResponse = {
    available: true,
    sonarrConfigured: true,
    radarrConfigured: true,
    tautulliConfigured: true,
    diskSpace: [
      {
        path: '/media/shows',
        label: 'TV Shows',
        freeSpace: 500000000000,
        totalSpace: 2000000000000,
        usedSpace: 1500000000000,
        usedPercent: 75,
        source: 'sonarr',
      },
      {
        path: '/media/movies',
        label: 'Movies',
        freeSpace: 200000000000,
        totalSpace: 1000000000000,
        usedSpace: 800000000000,
        usedPercent: 80,
        source: 'radarr',
      },
    ],
    libraries: [
      {
        sectionId: '1',
        sectionName: 'Movies',
        sectionType: 'movie',
        count: 1250,
      },
      {
        sectionId: '2',
        sectionName: 'TV Shows',
        sectionType: 'show',
        count: 350,
      },
      {
        sectionId: '3',
        sectionName: 'Music',
        sectionType: 'artist',
        count: 5000,
      },
    ],
  }

  describe('Loading State', () => {
    it('should show skeleton while loading', () => {
      ;(fetch as jest.Mock).mockImplementation(() => new Promise(() => {}))

      const { container } = renderWithQuery(<StoragePanel />)

      expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
    })
  })

  describe('Error State', () => {
    it('should show error message when fetch fails', async () => {
      ;(fetch as jest.Mock).mockRejectedValue(new Error('Network error'))

      renderWithQuery(<StoragePanel />)

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument()
      })
    })
  })

  describe('Not Configured State', () => {
    it('should show message when no services configured', async () => {
      const notConfigured: StorageResponse = {
        available: false,
        sonarrConfigured: false,
        radarrConfigured: false,
        tautulliConfigured: false,
        diskSpace: [],
        libraries: [],
        error: 'No services configured for storage metrics',
      }

      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(notConfigured),
      })

      renderWithQuery(<StoragePanel />)

      await waitFor(() => {
        expect(screen.getByText('No services configured for storage metrics')).toBeInTheDocument()
      })
    })
  })

  describe('Storage Display', () => {
    it('should render storage panel', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockStorage),
      })

      renderWithQuery(<StoragePanel />)

      await waitFor(() => {
        expect(screen.getByTestId('storage-panel')).toBeInTheDocument()
      })
    })

    it('should display "Disk Usage" heading', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockStorage),
      })

      renderWithQuery(<StoragePanel />)

      await waitFor(() => {
        expect(screen.getByText('Disk Usage')).toBeInTheDocument()
      })
    })

    it('should display disk labels', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockStorage),
      })

      renderWithQuery(<StoragePanel />)

      await waitFor(() => {
        // TV Shows and Movies appear in both disk space and libraries sections
        expect(screen.getAllByText('TV Shows').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('Movies').length).toBeGreaterThanOrEqual(1)
      })
    })

    it('should display usage percentages', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockStorage),
      })

      renderWithQuery(<StoragePanel />)

      await waitFor(() => {
        expect(screen.getByText('75%')).toBeInTheDocument()
        expect(screen.getByText('80%')).toBeInTheDocument()
      })
    })

    it('should display disk test IDs', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockStorage),
      })

      renderWithQuery(<StoragePanel />)

      await waitFor(() => {
        expect(screen.getByTestId('disk-sonarr')).toBeInTheDocument()
        expect(screen.getByTestId('disk-radarr')).toBeInTheDocument()
      })
    })
  })

  describe('Libraries Display', () => {
    it('should display "Libraries" heading', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockStorage),
      })

      renderWithQuery(<StoragePanel />)

      await waitFor(() => {
        expect(screen.getByText('Libraries')).toBeInTheDocument()
      })
    })

    it('should display library names', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockStorage),
      })

      renderWithQuery(<StoragePanel />)

      await waitFor(() => {
        // Note: Movies and TV Shows also appear in disk labels, so we check libraries section
        expect(screen.getByTestId('library-1')).toBeInTheDocument()
        expect(screen.getByTestId('library-2')).toBeInTheDocument()
        expect(screen.getByTestId('library-3')).toBeInTheDocument()
      })
    })

    it('should display library counts', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockStorage),
      })

      renderWithQuery(<StoragePanel />)

      await waitFor(() => {
        expect(screen.getByText('1,250 items')).toBeInTheDocument()
        expect(screen.getByText('350 items')).toBeInTheDocument()
        expect(screen.getByText('5,000 items')).toBeInTheDocument()
      })
    })
  })

  describe('Storage Formatting', () => {
    it('should format bytes correctly', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockStorage),
      })

      renderWithQuery(<StoragePanel />)

      await waitFor(() => {
        // Check for formatted sizes (used/free)
        expect(screen.getByText('1.4 TB used')).toBeInTheDocument()
        expect(screen.getByText('465.7 GB free')).toBeInTheDocument()
      })
    })
  })

  describe('Usage Color Coding', () => {
    it('should use yellow for 75% usage', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockStorage),
      })

      renderWithQuery(<StoragePanel />)

      await waitFor(() => {
        const disk75 = screen.getByTestId('disk-sonarr')
        expect(disk75).toBeInTheDocument()
        // The 75% text should have yellow color
        expect(screen.getByText('75%')).toHaveClass('text-yellow-400')
      })
    })

    it('should use red for 90%+ usage', async () => {
      const highUsage: StorageResponse = {
        ...mockStorage,
        diskSpace: [
          {
            path: '/media/full',
            label: 'Full Drive',
            freeSpace: 50000000000,
            totalSpace: 1000000000000,
            usedSpace: 950000000000,
            usedPercent: 95,
            source: 'sonarr',
          },
        ],
      }

      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(highUsage),
      })

      renderWithQuery(<StoragePanel />)

      await waitFor(() => {
        expect(screen.getByText('95%')).toHaveClass('text-red-400')
      })
    })

    it('should use green for under 75% usage', async () => {
      const lowUsage: StorageResponse = {
        ...mockStorage,
        diskSpace: [
          {
            path: '/media/empty',
            label: 'Empty Drive',
            freeSpace: 800000000000,
            totalSpace: 1000000000000,
            usedSpace: 200000000000,
            usedPercent: 20,
            source: 'sonarr',
          },
        ],
      }

      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(lowUsage),
      })

      renderWithQuery(<StoragePanel />)

      await waitFor(() => {
        expect(screen.getByText('20%')).toHaveClass('text-green-400')
      })
    })
  })

  describe('API Interaction', () => {
    it('should fetch from correct endpoint', async () => {
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockStorage),
      })

      renderWithQuery(<StoragePanel />)

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith('/api/observability/storage')
      })
    })
  })
})
