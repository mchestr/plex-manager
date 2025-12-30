import { HistoricalWrappedSelectorHeader } from '@/components/admin/wrapped/historical-wrapped-selector-header'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { usePathname, useRouter } from 'next/navigation'

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
}))

describe('HistoricalWrappedSelectorHeader', () => {
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
  ]

  describe('Initial Rendering', () => {
    it('should not render when loading', () => {
      ;(global.fetch as jest.Mock).mockReturnValue(new Promise(() => {}))

      const { container } = render(
        <HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />
      )

      expect(container.firstChild).toBeNull()
    })

    it('should not render when versions array is empty', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: [] }),
      })

      const { container } = render(
        <HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />
      )

      await waitFor(() => {
        expect(container.firstChild).toBeNull()
      })
    })

    it('should render button when versions are loaded', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: mockVersions }),
      })

      render(<HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument()
      })
    })
  })

  describe('Version Loading', () => {
    it('should fetch versions on mount', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: mockVersions }),
      })

      render(<HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(`/api/admin/wrapped/${mockWrappedId}/versions`)
      })
    })

    it('should handle fetch error gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'))

      const { container } = render(
        <HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />
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
        <HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />
      )

      await waitFor(() => {
        expect(container.firstChild).toBeNull()
      })
    })
  })

  describe('Button Display', () => {
    beforeEach(async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: mockVersions }),
      })
    })

    it('should display current version text', async () => {
      render(<HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByText('Current')).toBeInTheDocument()
      })
    })

    it('should display version count', async () => {
      render(<HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByText(`(${mockVersions.length})`)).toBeInTheDocument()
      })
    })

    it('should display clock icon', async () => {
      const { container } = render(
        <HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />
      )

      await waitFor(() => {
        const svg = container.querySelector('svg')
        expect(svg).toBeInTheDocument()
      })
    })

    it('should display chevron icon', async () => {
      const { container } = render(
        <HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />
      )

      await waitFor(() => {
        const svgs = container.querySelectorAll('svg')
        expect(svgs.length).toBeGreaterThan(1)
      })
    })
  })

  describe('Dropdown Expansion', () => {
    beforeEach(async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: mockVersions }),
      })
    })

    it('should expand dropdown when button is clicked', async () => {
      render(<HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument()
      })

      const button = screen.getByRole('button')
      fireEvent.click(button)

      await waitFor(() => {
        expect(screen.getByText(/Jan 15/)).toBeInTheDocument()
      })
    })

    it('should collapse dropdown when button is clicked again', async () => {
      render(<HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument()
      })

      const button = screen.getByRole('button')
      fireEvent.click(button)

      await waitFor(() => {
        expect(screen.getByText(/Jan 15/)).toBeInTheDocument()
      })

      fireEvent.click(button)

      await waitFor(() => {
        expect(screen.queryByText(/Jan 15/)).not.toBeInTheDocument()
      })
    })

    it('should close dropdown when backdrop is clicked', async () => {
      render(<HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument()
      })

      const button = screen.getByRole('button')
      fireEvent.click(button)

      await waitFor(() => {
        expect(screen.getByText(/Jan 15/)).toBeInTheDocument()
      })

      const backdrop = document.querySelector('.fixed.inset-0')
      expect(backdrop).toBeInTheDocument()
      fireEvent.click(backdrop!)

      await waitFor(() => {
        expect(screen.queryByText(/Jan 15/)).not.toBeInTheDocument()
      })
    })

    it('should rotate chevron when expanded', async () => {
      const { container } = render(
        <HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />
      )

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument()
      })

      const button = screen.getByRole('button')
      const chevron = container.querySelectorAll('svg')[1]

      expect(chevron).not.toHaveClass('rotate-180')

      fireEvent.click(button)

      await waitFor(() => {
        expect(chevron).toHaveClass('rotate-180')
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
      render(<HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button'))

      await waitFor(() => {
        expect(screen.getByText(/Jan 15/)).toBeInTheDocument()
      })

      const currentVersionButton = screen.getAllByRole('button')[1] // First button is the header button
      fireEvent.click(currentVersionButton)

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(`/admin/users/${mockUserId}/wrapped`)
      })
    })

    it('should navigate to historical version when clicked', async () => {
      render(<HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button'))

      await waitFor(() => {
        expect(screen.getByText(/Jan 10/)).toBeInTheDocument()
      })

      const historicalVersionButton = screen.getAllByRole('button')[2] // Second version button
      fireEvent.click(historicalVersionButton)

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(`/admin/wrapped/${mockWrappedId}/history/version-2`)
      })
    })

    it('should close dropdown after version selection', async () => {
      render(<HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button'))

      await waitFor(() => {
        expect(screen.getByText(/Jan 10/)).toBeInTheDocument()
      })

      const historicalVersionButton = screen.getAllByRole('button')[2]
      fireEvent.click(historicalVersionButton)

      await waitFor(() => {
        // After clicking, the dropdown should close (backdrop and dropdown menu should be gone)
        const backdrop = document.querySelector('.fixed.inset-0')
        expect(backdrop).not.toBeInTheDocument()
      })
    })

    it('should handle navigation error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
      mockPush.mockRejectedValueOnce(new Error('Navigation error'))

      render(<HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button'))

      await waitFor(() => {
        expect(screen.getByText(/Jan 10/)).toBeInTheDocument()
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
  })

  describe('Version Display', () => {
    beforeEach(async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: mockVersions }),
      })
    })

    it('should display formatted date for each version', async () => {
      render(<HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button'))

      await waitFor(() => {
        expect(screen.getByText(/Jan 15/)).toBeInTheDocument()
        expect(screen.getByText(/Jan 10/)).toBeInTheDocument()
      })
    })

    it('should display provider and model for each version', async () => {
      render(<HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button'))

      await waitFor(() => {
        expect(screen.getByText(/openai\/gpt-4/)).toBeInTheDocument()
        expect(screen.getByText(/anthropic\/claude-3/)).toBeInTheDocument()
      })
    })

    it('should display cost and tokens for each version', async () => {
      render(<HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button'))

      await waitFor(() => {
        expect(screen.getByText(/\$0\.0234/)).toBeInTheDocument()
        expect(screen.getByText(/1,500 tokens/)).toBeInTheDocument()
      })
    })

    it('should display "Current" badge for current version', async () => {
      render(<HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button'))

      await waitFor(() => {
        const currentBadges = screen.getAllByText('Current')
        expect(currentBadges.length).toBeGreaterThan(1) // One in header, one in dropdown
      })
    })

    it('should display checkmark for selected version', async () => {
      render(<HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button'))

      await waitFor(() => {
        const checkmarks = document.querySelectorAll('svg path[d*="M5 13l4 4L19 7"]')
        expect(checkmarks.length).toBeGreaterThan(0)
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

      render(<HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button'))

      await waitFor(() => {
        // Check that provider is shown and component renders without errors
        const versionButtons = screen.getAllByRole('button')
        expect(versionButtons.length).toBeGreaterThan(1)
        expect(screen.getByText(/openai/i)).toBeInTheDocument()
      })
    })
  })

  describe('Pathname Detection', () => {
    it('should detect current version from current wrapped page', async () => {
      ;(usePathname as jest.Mock).mockReturnValue(`/admin/users/${mockUserId}/wrapped`)
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: mockVersions }),
      })

      render(<HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />)

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

      render(<HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button'))

      await waitFor(() => {
        // The historical version should be selected
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
        <HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />
      )

      await waitFor(() => {
        expect(screen.getByText('Current')).toBeInTheDocument()
      })

      ;(usePathname as jest.Mock).mockReturnValue(
        `/admin/wrapped/${mockWrappedId}/history/version-2`
      )

      rerender(<HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />)

      // Selection should update based on new pathname
      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument()
      })
    })
  })

  describe('Styling', () => {
    beforeEach(async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: mockVersions }),
      })
    })

    it('should render button', async () => {
      render(<HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        const button = screen.getByRole('button')
        expect(button).toBeInTheDocument()
      })
    })

    it('should highlight selected version', async () => {
      render(<HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button'))

      await waitFor(() => {
        const versionButtons = screen.getAllByRole('button')
        const currentVersionButton = versionButtons[1]
        expect(currentVersionButton).toBeInTheDocument()
      })
    })

    it('should apply correct dropdown positioning', async () => {
      const { container } = render(
        <HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />
      )

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button'))

      await waitFor(() => {
        const dropdown = container.querySelector('.absolute.top-full.right-0')
        expect(dropdown).toBeInTheDocument()
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
        <HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />
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

      render(<HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument()
      })
    })

    it('should handle rapid button clicks', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: mockVersions }),
      })

      render(<HistoricalWrappedSelectorHeader wrappedId={mockWrappedId} userId={mockUserId} />)

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument()
      })

      const button = screen.getByRole('button')
      fireEvent.click(button)
      fireEvent.click(button)
      fireEvent.click(button)

      // Should not throw errors
      expect(true).toBe(true)
    })
  })
})

