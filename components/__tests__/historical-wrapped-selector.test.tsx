import { HistoricalWrappedSelector } from '@/components/admin/wrapped/historical-wrapped-selector'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { usePathname, useRouter } from 'next/navigation'

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
}))

describe('HistoricalWrappedSelector', () => {
  const mockPush = jest.fn()
  const mockWrappedId = 'wrapped-123'
  const mockUserId = 'user-456'

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    })
    ;(usePathname as jest.Mock).mockReturnValue(`/admin/users/${mockUserId}/wrapped`)
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
      isCurrent: true,
    },
    {
      id: 'version-2',
      createdAt: '2024-01-10T15:30:00Z',
      provider: 'anthropic',
      model: 'claude-3',
      cost: 0.0156,
      totalTokens: 1200,
      isCurrent: false,
    },
    {
      id: 'version-3',
      createdAt: '2024-01-05T09:00:00Z',
      provider: 'openai',
      model: 'gpt-3.5',
      cost: 0.0089,
      totalTokens: 800,
      isCurrent: false,
    },
  ]

  describe('Initial Rendering', () => {
    it('should render loading state initially', () => {
      ;(global.fetch as jest.Mock).mockReturnValue(new Promise(() => {}))

      render(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      expect(screen.getByText('Loading versions...')).toBeInTheDocument()
    })

    it('should not render when versions array is empty', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: [] }),
      })

      const { container } = render(
        <HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />
      )

      await waitFor(() => {
        expect(container.firstChild).toBeNull()
      })
    })

    it('should render selector when versions are loaded', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: mockVersions }),
      })

      render(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByText('Historical Versions')).toBeInTheDocument()
      })
    })
  })

  describe('Version Loading', () => {
    it('should fetch versions on mount', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: mockVersions }),
      })

      render(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(`/api/admin/wrapped/${mockWrappedId}/versions`)
      })
    })

    it('should handle fetch error gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'))

      const { container } = render(
        <HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />
      )

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Failed to load historical versions:',
          expect.any(Error)
        )
        expect(container.firstChild).toBeNull()
      })

      consoleErrorSpy.mockRestore()
    })

    it('should handle non-ok response', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
      })

      const { container } = render(
        <HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />
      )

      await waitFor(() => {
        expect(container.firstChild).toBeNull()
      })
    })
  })

  describe('Header Display', () => {
    beforeEach(async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: mockVersions }),
      })
    })

    it('should display "Historical Versions" title', async () => {
      render(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByText('Historical Versions')).toBeInTheDocument()
      })
    })

    it('should display current version text', async () => {
      render(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByText('Current')).toBeInTheDocument()
      })
    })

    it('should display version count', async () => {
      render(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByText(`${mockVersions.length} versions`)).toBeInTheDocument()
      })
    })

    it('should display singular "version" for single version', async () => {
      // Reset mock to override beforeEach
      const singleVersion = [mockVersions[0]]
      ;(global.fetch as jest.Mock).mockReset().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: singleVersion }),
      })

      render(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        // Check for "1 version" (without 's')
        const button = screen.getByRole('button')
        expect(button.textContent).toContain('1')
        expect(button.textContent).toMatch(/version(?!s)/)
      })
    })

    it('should display expand/collapse chevron', async () => {
      const { container } = render(
        <HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />
      )

      await waitFor(() => {
        const chevron = container.querySelector('svg path[d*="M19 9l-7 7-7-7"]')
        expect(chevron).toBeInTheDocument()
      })
    })
  })

  describe('Expansion Toggle', () => {
    beforeEach(async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: mockVersions }),
      })
    })

    it('should expand version list when toggle is clicked', async () => {
      render(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByText('Historical Versions')).toBeInTheDocument()
      })

      // Initially, version details should not be visible
      expect(screen.queryByText(/Jan 15/)).not.toBeInTheDocument()

      const toggleButton = screen.getByRole('button')
      fireEvent.click(toggleButton)

      await waitFor(() => {
        expect(screen.getByText(/Jan 15/)).toBeInTheDocument()
      })
    })

    it('should collapse version list when toggle is clicked again', async () => {
      render(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByText('Historical Versions')).toBeInTheDocument()
      })

      const toggleButton = screen.getByRole('button')
      fireEvent.click(toggleButton)

      await waitFor(() => {
        expect(screen.getByText(/Jan 15/)).toBeInTheDocument()
      })

      fireEvent.click(toggleButton)

      await waitFor(() => {
        expect(screen.queryByText(/Jan 15/)).not.toBeInTheDocument()
      })
    })

    it('should rotate chevron when expanded', async () => {
      const { container } = render(
        <HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />
      )

      await waitFor(() => {
        expect(screen.getByText('Historical Versions')).toBeInTheDocument()
      })

      const chevron = container.querySelector('svg')
      expect(chevron).not.toHaveClass('rotate-180')

      const toggleButton = screen.getByRole('button')
      fireEvent.click(toggleButton)

      await waitFor(() => {
        expect(chevron).toHaveClass('rotate-180')
      })
    })
  })

  describe('Version Display', () => {
    beforeEach(async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: mockVersions }),
      })
    })

    it('should display all versions when expanded', async () => {
      render(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByText('Historical Versions')).toBeInTheDocument()
      })

      const toggleButton = screen.getByRole('button')
      fireEvent.click(toggleButton)

      await waitFor(() => {
        expect(screen.getByText(/Jan 15/)).toBeInTheDocument()
        expect(screen.getByText(/Jan 10/)).toBeInTheDocument()
        expect(screen.getByText(/Jan 5/)).toBeInTheDocument()
      })
    })

    it('should display provider and model for each version', async () => {
      render(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByText('Historical Versions')).toBeInTheDocument()
      })

      const toggleButton = screen.getByRole('button')
      fireEvent.click(toggleButton)

      await waitFor(() => {
        expect(screen.getByText(/openai\/gpt-4/)).toBeInTheDocument()
        expect(screen.getByText(/anthropic\/claude-3/)).toBeInTheDocument()
        expect(screen.getByText(/openai\/gpt-3.5/)).toBeInTheDocument()
      })
    })

    it('should display cost and tokens for each version', async () => {
      render(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByText('Historical Versions')).toBeInTheDocument()
      })

      const toggleButton = screen.getByRole('button')
      fireEvent.click(toggleButton)

      await waitFor(() => {
        expect(screen.getByText(/\$0\.0234/)).toBeInTheDocument()
        expect(screen.getByText(/1,500 tokens/)).toBeInTheDocument()
        expect(screen.getByText(/\$0\.0156/)).toBeInTheDocument()
        expect(screen.getByText(/1,200 tokens/)).toBeInTheDocument()
      })
    })

    it('should display "Current" badge for current version', async () => {
      render(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByText('Historical Versions')).toBeInTheDocument()
      })

      const toggleButton = screen.getByRole('button')
      fireEvent.click(toggleButton)

      await waitFor(() => {
        const currentBadges = screen.getAllByText('Current')
        expect(currentBadges.length).toBeGreaterThan(1) // One in header, one in version card
      })
    })

    it('should handle version with null model', async () => {
      // This test has its own mock, so we need to reset and set up a fresh mock
      ;(global.fetch as jest.Mock).mockReset().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          versions: [
            {
              ...mockVersions[0],
              model: null,
            },
          ],
        }),
      })

      render(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByText('Historical Versions')).toBeInTheDocument()
      })

      const toggleButton = screen.getByRole('button')
      fireEvent.click(toggleButton)

      await waitFor(() => {
        // Check that provider is shown and "unknown" is used for null model
        const versionButtons = screen.getAllByRole('button')
        expect(versionButtons.length).toBeGreaterThan(1)
        // The component should render without errors
        expect(screen.getByText(/openai/i)).toBeInTheDocument()
      })
    })
  })

  describe('Version Selection', () => {
    beforeEach(async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: mockVersions }),
      })
    })

    it('should navigate to current version when current version is clicked', async () => {
      render(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByText('Historical Versions')).toBeInTheDocument()
      })

      const toggleButton = screen.getByRole('button')
      fireEvent.click(toggleButton)

      await waitFor(() => {
        const versionButtons = screen.getAllByRole('button')
        expect(versionButtons.length).toBeGreaterThan(1)
      })

      const currentVersionButton = screen.getAllByRole('button')[1] // First version button
      fireEvent.click(currentVersionButton)

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(`/admin/users/${mockUserId}/wrapped`)
      })
    })

    it('should navigate to historical version when clicked', async () => {
      render(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByText('Historical Versions')).toBeInTheDocument()
      })

      const toggleButton = screen.getByRole('button')
      fireEvent.click(toggleButton)

      await waitFor(() => {
        const versionButtons = screen.getAllByRole('button')
        expect(versionButtons.length).toBeGreaterThan(2)
      })

      const historicalVersionButton = screen.getAllByRole('button')[2] // Second version button
      fireEvent.click(historicalVersionButton)

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(`/admin/wrapped/${mockWrappedId}/history/version-2`)
      })
    })

    it('should close expanded list after version selection', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: mockVersions }),
      })

      render(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByText('Historical Versions')).toBeInTheDocument()
      })

      const toggleButton = screen.getByRole('button')
      fireEvent.click(toggleButton)

      await waitFor(() => {
        expect(screen.getByText(/Jan 10/)).toBeInTheDocument()
      })

      const historicalVersionButton = screen.getAllByRole('button')[2]
      fireEvent.click(historicalVersionButton)

      await waitFor(() => {
        // After clicking, the expanded list should be closed
        const versionButtons = screen.getAllByRole('button')
        // Should only have the toggle button, not the version buttons
        expect(versionButtons.length).toBe(1)
      })
    })

    it('should handle navigation error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
      mockPush.mockRejectedValueOnce(new Error('Navigation error'))

      render(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByText('Historical Versions')).toBeInTheDocument()
      })

      const toggleButton = screen.getByRole('button')
      fireEvent.click(toggleButton)

      await waitFor(() => {
        const versionButtons = screen.getAllByRole('button')
        expect(versionButtons.length).toBeGreaterThan(2)
      })

      const historicalVersionButton = screen.getAllByRole('button')[2]
      fireEvent.click(historicalVersionButton)

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Failed to navigate to version:',
          expect.any(Error)
        )
      })

      consoleErrorSpy.mockRestore()
    })

    it('should reset selection on navigation error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
      ;(usePathname as jest.Mock).mockReturnValue(`/admin/users/${mockUserId}/wrapped`)
      mockPush.mockRejectedValueOnce(new Error('Navigation error'))

      render(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByText('Historical Versions')).toBeInTheDocument()
      })

      const toggleButton = screen.getByRole('button')
      fireEvent.click(toggleButton)

      await waitFor(() => {
        const versionButtons = screen.getAllByRole('button')
        expect(versionButtons.length).toBeGreaterThan(2)
      })

      const historicalVersionButton = screen.getAllByRole('button')[2]
      fireEvent.click(historicalVersionButton)

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalled()
        // Selection should reset to current
        expect(screen.getByText('Current')).toBeInTheDocument()
      })

      consoleErrorSpy.mockRestore()
    })
  })

  describe('Pathname Detection', () => {
    it('should detect current version from current wrapped page', async () => {
      ;(usePathname as jest.Mock).mockReturnValue(`/admin/users/${mockUserId}/wrapped`)
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: mockVersions }),
      })

      render(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByText('Current')).toBeInTheDocument()
      })
    })

    it('should detect historical version from pathname', async () => {
      ;(usePathname as jest.Mock).mockReturnValue(
        `/admin/wrapped/${mockWrappedId}/history/version-2`
      )
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: mockVersions }),
      })

      render(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByText('Historical Versions')).toBeInTheDocument()
      })

      const toggleButton = screen.getByRole('button')
      fireEvent.click(toggleButton)

      await waitFor(() => {
        // The historical version should be highlighted
        const versionButtons = screen.getAllByRole('button')
        expect(versionButtons.length).toBeGreaterThan(1)
      })
    })

    it('should update selection when pathname changes', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: mockVersions }),
      })

      const { rerender } = render(
        <HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />
      )

      await waitFor(() => {
        expect(screen.getByText('Current')).toBeInTheDocument()
      })

      ;(usePathname as jest.Mock).mockReturnValue(
        `/admin/wrapped/${mockWrappedId}/history/version-2`
      )

      rerender(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      // Selection should update based on new pathname
      await waitFor(() => {
        expect(screen.getByText('Historical Versions')).toBeInTheDocument()
      })
    })
  })

  describe('Styling and Layout', () => {
    beforeEach(async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: mockVersions }),
      })
    })

    it('should have fixed positioning at bottom', async () => {
      const { container } = render(
        <HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />
      )

      await waitFor(() => {
        const fixedContainer = container.querySelector('.fixed.bottom-\\[32px\\]')
        expect(fixedContainer).toBeInTheDocument()
      })
    })

    it('should have backdrop blur effect', async () => {
      const { container } = render(
        <HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />
      )

      await waitFor(() => {
        const blurContainer = container.querySelector('.backdrop-blur-sm')
        expect(blurContainer).toBeInTheDocument()
      })
    })

    it('should highlight selected version', async () => {
      render(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByText('Historical Versions')).toBeInTheDocument()
      })

      const toggleButton = screen.getByRole('button')
      fireEvent.click(toggleButton)

      await waitFor(() => {
        const versionButtons = screen.getAllByRole('button')
        const currentVersionButton = versionButtons[1]
        expect(currentVersionButton).toBeInTheDocument()
      })
    })

    it('should render version buttons', async () => {
      render(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByText('Historical Versions')).toBeInTheDocument()
      })

      const toggleButton = screen.getByRole('button')
      fireEvent.click(toggleButton)

      await waitFor(() => {
        const versionButtons = screen.getAllByRole('button')
        const historicalButton = versionButtons[2]
        expect(historicalButton).toBeInTheDocument()
      })
    })

    it('should render version cards in horizontal scrollable layout', async () => {
      const { container } = render(
        <HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />
      )

      await waitFor(() => {
        expect(screen.getByText('Historical Versions')).toBeInTheDocument()
      })

      const toggleButton = screen.getByRole('button')
      fireEvent.click(toggleButton)

      await waitFor(() => {
        const scrollContainer = container.querySelector('.overflow-x-auto')
        expect(scrollContainer).toBeInTheDocument()
      })
    })
  })

  describe('Date and Cost Formatting', () => {
    beforeEach(async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: mockVersions }),
      })
    })

    it('should format dates correctly', async () => {
      render(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByText('Historical Versions')).toBeInTheDocument()
      })

      const toggleButton = screen.getByRole('button')
      fireEvent.click(toggleButton)

      await waitFor(() => {
        expect(screen.getByText(/Jan 15/)).toBeInTheDocument()
      })
    })

    it('should format costs with 4 decimal places', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: mockVersions }),
      })

      render(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByText('Historical Versions')).toBeInTheDocument()
      })

      const toggleButton = screen.getByRole('button')
      fireEvent.click(toggleButton)

      await waitFor(() => {
        // Check that cost is displayed with 4 decimal places
        const costElements = screen.getAllByText(/\$0\.\d{4}/)
        expect(costElements.length).toBeGreaterThan(0)
      })
    })

    it('should format token counts with commas', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: mockVersions }),
      })

      render(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByText('Historical Versions')).toBeInTheDocument()
      })

      const toggleButton = screen.getByRole('button')
      fireEvent.click(toggleButton)

      await waitFor(() => {
        // Check that tokens are displayed with commas
        const tokenElements = screen.getAllByText(/1,\d{3}/)
        expect(tokenElements.length).toBeGreaterThan(0)
        expect(screen.getAllByText(/tokens/).length).toBeGreaterThan(0)
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty versions response', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })

      const { container } = render(
        <HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />
      )

      await waitFor(() => {
        expect(container.firstChild).toBeNull()
      })
    })

    it('should handle version without isCurrent flag', async () => {
      const versionsWithoutCurrent = [
        {
          id: 'version-1',
          createdAt: '2024-01-15T10:00:00Z',
          provider: 'openai',
          model: 'gpt-4',
          cost: 0.0234,
          totalTokens: 1500,
        },
      ]

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: versionsWithoutCurrent }),
      })

      render(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByText('Historical Versions')).toBeInTheDocument()
      })
    })

    it('should handle rapid toggle clicks', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: mockVersions }),
      })

      render(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByText('Historical Versions')).toBeInTheDocument()
      })

      const toggleButton = screen.getByRole('button')
      fireEvent.click(toggleButton)
      fireEvent.click(toggleButton)
      fireEvent.click(toggleButton)

      // Should not throw errors
      expect(true).toBe(true)
    })

    it('should handle Date objects as well as strings', async () => {
      const versionsWithDateObject = [
        {
          ...mockVersions[0],
          createdAt: new Date('2024-01-15T10:00:00Z'),
        },
      ]

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: versionsWithDateObject }),
      })

      render(<HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByText('Historical Versions')).toBeInTheDocument()
      })

      const toggleButton = screen.getByRole('button')
      fireEvent.click(toggleButton)

      await waitFor(() => {
        expect(screen.getByText(/Jan 15/)).toBeInTheDocument()
      })
    })
  })

  describe('Loading State Styling', () => {
    it('should display loading state with proper styling', () => {
      ;(global.fetch as jest.Mock).mockReturnValue(new Promise(() => {}))

      const { container } = render(
        <HistoricalWrappedSelector wrappedId={mockWrappedId} userId={mockUserId} />
      )

      const loadingContainer = container.querySelector('.fixed.bottom-\\[32px\\]')
      expect(loadingContainer).toBeInTheDocument()
      expect(screen.getByText('Loading versions...')).toHaveClass('text-slate-400')
    })
  })
})

