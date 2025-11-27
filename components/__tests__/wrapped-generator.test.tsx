import { generatePlexWrapped, getUserPlexWrapped } from '@/actions/users'
import { WrappedGenerator } from '@/components/generator/wrapped-generator'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
  }),
}))

// Mock the actions
jest.mock('@/actions/users', () => ({
  generatePlexWrapped: jest.fn(),
  getUserPlexWrapped: jest.fn(),
}))

// Mock the child components
jest.mock('@/components/generator/wrapped-generating-animation', () => ({
  WrappedGeneratingAnimation: ({ year, compact }: { year: number; compact?: boolean }) => (
    <div data-testid="generating-animation">
      Generating {year} {compact ? '(compact)' : ''}
    </div>
  ),
}))

jest.mock('@/components/generator/wrapped-generator-status', () => ({
  WrappedGeneratorStatus: ({
    status,
    year,
    error,
  }: {
    status: string
    year: number
    error?: string | null
  }) => (
    <div data-testid="generator-status">
      Status: {status} - Year: {year}
      {error && <div data-testid="status-error">{error}</div>}
    </div>
  ),
}))

jest.mock('@/components/generator/wrapped-generator-prompt', () => ({
  WrappedGeneratorPrompt: ({
    year,
    error,
    onGenerate,
  }: {
    year: number
    error?: string | null
    onGenerate: () => void
  }) => (
    <div data-testid="generator-prompt">
      <button onClick={onGenerate}>Generate {year}</button>
      {error && <div data-testid="prompt-error">{error}</div>}
    </div>
  ),
}))

// Mock useWrappedPolling to be a no-op - prevents any polling intervals from being set up
jest.mock('@/hooks/use-wrapped-polling', () => ({
  useWrappedPolling: jest.fn(),
}))

const mockGeneratePlexWrapped = generatePlexWrapped as jest.MockedFunction<typeof generatePlexWrapped>
const mockGetUserPlexWrapped = getUserPlexWrapped as jest.MockedFunction<typeof getUserPlexWrapped>

describe('WrappedGenerator', () => {
  const userId = 'test-user-123'
  const currentYear = new Date().getFullYear()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Loading State', () => {
    it('should show loading spinner while fetching wrapped data', async () => {
      // Mock a delayed response
      let resolvePromise: (value: any) => void
      const delayedPromise = new Promise((resolve) => {
        resolvePromise = resolve
      })
      mockGetUserPlexWrapped.mockReturnValue(delayedPromise as any)

      const { container } = render(<WrappedGenerator userId={userId} />)

      // Should show loading spinner
      const spinner = container.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
      expect(spinner).toHaveClass('animate-spin')

      // Resolve the promise
      resolvePromise!(null)

      // Wait for loading to complete
      await waitFor(() => {
        expect(container.querySelector('.animate-spin')).not.toBeInTheDocument()
      })
    })

    it('should show loading state initially before data is fetched', () => {
      mockGetUserPlexWrapped.mockResolvedValue(null)

      const { container } = render(<WrappedGenerator userId={userId} />)

      // Loading spinner should be visible
      expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    })

    it('should not show loading state when userId is not provided', () => {
      const { container } = render(<WrappedGenerator userId="" />)

      // Should not show loading spinner
      expect(container.querySelector('.animate-spin')).not.toBeInTheDocument()
    })
  })

  describe('Empty State', () => {
    it('should show prompt when no wrapped data exists', async () => {
      mockGetUserPlexWrapped.mockResolvedValue(null)

      render(<WrappedGenerator userId={userId} />)

      await waitFor(() => {
        expect(screen.getByTestId('generator-prompt')).toBeInTheDocument()
      })

      expect(screen.getByText(`Generate ${currentYear}`)).toBeInTheDocument()
    })

    it('should show prompt when wrapped data is undefined', async () => {
      mockGetUserPlexWrapped.mockResolvedValue(undefined as any)

      render(<WrappedGenerator userId={userId} />)

      await waitFor(() => {
        expect(screen.getByTestId('generator-prompt')).toBeInTheDocument()
      })
    })

    it('should allow generation when no wrapped exists', async () => {
      const user = userEvent.setup()
      mockGetUserPlexWrapped.mockResolvedValue(null)
      mockGeneratePlexWrapped.mockResolvedValue({ success: true })

      render(<WrappedGenerator userId={userId} />)

      await waitFor(() => {
        expect(screen.getByTestId('generator-prompt')).toBeInTheDocument()
      })

      const generateButton = screen.getByText(`Generate ${currentYear}`)
      await user.click(generateButton)

      expect(mockGeneratePlexWrapped).toHaveBeenCalledWith(userId, currentYear)
    })
  })

  describe('Error State', () => {
    it('should display error when fetching wrapped data fails', async () => {
      const errorMessage = 'Failed to load wrapped'
      mockGetUserPlexWrapped.mockRejectedValue(new Error(errorMessage))

      render(<WrappedGenerator userId={userId} />)

      await waitFor(() => {
        expect(screen.getByTestId('generator-prompt')).toBeInTheDocument()
      })

      // Error should be passed to prompt component
      expect(screen.getByTestId('prompt-error')).toHaveTextContent(errorMessage)
    })

    it('should display error when generation fails', async () => {
      const user = userEvent.setup()
      const errorMessage = 'Generation failed'
      mockGetUserPlexWrapped.mockResolvedValue(null)
      mockGeneratePlexWrapped.mockResolvedValue({ success: false, error: errorMessage })

      render(<WrappedGenerator userId={userId} />)

      await waitFor(() => {
        expect(screen.getByTestId('generator-prompt')).toBeInTheDocument()
      })

      const generateButton = screen.getByText(`Generate ${currentYear}`)
      await user.click(generateButton)

      await waitFor(() => {
        expect(screen.getByTestId('prompt-error')).toHaveTextContent(errorMessage)
      })
    })

    it('should handle non-Error exceptions when fetching', async () => {
      mockGetUserPlexWrapped.mockRejectedValue('String error')

      render(<WrappedGenerator userId={userId} />)

      await waitFor(() => {
        expect(screen.getByTestId('prompt-error')).toHaveTextContent('Failed to load wrapped')
      })
    })

    it('should handle non-Error exceptions when generating', async () => {
      const user = userEvent.setup()
      mockGetUserPlexWrapped.mockResolvedValue(null)
      mockGeneratePlexWrapped.mockRejectedValue('String error')

      render(<WrappedGenerator userId={userId} />)

      await waitFor(() => {
        expect(screen.getByTestId('generator-prompt')).toBeInTheDocument()
      })

      const generateButton = screen.getByText(`Generate ${currentYear}`)
      await user.click(generateButton)

      await waitFor(() => {
        expect(screen.getByTestId('prompt-error')).toHaveTextContent('Failed to generate wrapped')
      })
    })

    it('should display error when generation fails', async () => {
      const user = userEvent.setup()

      // All loads return null (no wrapped data)
      mockGetUserPlexWrapped.mockResolvedValue(null)

      // Generation fails
      mockGeneratePlexWrapped.mockResolvedValueOnce({ success: false, error: 'Generation failed' })

      render(<WrappedGenerator userId={userId} />)

      await waitFor(() => {
        expect(screen.getByTestId('generator-prompt')).toBeInTheDocument()
      })

      // Attempt generation - should fail
      const generateButton = screen.getByText(`Generate ${currentYear}`)
      await user.click(generateButton)

      await waitFor(() => {
        expect(screen.getByTestId('prompt-error')).toHaveTextContent('Generation failed')
      })

      // Verify that error is displayed
      expect(screen.getByText('Generation failed')).toBeInTheDocument()
    })
  })

  describe('Generating State', () => {
    it('should show generating animation when wrapped status is generating', async () => {
      mockGetUserPlexWrapped.mockResolvedValue({
        status: 'generating',
        year: currentYear,
      })

      render(<WrappedGenerator userId={userId} />)

      // Wait for loading to complete first
      await waitFor(() => {
        expect(screen.queryByTestId('generator-prompt')).not.toBeInTheDocument()
      })

      // Then check for generating animation
      await waitFor(() => {
        expect(screen.getByTestId('generating-animation')).toBeInTheDocument()
      })

      expect(screen.getByText(`Generating ${currentYear} (compact)`)).toBeInTheDocument()
    })

    it('should show generating animation while generation is in progress', async () => {
      const user = userEvent.setup()
      // Initial load returns null
      mockGetUserPlexWrapped.mockResolvedValueOnce(null)

      // Mock a slow generation to keep isGenerating true
      let resolveGeneration: (value: any) => void
      const generationPromise = new Promise((resolve) => {
        resolveGeneration = resolve
      })
      mockGeneratePlexWrapped.mockReturnValue(generationPromise as any)

      render(<WrappedGenerator userId={userId} />)

      await waitFor(() => {
        expect(screen.getByTestId('generator-prompt')).toBeInTheDocument()
      })

      const generateButton = screen.getByText(`Generate ${currentYear}`)
      await user.click(generateButton)

      // While generation is in progress, should show animation
      await waitFor(() => {
        expect(screen.getByTestId('generating-animation')).toBeInTheDocument()
      })

      // Clean up - resolve the promise
      resolveGeneration!({ success: true })
      mockGetUserPlexWrapped.mockResolvedValueOnce({ status: 'generating', year: currentYear })
    })

    it('should not allow generation while already generating', async () => {
      mockGetUserPlexWrapped.mockResolvedValue({
        status: 'generating',
        year: currentYear,
      })

      render(<WrappedGenerator userId={userId} />)

      await waitFor(() => {
        expect(screen.getByTestId('generating-animation')).toBeInTheDocument()
      })

      // Prompt should not be visible
      expect(screen.queryByTestId('generator-prompt')).not.toBeInTheDocument()
    })
  })

  describe('Completed State', () => {
    it('should show status component when wrapped is completed', async () => {
      mockGetUserPlexWrapped.mockResolvedValue({
        status: 'completed',
        year: currentYear,
      })

      render(<WrappedGenerator userId={userId} />)

      await waitFor(() => {
        expect(screen.getByTestId('generator-status')).toBeInTheDocument()
      })

      expect(screen.getByText(`Status: completed - Year: ${currentYear}`)).toBeInTheDocument()
    })

    it('should allow regeneration when wrapped is completed', async () => {
      mockGetUserPlexWrapped.mockResolvedValue({
        status: 'completed',
        year: currentYear,
      })

      render(<WrappedGenerator userId={userId} />)

      await waitFor(() => {
        expect(screen.getByTestId('generator-status')).toBeInTheDocument()
      })

      // Status component should receive onRegenerate callback
      expect(screen.getByTestId('generator-status')).toBeInTheDocument()
    })
  })

  describe('Failed State', () => {
    it('should show status component when wrapped generation failed', async () => {
      const errorMessage = 'Generation failed due to timeout'
      mockGetUserPlexWrapped.mockResolvedValue({
        status: 'failed',
        year: currentYear,
        error: errorMessage,
      })

      render(<WrappedGenerator userId={userId} />)

      await waitFor(() => {
        expect(screen.getByTestId('generator-status')).toBeInTheDocument()
      })

      expect(screen.getByText(`Status: failed - Year: ${currentYear}`)).toBeInTheDocument()
      expect(screen.getByTestId('status-error')).toHaveTextContent(errorMessage)
    })

    it('should allow retry when wrapped generation failed', async () => {
      mockGetUserPlexWrapped.mockResolvedValue({
        status: 'failed',
        year: currentYear,
        error: 'Previous error',
      })

      render(<WrappedGenerator userId={userId} />)

      await waitFor(() => {
        expect(screen.getByTestId('generator-status')).toBeInTheDocument()
      })

      // Status component should be rendered with retry capability
      expect(screen.getByTestId('generator-status')).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('should handle missing userId gracefully', async () => {
      render(<WrappedGenerator userId="" />)

      // Should not call getUserPlexWrapped
      expect(mockGetUserPlexWrapped).not.toHaveBeenCalled()

      // Should show prompt without loading
      await waitFor(() => {
        expect(screen.getByTestId('generator-prompt')).toBeInTheDocument()
      })
    })

    it('should handle userId change', async () => {
      mockGetUserPlexWrapped.mockResolvedValue(null)

      const { rerender } = render(<WrappedGenerator userId="user-1" />)

      await waitFor(() => {
        expect(mockGetUserPlexWrapped).toHaveBeenCalledWith('user-1', currentYear)
      })

      // Change userId
      rerender(<WrappedGenerator userId="user-2" />)

      await waitFor(() => {
        expect(mockGetUserPlexWrapped).toHaveBeenCalledWith('user-2', currentYear)
      })
    })

    it('should handle wrapped with unknown status', async () => {
      mockGetUserPlexWrapped.mockResolvedValue({
        status: 'unknown' as any,
        year: currentYear,
      })

      render(<WrappedGenerator userId={userId} />)

      // Should show prompt for unknown status
      await waitFor(() => {
        expect(screen.getByTestId('generator-prompt')).toBeInTheDocument()
      })
    })

    it('should handle wrapped without status property', async () => {
      mockGetUserPlexWrapped.mockResolvedValue({
        year: currentYear,
      } as any)

      render(<WrappedGenerator userId={userId} />)

      // Should show prompt when status is missing
      await waitFor(() => {
        expect(screen.getByTestId('generator-prompt')).toBeInTheDocument()
      })
    })
  })
})

