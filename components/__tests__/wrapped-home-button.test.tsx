import * as userActions from '@/actions/users'
import { ToastProvider } from '@/components/ui/toast'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'

// Mock the admin actions first (before component import)
jest.mock('@/actions/admin', () => ({
  getWrappedSettings: jest.fn(),
}))

// Mock the user actions
jest.mock('@/actions/users', () => ({
  getUserPlexWrapped: jest.fn(),
  generatePlexWrapped: jest.fn(),
}))

// Mock next/navigation
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

// Mock WrappedGeneratingAnimation
jest.mock('../generator/wrapped-generating-animation', () => ({
  WrappedGeneratingAnimation: ({ year }: { year: number }) => (
    <div data-testid="generating-animation">Generating {year} Wrapped</div>
  ),
}))

// Mock WrappedShareButton
jest.mock('../wrapped/wrapped-share-button', () => ({
  WrappedShareButton: ({ shareToken, year }: { shareToken: string; year: number }) => (
    <div data-testid="share-button">Share {year}</div>
  ),
}))

// Import component after mocks
import * as adminActions from '@/actions/admin'
import { WrappedHomeButton } from '@/components/wrapped/wrapped-home-button'

const renderWithToast = (component: React.ReactElement) => {
  return render(<ToastProvider>{component}</ToastProvider>)
}

describe('WrappedHomeButton', () => {
  const currentYear = new Date().getFullYear()

  beforeEach(() => {
    jest.clearAllMocks()
    // Default mock for getWrappedSettings
    jest.spyOn(adminActions, 'getWrappedSettings').mockResolvedValue({
      wrappedEnabled: true,
      wrappedYear: currentYear,
    })
  })

  describe('Rendering States', () => {
    it('should render generate button when no wrapped exists', async () => {
      jest.spyOn(userActions, 'getUserPlexWrapped').mockResolvedValue(null)

      renderWithToast(<WrappedHomeButton userId="user-1" serverName="My Server" />)

      await waitFor(() => {
        expect(screen.getByText(/My Server/i)).toBeInTheDocument()
        expect(screen.getByText(`Generate My ${currentYear} Wrapped`)).toBeInTheDocument()
      })
    })

    it('should show loading state initially', async () => {
      jest.spyOn(userActions, 'getUserPlexWrapped').mockImplementation(
        () => new Promise(() => {}) // Never resolves
      )

      renderWithToast(<WrappedHomeButton userId="user-1" serverName="My Server" />)

      await waitFor(() => {
        const spinner = document.querySelector('.animate-spin')
        expect(spinner).toBeInTheDocument()
      })
    })

    it('should show view wrapped button when wrapped is completed', async () => {
      jest.spyOn(userActions, 'getUserPlexWrapped').mockResolvedValue({
        id: 'wrapped-1',
        status: 'completed',
        year: currentYear,
        shareToken: 'test-token',
      } as any)

      renderWithToast(<WrappedHomeButton userId="user-1" serverName="My Server" />)

      const viewButton = await screen.findByText("Let's Get Started!", {}, { timeout: 2000 })
      expect(viewButton).toBeInTheDocument()
    })

    it('should show try again button when wrapped failed', async () => {
      jest.spyOn(userActions, 'getUserPlexWrapped').mockResolvedValue({
        id: 'wrapped-1',
        status: 'failed',
        error: 'Generation failed',
        year: currentYear,
      } as any)

      renderWithToast(<WrappedHomeButton userId="user-1" serverName="My Server" />)

      await waitFor(() => {
        expect(screen.getByText('Try Again')).toBeInTheDocument()
        expect(screen.getByText('Generation failed')).toBeInTheDocument()
      })
    })

    it('should show generating animation when generating', async () => {
      jest.spyOn(userActions, 'getUserPlexWrapped').mockResolvedValue({
        id: 'wrapped-1',
        status: 'generating',
        year: currentYear,
      } as any)

      renderWithToast(<WrappedHomeButton userId="user-1" serverName="My Server" />)

      await waitFor(() => {
        expect(screen.getByTestId('generating-animation')).toBeInTheDocument()
      })
    })
  })

  describe('User Interactions', () => {
    it('should render generate button when no wrapped exists', async () => {
      jest.spyOn(userActions, 'getUserPlexWrapped').mockResolvedValue(null)

      renderWithToast(<WrappedHomeButton userId="user-1" serverName="My Server" />)

      // Wait for button to appear (settings must load first)
      const generateButton = await screen.findByText(
        `Generate My ${currentYear} Wrapped`,
        {},
        { timeout: 2000 }
      )

      // Button should exist and be a button element
      expect(generateButton).toBeDefined()
      expect(generateButton.tagName).toBe('BUTTON')
    })
  })

  describe('Edge Cases', () => {
    it('should not load wrapped when userId is not provided', () => {
      const mockGetWrapped = jest.spyOn(userActions, 'getUserPlexWrapped')

      renderWithToast(<WrappedHomeButton userId="" serverName="My Server" />)

      // Should not call getUserPlexWrapped with empty userId
      expect(mockGetWrapped).not.toHaveBeenCalled()
    })

    it('should show only server name when wrapped settings not enabled', async () => {
      jest.spyOn(adminActions, 'getWrappedSettings').mockResolvedValue({
        wrappedEnabled: false,
        wrappedYear: currentYear,
      })
      jest.spyOn(userActions, 'getUserPlexWrapped').mockResolvedValue(null)

      renderWithToast(<WrappedHomeButton userId="user-1" serverName="My Server" />)

      await waitFor(() => {
        // Component should show server name but no disabled message
        expect(screen.getByText(/My Server/i)).toBeInTheDocument()
        // Check that the disabled message is NOT present
        expect(screen.queryByText(/Wrapped generation is currently disabled/i)).not.toBeInTheDocument()
        // Check that wrapped generation button is NOT shown
        expect(screen.queryByText(`Generate My ${currentYear} Wrapped`)).not.toBeInTheDocument()
      })
    })
  })
})
