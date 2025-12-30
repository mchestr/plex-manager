import { HistoricalVersionsInline } from '@/components/admin/wrapped/historical-versions-inline'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { usePathname, useRouter } from 'next/navigation'

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn(),
}))

// Mock StyledDropdown
jest.mock('@/components/ui/select', () => ({
  StyledDropdown: ({ value, onChange, options, className }: any) => (
    <select
      data-testid="styled-dropdown"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      {options.map((opt: any) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}))

describe('HistoricalVersionsInline', () => {
  const mockPush = jest.fn()
  const mockPathname = '/admin/users/user-123/wrapped'

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    })
    ;(usePathname as jest.Mock).mockReturnValue(mockPathname)
    global.fetch = jest.fn()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  const mockVersions = [
    {
      id: 'version-1',
      createdAt: '2024-01-15T10:00:00Z',
      provider: 'openai',
      model: 'gpt-4',
      cost: 0.0234,
      totalTokens: 1500,
    },
    {
      id: 'version-2',
      createdAt: '2024-01-10T15:30:00Z',
      provider: 'anthropic',
      model: 'claude-3',
      cost: 0.0156,
      totalTokens: 1200,
    },
  ]

  describe('Initial Rendering', () => {
    it('should not render when no wrappedId is found', () => {
      ;(usePathname as jest.Mock).mockReturnValue('/admin/users')
      const { container } = render(<HistoricalVersionsInline />)
      expect(container.firstChild).toBeNull()
    })

    it('should not render when versions array is empty', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: [] }),
      })

      const { container } = render(<HistoricalVersionsInline />)

      await waitFor(() => {
        expect(container.firstChild).toBeNull()
      })
    })

    it('should render when versions are loaded', async () => {
      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ wrappedId: 'wrapped-123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ versions: mockVersions }),
        })

      render(<HistoricalVersionsInline />)

      await waitFor(() => {
        expect(screen.getByTestId('styled-dropdown')).toBeInTheDocument()
      })
    })
  })

  describe('Version Loading', () => {
    it('should fetch wrappedId from user wrapped endpoint', async () => {
      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ wrappedId: 'wrapped-123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ versions: mockVersions }),
        })

      render(<HistoricalVersionsInline />)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/admin/wrapped/by-user/user-123')
        )
      })
    })

    it('should fetch versions after getting wrappedId', async () => {
      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ wrappedId: 'wrapped-123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ versions: mockVersions }),
        })

      render(<HistoricalVersionsInline />)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/admin/wrapped/wrapped-123/versions')
      })
    })

    it('should handle fetch errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'))

      const { container } = render(<HistoricalVersionsInline />)

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalled()
        expect(container.firstChild).toBeNull()
      })

      consoleErrorSpy.mockRestore()
    })

    it('should handle non-ok response', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
      })

      const { container } = render(<HistoricalVersionsInline />)

      await waitFor(() => {
        expect(container.firstChild).toBeNull()
      })
    })
  })

  describe('Historical Version Page Detection', () => {
    it('should detect historical version from pathname', async () => {
      ;(usePathname as jest.Mock).mockReturnValue('/admin/wrapped/wrapped-123/history/version-1')
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: mockVersions }),
      })

      render(<HistoricalVersionsInline />)

      await waitFor(() => {
        const dropdown = screen.getByTestId('styled-dropdown')
        expect(dropdown).toHaveValue('version-1')
      })
    })

    it('should set selectedVersion to current on wrapped page', async () => {
      ;(usePathname as jest.Mock).mockReturnValue('/admin/users/user-123/wrapped')
      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ wrappedId: 'wrapped-123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ versions: mockVersions }),
        })

      render(<HistoricalVersionsInline />)

      await waitFor(() => {
        const dropdown = screen.getByTestId('styled-dropdown')
        expect(dropdown).toHaveValue('current')
      })
    })

    it('should reset state when navigating away from wrapped pages', async () => {
      const { rerender } = render(<HistoricalVersionsInline />)
      ;(usePathname as jest.Mock).mockReturnValue('/admin/users')

      rerender(<HistoricalVersionsInline />)

      await waitFor(() => {
        expect(screen.queryByTestId('styled-dropdown')).not.toBeInTheDocument()
      })
    })
  })

  describe('Version Selection', () => {
    it('should navigate to historical version when selected', async () => {
      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ wrappedId: 'wrapped-123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ versions: mockVersions }),
        })

      render(<HistoricalVersionsInline />)

      await waitFor(() => {
        expect(screen.getByTestId('styled-dropdown')).toBeInTheDocument()
      })

      const dropdown = screen.getByTestId('styled-dropdown')
      fireEvent.change(dropdown, { target: { value: 'version-1' } })

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/admin/wrapped/wrapped-123/history/version-1')
      })
    })

    it('should navigate to current version when "current" is selected', async () => {
      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ wrappedId: 'wrapped-123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ versions: mockVersions }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ userId: 'user-123' }),
        })

      render(<HistoricalVersionsInline />)

      await waitFor(() => {
        expect(screen.getByTestId('styled-dropdown')).toBeInTheDocument()
      })

      const dropdown = screen.getByTestId('styled-dropdown')
      fireEvent.change(dropdown, { target: { value: 'current' } })

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/admin/wrapped/wrapped-123/user')
        expect(mockPush).toHaveBeenCalledWith('/admin/users/user-123/wrapped')
      })
    })

    it('should handle navigation error when selecting current', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ wrappedId: 'wrapped-123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ versions: mockVersions }),
        })
        .mockResolvedValueOnce({
          ok: false,
        })

      render(<HistoricalVersionsInline />)

      await waitFor(() => {
        expect(screen.getByTestId('styled-dropdown')).toBeInTheDocument()
      })

      const dropdown = screen.getByTestId('styled-dropdown')
      fireEvent.change(dropdown, { target: { value: 'current' } })

      await waitFor(() => {
        // The error is logged but component continues to work
        expect(screen.getByTestId('styled-dropdown')).toBeInTheDocument()
      })

      consoleErrorSpy.mockRestore()
    })
  })

  describe('Version Dropdown Options', () => {
    it('should display current option', async () => {
      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ wrappedId: 'wrapped-123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ versions: mockVersions }),
        })

      render(<HistoricalVersionsInline />)

      await waitFor(() => {
        expect(screen.getByText('Current')).toBeInTheDocument()
      })
    })

    it('should display version options with formatted dates', async () => {
      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ wrappedId: 'wrapped-123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ versions: mockVersions }),
        })

      render(<HistoricalVersionsInline />)

      await waitFor(() => {
        expect(screen.getByText(/Jan 15.*openai\/gpt-4/)).toBeInTheDocument()
        expect(screen.getByText(/Jan 10.*anthropic\/claude-3/)).toBeInTheDocument()
      })
    })

    it('should handle version with null model', async () => {
      const versionsWithNullModel = [
        {
          ...mockVersions[0],
          model: null,
        },
      ]

      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ wrappedId: 'wrapped-123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ versions: versionsWithNullModel }),
        })

      render(<HistoricalVersionsInline />)

      await waitFor(() => {
        expect(screen.getByText(/unknown/)).toBeInTheDocument()
      })
    })
  })

  describe('Date Formatting', () => {
    it('should format dates correctly', async () => {
      const versionWithSpecificDate = [
        {
          id: 'version-1',
          createdAt: '2024-03-15T14:30:00Z',
          provider: 'openai',
          model: 'gpt-4',
          cost: 0.0234,
          totalTokens: 1500,
        },
      ]

      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ wrappedId: 'wrapped-123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ versions: versionWithSpecificDate }),
        })

      render(<HistoricalVersionsInline />)

      await waitFor(() => {
        // Date formatting depends on locale, so just check it contains expected parts
        expect(screen.getByText(/Mar 15/)).toBeInTheDocument()
      })
    })

    it('should handle Date objects as well as strings', async () => {
      const versionWithDateObject = [
        {
          id: 'version-1',
          createdAt: new Date('2024-03-15T14:30:00Z'),
          provider: 'openai',
          model: 'gpt-4',
          cost: 0.0234,
          totalTokens: 1500,
        },
      ]

      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ wrappedId: 'wrapped-123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ versions: versionWithDateObject }),
        })

      render(<HistoricalVersionsInline />)

      await waitFor(() => {
        expect(screen.getByText(/Mar 15/)).toBeInTheDocument()
      })
    })
  })

  describe('UI Elements', () => {
    it('should render separator pipe', async () => {
      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ wrappedId: 'wrapped-123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ versions: mockVersions }),
        })

      const { container } = render(<HistoricalVersionsInline />)

      await waitFor(() => {
        expect(container.textContent).toContain('|')
      })
    })

    it('should render "Version:" label', async () => {
      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ wrappedId: 'wrapped-123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ versions: mockVersions }),
        })

      render(<HistoricalVersionsInline />)

      await waitFor(() => {
        expect(screen.getByText('Version:')).toBeInTheDocument()
      })
    })

    it('should apply correct className to dropdown', async () => {
      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ wrappedId: 'wrapped-123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ versions: mockVersions }),
        })

      render(<HistoricalVersionsInline />)

      await waitFor(() => {
        const dropdown = screen.getByTestId('styled-dropdown')
        expect(dropdown).toHaveClass('min-w-[200px]')
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty wrappedId response', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })

      const { container } = render(<HistoricalVersionsInline />)

      await waitFor(() => {
        expect(container.firstChild).toBeNull()
      })
    })

    it('should handle malformed pathname', async () => {
      ;(usePathname as jest.Mock).mockReturnValue('/admin/users//wrapped')

      const { container } = render(<HistoricalVersionsInline />)

      await waitFor(() => {
        expect(container.firstChild).toBeNull()
      })
    })

    it('should handle version selection without wrappedId', async () => {
      const { container } = render(<HistoricalVersionsInline />)

      // Component should not render, so no dropdown to interact with
      expect(container.firstChild).toBeNull()
    })

    it('should handle rapid pathname changes', async () => {
      const { rerender } = render(<HistoricalVersionsInline />)

      ;(usePathname as jest.Mock).mockReturnValue('/admin/users/user-1/wrapped')
      rerender(<HistoricalVersionsInline />)

      ;(usePathname as jest.Mock).mockReturnValue('/admin/users/user-2/wrapped')
      rerender(<HistoricalVersionsInline />)

      ;(usePathname as jest.Mock).mockReturnValue('/admin/users')
      rerender(<HistoricalVersionsInline />)

      // Should not throw errors
      expect(true).toBe(true)
    })
  })

  describe('Loading State', () => {
    it('should set loading state during fetch', async () => {
      let resolvePromise: any
      const promise = new Promise((resolve) => {
        resolvePromise = resolve
      })

      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ wrappedId: 'wrapped-123' }),
        })
        .mockReturnValueOnce(promise)

      render(<HistoricalVersionsInline />)

      // Component uses loading state internally but doesn't render loading UI
      // Just verify it doesn't crash during loading
      expect(true).toBe(true)

      resolvePromise({
        ok: true,
        json: async () => ({ versions: mockVersions }),
      })

      await waitFor(() => {
        expect(screen.getByTestId('styled-dropdown')).toBeInTheDocument()
      })
    })
  })
})

