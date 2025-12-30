import { render, screen, waitFor } from '@testing-library/react'
import { WrappedPageClient } from '@/components/wrapped/wrapped-page-client'
import { ToastProvider } from '@/components/ui/sonner'
import * as userActions from '@/actions/users'

// Mock the user actions
jest.mock('@/actions/users', () => ({
  getUserPlexWrapped: jest.fn(),
}))

// Mock next/navigation
const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}))

// Mock WrappedGeneratingAnimation
jest.mock('@/components/generator/wrapped-generating-animation', () => ({
  WrappedGeneratingAnimation: ({ year }: { year: number }) => (
    <div data-testid="generating-animation">Generating {year} Wrapped</div>
  ),
}))

const renderWithProviders = (component: React.ReactElement) => {
  return render(<ToastProvider>{component}</ToastProvider>)
}

describe('WrappedPageClient', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  it('should show generating animation when status is generating', () => {
    renderWithProviders(<WrappedPageClient userId="user-1" year={2024} initialStatus="generating" />)

    expect(screen.getByTestId('generating-animation')).toBeInTheDocument()
    expect(screen.getByText('Generating 2024 Wrapped')).toBeInTheDocument()
  })

  it('should not show animation when status is not generating', () => {
    renderWithProviders(<WrappedPageClient userId="user-1" year={2024} initialStatus="completed" />)

    expect(screen.queryByTestId('generating-animation')).not.toBeInTheDocument()
  })

  it('should poll for status updates when generating', async () => {
    const mockGetWrapped = jest.spyOn(userActions, 'getUserPlexWrapped')
      .mockResolvedValue({
        id: 'wrapped-1',
        status: 'generating',
        year: 2024,
      } as any)

    renderWithProviders(<WrappedPageClient userId="user-1" year={2024} initialStatus="generating" />)

    // Advance timer to trigger first poll
    jest.advanceTimersByTime(2000)

    await waitFor(() => {
      expect(mockGetWrapped).toHaveBeenCalledWith('user-1', 2024)
    })
  })

  it('should refresh page when status changes to completed', async () => {
    const mockGetWrapped = jest.spyOn(userActions, 'getUserPlexWrapped')
      .mockResolvedValue({
        id: 'wrapped-1',
        status: 'completed',
        year: 2024,
      } as any)

    renderWithProviders(<WrappedPageClient userId="user-1" year={2024} initialStatus="generating" />)

    // First poll
    jest.advanceTimersByTime(2000)

    await waitFor(() => {
      expect(mockGetWrapped).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled()
    })
  })

  it('should refresh page when status changes to failed', async () => {
    const mockGetWrapped = jest.spyOn(userActions, 'getUserPlexWrapped')
      .mockResolvedValue({
        id: 'wrapped-1',
        status: 'failed',
        error: 'Generation failed',
        year: 2024,
      } as any)

    renderWithProviders(<WrappedPageClient userId="user-1" year={2024} initialStatus="generating" />)

    // First poll
    jest.advanceTimersByTime(2000)

    await waitFor(() => {
      expect(mockGetWrapped).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled()
    })
  })

  it('should continue polling while status is generating', async () => {
    const mockGetWrapped = jest.spyOn(userActions, 'getUserPlexWrapped')
      .mockResolvedValue({
        id: 'wrapped-1',
        status: 'generating',
        year: 2024,
      } as any)

    renderWithProviders(<WrappedPageClient userId="user-1" year={2024} initialStatus="generating" />)

    // First poll
    jest.advanceTimersByTime(2000)
    await waitFor(() => {
      expect(mockGetWrapped).toHaveBeenCalledTimes(1)
    })

    // Second poll
    jest.advanceTimersByTime(2000)
    await waitFor(() => {
      expect(mockGetWrapped).toHaveBeenCalledTimes(2)
    })

    // Third poll
    jest.advanceTimersByTime(2000)
    await waitFor(() => {
      expect(mockGetWrapped).toHaveBeenCalledTimes(3)
    })
  })

  it('should stop polling when status is not generating', async () => {
    const mockGetWrapped = jest.spyOn(userActions, 'getUserPlexWrapped')
      .mockResolvedValue({
        id: 'wrapped-1',
        status: 'completed',
        year: 2024,
      } as any)

    renderWithProviders(<WrappedPageClient userId="user-1" year={2024} initialStatus="generating" />)

    // First poll - will change status to completed and stop polling
    jest.advanceTimersByTime(2000)
    await waitFor(() => {
      expect(mockGetWrapped).toHaveBeenCalled()
    })

    const callCount = mockGetWrapped.mock.calls.length

    // Advance timer - should not poll anymore after status changed
    jest.advanceTimersByTime(4000)

    // Should not have made additional calls
    expect(mockGetWrapped).toHaveBeenCalledTimes(callCount)
  })

  it('should handle polling errors gracefully', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation()
    jest.spyOn(userActions, 'getUserPlexWrapped')
      .mockRejectedValue(new Error('Network error'))

    renderWithProviders(<WrappedPageClient userId="user-1" year={2024} initialStatus="generating" />)

    // Advance timer to trigger poll
    jest.advanceTimersByTime(2000)

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        'Error polling wrapped status:',
        expect.any(Error)
      )
    })

    consoleError.mockRestore()
  })

  it('should cleanup polling interval on unmount', async () => {
    jest.spyOn(userActions, 'getUserPlexWrapped')
      .mockResolvedValue({
        id: 'wrapped-1',
        status: 'generating',
        year: 2024,
      } as any)

    const { unmount } = renderWithProviders(
      <WrappedPageClient userId="user-1" year={2024} initialStatus="generating" />
    )

    unmount()

    // Advance timer after unmount - should not cause errors
    jest.advanceTimersByTime(2000)

    // No assertions needed - just ensuring no errors occur
  })

  it('should update status when wrapped data status changes', async () => {
    const mockGetWrapped = jest.spyOn(userActions, 'getUserPlexWrapped')
      .mockResolvedValue({
        id: 'wrapped-1',
        status: 'completed',
        year: 2024,
      } as any)

    renderWithProviders(<WrappedPageClient userId="user-1" year={2024} initialStatus="generating" />)

    expect(screen.getByTestId('generating-animation')).toBeInTheDocument()

    // Advance timer to trigger poll
    jest.advanceTimersByTime(2000)

    await waitFor(() => {
      expect(mockGetWrapped).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled()
    })
  })

  it('should handle null wrapped data from polling', async () => {
    jest.spyOn(userActions, 'getUserPlexWrapped')
      .mockResolvedValue(null)

    renderWithProviders(<WrappedPageClient userId="user-1" year={2024} initialStatus="generating" />)

    // Advance timer to trigger poll
    jest.advanceTimersByTime(2000)

    await waitFor(() => {
      // Should continue showing generating animation
      expect(screen.getByTestId('generating-animation')).toBeInTheDocument()
    })
  })

  it('should poll at 2 second intervals', async () => {
    const mockGetWrapped = jest.spyOn(userActions, 'getUserPlexWrapped')
      .mockResolvedValue({
        id: 'wrapped-1',
        status: 'generating',
        year: 2024,
      } as any)

    renderWithProviders(<WrappedPageClient userId="user-1" year={2024} initialStatus="generating" />)

    // Should not have polled yet
    expect(mockGetWrapped).not.toHaveBeenCalled()

    // After 2 seconds
    jest.advanceTimersByTime(2000)
    await waitFor(() => {
      expect(mockGetWrapped).toHaveBeenCalledTimes(1)
    })

    // After another 2 seconds
    jest.advanceTimersByTime(2000)
    await waitFor(() => {
      expect(mockGetWrapped).toHaveBeenCalledTimes(2)
    })
  })

  it('should not poll when initial status is not generating', () => {
    const mockGetWrapped = jest.spyOn(userActions, 'getUserPlexWrapped')

    renderWithProviders(<WrappedPageClient userId="user-1" year={2024} initialStatus="completed" />)

    // Advance timer
    jest.advanceTimersByTime(5000)

    // Should not have polled
    expect(mockGetWrapped).not.toHaveBeenCalled()
  })
})

