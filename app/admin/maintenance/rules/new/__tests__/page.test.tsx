import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import NewRulePage from '../page'
import * as maintenanceActions from '@/actions/maintenance'

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))

// Mock maintenance actions
jest.mock('@/actions/maintenance', () => ({
  createMaintenanceRule: jest.fn(),
}))

// Mock toast
const mockShowError = jest.fn()
const mockShowSuccess = jest.fn()

jest.mock('@/components/ui/toast', () => ({
  useToast: () => ({
    showError: mockShowError,
    showSuccess: mockShowSuccess,
  }),
}))

// Mock EnhancedRuleBuilder component
jest.mock('@/components/maintenance/enhanced-rule-builder', () => ({
  EnhancedRuleBuilder: ({ value, onChange, mediaType }: any) => (
    <div data-testid="enhanced-rule-builder">
      <input
        data-testid="rule-builder-input"
        value={JSON.stringify(value)}
        onChange={(e) => onChange(JSON.parse(e.target.value))}
      />
      <span data-testid="rule-builder-media-type">{mediaType}</span>
    </div>
  ),
  createDefaultCriteria: (mediaType: string) => ({
    operator: 'AND',
    conditions: [
      {
        field: 'playCount',
        operator: 'lessThan',
        value: 5,
      },
    ],
    mediaType,
  }),
}))

describe('NewRulePage', () => {
  let queryClient: QueryClient
  const mockPush = jest.fn()
  const mockBack = jest.fn()

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    ;(useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      back: mockBack,
    })

    // Reset mocks
    mockShowError.mockClear()
    mockShowSuccess.mockClear()
    mockPush.mockClear()
    mockBack.mockClear()
    ;(maintenanceActions.createMaintenanceRule as jest.Mock).mockClear()

    // Mock successful fetch responses by default
    global.fetch = jest.fn((url) => {
      if (url.includes('/api/admin/radarr')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            servers: [
              { id: 'radarr-1', name: 'Radarr Server 1', url: 'http://radarr1.local', apiKey: 'key1', isActive: true },
              { id: 'radarr-2', name: 'Radarr Server 2', url: 'http://radarr2.local', apiKey: 'key2', isActive: false },
            ],
          }),
        } as Response)
      }
      if (url.includes('/api/admin/sonarr')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            servers: [
              { id: 'sonarr-1', name: 'Sonarr Server 1', url: 'http://sonarr1.local', apiKey: 'key1', isActive: true },
            ],
          }),
        } as Response)
      }
      return Promise.reject(new Error('Unknown URL'))
    }) as jest.Mock
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <NewRulePage />
      </QueryClientProvider>
    )
  }

  describe('Loading States', () => {
    it('should render loading state for Radarr servers', async () => {
      // Mock a delayed response
      global.fetch = jest.fn((url) => {
        if (url.includes('/api/admin/radarr')) {
          return new Promise(() => {}) // Never resolves
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ servers: [] }),
        } as Response)
      }) as jest.Mock

      renderComponent()

      // Wait for component to mount and show loading
      await waitFor(() => {
        expect(screen.getByText('Loading servers...')).toBeInTheDocument()
      })
    })

    it('should render loading state for Sonarr servers when media type is TV_SERIES', async () => {
      // Mock delayed Sonarr response
      global.fetch = jest.fn((url) => {
        if (url.includes('/api/admin/sonarr')) {
          return new Promise(() => {}) // Never resolves
        }
        if (url.includes('/api/admin/radarr')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ servers: [] }),
          } as Response)
        }
        return Promise.reject(new Error('Unknown URL'))
      }) as jest.Mock

      renderComponent()

      const user = userEvent.setup()

      // Change media type to TV_SERIES
      await waitFor(() => {
        const mediaTypeDropdown = screen.getByLabelText('Media Type')
        expect(mediaTypeDropdown).toBeInTheDocument()
      })

      const mediaTypeDropdown = screen.getByLabelText('Media Type')
      await user.click(mediaTypeDropdown)

      // Find and click TV Series option
      const tvSeriesOption = screen.getByText('TV Series')
      await user.click(tvSeriesOption)

      // Should show loading for Sonarr
      await waitFor(() => {
        expect(screen.getByText('Loading servers...')).toBeInTheDocument()
      })
    })
  })

  describe('Error States', () => {
    it('should show error toast when Radarr servers fail to load', async () => {
      global.fetch = jest.fn((url) => {
        if (url.includes('/api/admin/radarr')) {
          return Promise.resolve({
            ok: false,
            statusText: 'Internal Server Error',
          } as Response)
        }
        if (url.includes('/api/admin/sonarr')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ servers: [] }),
          } as Response)
        }
        return Promise.reject(new Error('Unknown URL'))
      }) as jest.Mock

      renderComponent()

      await waitFor(() => {
        expect(mockShowError).toHaveBeenCalledWith(
          expect.stringContaining('Failed to load Radarr servers')
        )
      })
    })

    it('should show error toast when Sonarr servers fail to load', async () => {
      global.fetch = jest.fn((url) => {
        if (url.includes('/api/admin/sonarr')) {
          return Promise.resolve({
            ok: false,
            statusText: 'Internal Server Error',
          } as Response)
        }
        if (url.includes('/api/admin/radarr')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ servers: [] }),
          } as Response)
        }
        return Promise.reject(new Error('Unknown URL'))
      }) as jest.Mock

      renderComponent()

      await waitFor(() => {
        expect(mockShowError).toHaveBeenCalledWith(
          expect.stringContaining('Failed to load Sonarr servers')
        )
      })
    })
  })

  describe('Server Dropdowns', () => {
    it('should populate Radarr dropdown with servers when data loads', async () => {
      renderComponent()

      // Wait for Radarr dropdown to appear with servers
      await waitFor(() => {
        const radarrDropdown = screen.getByLabelText('Radarr Server (Optional)')
        expect(radarrDropdown).toBeInTheDocument()
      })

      // Verify dropdown is not disabled
      const radarrDropdown = screen.getByLabelText('Radarr Server (Optional)')
      expect(radarrDropdown).not.toBeDisabled()
    })

    it('should populate Sonarr dropdown with servers for TV_SERIES media type', async () => {
      renderComponent()

      const user = userEvent.setup()

      // Wait for page to load
      await waitFor(() => {
        expect(screen.getByLabelText('Media Type')).toBeInTheDocument()
      })

      // Change media type to TV_SERIES
      const mediaTypeDropdown = screen.getByLabelText('Media Type')
      await user.click(mediaTypeDropdown)

      const tvSeriesOption = screen.getByText('TV Series')
      await user.click(tvSeriesOption)

      // Wait for Sonarr dropdown to appear
      await waitFor(() => {
        const sonarrDropdown = screen.getByLabelText('Sonarr Server (Optional)')
        expect(sonarrDropdown).toBeInTheDocument()
        expect(sonarrDropdown).not.toBeDisabled()
      })
    })

    it('should show "No servers configured" message when no Radarr servers exist', async () => {
      // Mock empty server list
      global.fetch = jest.fn((url) => {
        if (url.includes('/api/admin/radarr')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ servers: [] }),
          } as Response)
        }
        if (url.includes('/api/admin/sonarr')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ servers: [] }),
          } as Response)
        }
        return Promise.reject(new Error('Unknown URL'))
      }) as jest.Mock

      renderComponent()

      // Wait for dropdown to load
      await waitFor(() => {
        expect(screen.getByLabelText('Radarr Server (Optional)')).toBeInTheDocument()
      })

      // Verify disabled state and message
      const radarrDropdown = screen.getByLabelText('Radarr Server (Optional)')
      expect(radarrDropdown).toBeDisabled()

      // Check for the help text message
      expect(screen.getByText('Configure a Radarr server in settings to enable this option.')).toBeInTheDocument()
    })

    it('should show "No servers configured" message when no Sonarr servers exist', async () => {
      // Mock empty server list
      global.fetch = jest.fn((url) => {
        if (url.includes('/api/admin/radarr')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ servers: [] }),
          } as Response)
        }
        if (url.includes('/api/admin/sonarr')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ servers: [] }),
          } as Response)
        }
        return Promise.reject(new Error('Unknown URL'))
      }) as jest.Mock

      renderComponent()

      const user = userEvent.setup()

      // Wait for page to load
      await waitFor(() => {
        expect(screen.getByLabelText('Media Type')).toBeInTheDocument()
      })

      // Change to TV_SERIES
      const mediaTypeDropdown = screen.getByLabelText('Media Type')
      await user.click(mediaTypeDropdown)

      const tvSeriesOption = screen.getByText('TV Series')
      await user.click(tvSeriesOption)

      // Wait for Sonarr dropdown
      await waitFor(() => {
        expect(screen.getByLabelText('Sonarr Server (Optional)')).toBeInTheDocument()
      })

      const sonarrDropdown = screen.getByLabelText('Sonarr Server (Optional)')
      expect(sonarrDropdown).toBeDisabled()

      expect(screen.getByText('Configure a Sonarr server in settings to enable this option.')).toBeInTheDocument()
    })
  })

  describe('Form Submission', () => {
    it('should submit form successfully with server selection', async () => {
      ;(maintenanceActions.createMaintenanceRule as jest.Mock).mockResolvedValue({
        success: true,
      })

      renderComponent()

      const user = userEvent.setup()

      // Wait for form to load
      await waitFor(() => {
        expect(screen.getByLabelText(/Rule Name/)).toBeInTheDocument()
      })

      // Fill in form
      const nameInput = screen.getByLabelText(/Rule Name/)
      await user.type(nameInput, 'Test Rule')

      // Select Radarr server
      await waitFor(() => {
        expect(screen.getByLabelText('Radarr Server (Optional)')).toBeInTheDocument()
      })

      // Submit form
      const submitButton = screen.getByRole('button', { name: /Create Rule/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(maintenanceActions.createMaintenanceRule).toHaveBeenCalled()
        expect(mockShowSuccess).toHaveBeenCalledWith('Maintenance rule created successfully')
        expect(mockPush).toHaveBeenCalledWith('/admin/maintenance/rules')
      })
    })

    it('should submit form successfully without server selection', async () => {
      ;(maintenanceActions.createMaintenanceRule as jest.Mock).mockResolvedValue({
        success: true,
      })

      renderComponent()

      const user = userEvent.setup()

      // Wait for form to load
      await waitFor(() => {
        expect(screen.getByLabelText(/Rule Name/)).toBeInTheDocument()
      })

      // Fill in form with just the required name
      const nameInput = screen.getByLabelText(/Rule Name/)
      await user.type(nameInput, 'Test Rule Without Server')

      // Submit form
      const submitButton = screen.getByRole('button', { name: /Create Rule/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(maintenanceActions.createMaintenanceRule).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Test Rule Without Server',
            radarrId: undefined,
            sonarrId: undefined,
          })
        )
      })
    })

    it('should show error when form submission fails', async () => {
      ;(maintenanceActions.createMaintenanceRule as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Database connection failed',
      })

      renderComponent()

      const user = userEvent.setup()

      // Wait for form to load
      await waitFor(() => {
        expect(screen.getByLabelText(/Rule Name/)).toBeInTheDocument()
      })

      // Fill in form
      const nameInput = screen.getByLabelText(/Rule Name/)
      await user.type(nameInput, 'Test Rule')

      // Submit form
      const submitButton = screen.getByRole('button', { name: /Create Rule/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockShowError).toHaveBeenCalledWith('Database connection failed')
      })
    })

    it('should validate required name field', async () => {
      renderComponent()

      const user = userEvent.setup()

      // Wait for form to load
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Create Rule/i })).toBeInTheDocument()
      })

      // The name input should have the required attribute
      const nameInput = screen.getByLabelText(/Rule Name/)
      expect(nameInput).toHaveAttribute('required')

      // Type some spaces (which will be trimmed)
      await user.type(nameInput, '   ')

      // Try to submit with whitespace-only name
      const submitButton = screen.getByRole('button', { name: /Create Rule/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockShowError).toHaveBeenCalledWith('Rule name is required')
      })

      expect(maintenanceActions.createMaintenanceRule).not.toHaveBeenCalled()
    })

    it('should handle cancel button click', async () => {
      renderComponent()

      const user = userEvent.setup()

      // Wait for form to load
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument()
      })

      const cancelButton = screen.getByRole('button', { name: /Cancel/i })
      await user.click(cancelButton)

      expect(mockBack).toHaveBeenCalled()
    })
  })

  describe('Media Type Changes', () => {
    it('should show Radarr dropdown for MOVIE media type', async () => {
      renderComponent()

      await waitFor(() => {
        expect(screen.getByLabelText('Radarr Server (Optional)')).toBeInTheDocument()
      })

      // Sonarr dropdown should not be present
      expect(screen.queryByLabelText('Sonarr Server (Optional)')).not.toBeInTheDocument()
    })

    it('should show Sonarr dropdown for TV_SERIES media type', async () => {
      renderComponent()

      const user = userEvent.setup()

      // Wait for form to load
      await waitFor(() => {
        expect(screen.getByLabelText('Media Type')).toBeInTheDocument()
      })

      // Change to TV_SERIES
      const mediaTypeDropdown = screen.getByLabelText('Media Type')
      await user.click(mediaTypeDropdown)

      const tvSeriesOption = screen.getByText('TV Series')
      await user.click(tvSeriesOption)

      // Should show Sonarr, not Radarr
      await waitFor(() => {
        expect(screen.getByLabelText('Sonarr Server (Optional)')).toBeInTheDocument()
      })

      expect(screen.queryByLabelText('Radarr Server (Optional)')).not.toBeInTheDocument()
    })

    it('should show Sonarr dropdown for EPISODE media type', async () => {
      renderComponent()

      const user = userEvent.setup()

      // Wait for form to load
      await waitFor(() => {
        expect(screen.getByLabelText('Media Type')).toBeInTheDocument()
      })

      // Change to EPISODE
      const mediaTypeDropdown = screen.getByLabelText('Media Type')
      await user.click(mediaTypeDropdown)

      const episodeOption = screen.getByText('Episode')
      await user.click(episodeOption)

      // Should show Sonarr, not Radarr
      await waitFor(() => {
        expect(screen.getByLabelText('Sonarr Server (Optional)')).toBeInTheDocument()
      })

      expect(screen.queryByLabelText('Radarr Server (Optional)')).not.toBeInTheDocument()
    })
  })
})
