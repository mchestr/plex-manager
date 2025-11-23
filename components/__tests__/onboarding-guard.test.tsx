import { OnboardingGuard } from '@/components/onboarding/onboarding-guard'
import { getOnboardingStatus } from '@/actions/onboarding'
import { render, screen, waitFor } from '@testing-library/react'
import { usePathname, useRouter } from 'next/navigation'

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
}))

// Mock onboarding actions
jest.mock('@/actions/onboarding', () => ({
  getOnboardingStatus: jest.fn(),
}))

describe('OnboardingGuard', () => {
  const mockPush = jest.fn()
  const mockReplace = jest.fn()
  const mockGetOnboardingStatus = getOnboardingStatus as jest.MockedFunction<typeof getOnboardingStatus>

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      replace: mockReplace,
    })
  })

  describe('when onboarding is complete', () => {
    beforeEach(() => {
      mockGetOnboardingStatus.mockResolvedValue({ isComplete: true })
    })

    it('should render children for any route when onboarding is complete', async () => {
      ;(usePathname as jest.Mock).mockReturnValue('/wrapped')

      render(
        <OnboardingGuard>
          <div>Protected Content</div>
        </OnboardingGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Protected Content')).toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })

    it('should render children for home route', async () => {
      ;(usePathname as jest.Mock).mockReturnValue('/')

      render(
        <OnboardingGuard>
          <div>Home Content</div>
        </OnboardingGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Home Content')).toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })

    it('should render children for admin routes', async () => {
      ;(usePathname as jest.Mock).mockReturnValue('/admin/users')

      render(
        <OnboardingGuard>
          <div>Admin Content</div>
        </OnboardingGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Admin Content')).toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })
  })

  describe('when onboarding is not complete', () => {
    beforeEach(() => {
      mockGetOnboardingStatus.mockResolvedValue({ isComplete: false })
    })

    it('should redirect to /onboarding for protected routes', async () => {
      ;(usePathname as jest.Mock).mockReturnValue('/wrapped')

      render(
        <OnboardingGuard>
          <div>Protected Content</div>
        </OnboardingGuard>
      )

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/onboarding')
      })

      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    })

    it('should redirect to /onboarding for home route', async () => {
      ;(usePathname as jest.Mock).mockReturnValue('/')

      render(
        <OnboardingGuard>
          <div>Home Content</div>
        </OnboardingGuard>
      )

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/onboarding')
      })

      expect(screen.queryByText('Home Content')).not.toBeInTheDocument()
    })

    it('should allow access to /onboarding route', async () => {
      ;(usePathname as jest.Mock).mockReturnValue('/onboarding')

      render(
        <OnboardingGuard>
          <div>Onboarding Content</div>
        </OnboardingGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Onboarding Content')).toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })

    it('should allow access to /auth routes', async () => {
      ;(usePathname as jest.Mock).mockReturnValue('/auth/signin')

      render(
        <OnboardingGuard>
          <div>Auth Content</div>
        </OnboardingGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Auth Content')).toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })

    it('should allow access to /api routes', async () => {
      ;(usePathname as jest.Mock).mockReturnValue('/api/wrapped')

      render(
        <OnboardingGuard>
          <div>API Content</div>
        </OnboardingGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('API Content')).toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })

    it('should allow access to /setup routes', async () => {
      ;(usePathname as jest.Mock).mockReturnValue('/setup')

      render(
        <OnboardingGuard>
          <div>Setup Content</div>
        </OnboardingGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Setup Content')).toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })

    it('should allow access to /invite routes', async () => {
      ;(usePathname as jest.Mock).mockReturnValue('/invite/abc123')

      render(
        <OnboardingGuard>
          <div>Invite Content</div>
        </OnboardingGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Invite Content')).toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })

    it('should allow admin routes even when onboarding incomplete', async () => {
      ;(usePathname as jest.Mock).mockReturnValue('/admin/users')

      render(
        <OnboardingGuard>
          <div>Admin Content</div>
        </OnboardingGuard>
      )

      // /admin routes are allowed even during incomplete onboarding
      await waitFor(() => {
        expect(screen.getByText('Admin Content')).toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('should assume onboarding is complete on error and render children', async () => {
      mockGetOnboardingStatus.mockRejectedValue(new Error('Database error'))
      ;(usePathname as jest.Mock).mockReturnValue('/wrapped')

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

      render(
        <OnboardingGuard>
          <div>Protected Content</div>
        </OnboardingGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Protected Content')).toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error checking onboarding status:',
        expect.any(Error)
      )

      consoleErrorSpy.mockRestore()
    })

    it('should not redirect on error even for protected routes', async () => {
      mockGetOnboardingStatus.mockRejectedValue(new Error('Network error'))
      ;(usePathname as jest.Mock).mockReturnValue('/')

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

      render(
        <OnboardingGuard>
          <div>Home Content</div>
        </OnboardingGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Home Content')).toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()

      consoleErrorSpy.mockRestore()
    })
  })

  describe('loading state', () => {
    it('should show loading screen while checking onboarding status', () => {
      mockGetOnboardingStatus.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ isComplete: true }), 100))
      )
      ;(usePathname as jest.Mock).mockReturnValue('/wrapped')

      render(
        <OnboardingGuard>
          <div>Protected Content</div>
        </OnboardingGuard>
      )

      // Should show loading screen initially
      expect(screen.getByText('Checking account status...')).toBeInTheDocument()
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    })

    it('should render children after checking is complete', async () => {
      mockGetOnboardingStatus.mockResolvedValue({ isComplete: true })
      ;(usePathname as jest.Mock).mockReturnValue('/wrapped')

      render(
        <OnboardingGuard>
          <div>Protected Content</div>
        </OnboardingGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Protected Content')).toBeInTheDocument()
      })
    })
  })

  describe('route changes', () => {
    it('should re-check onboarding status when pathname changes', async () => {
      mockGetOnboardingStatus.mockResolvedValue({ isComplete: true })
      ;(usePathname as jest.Mock).mockReturnValue('/')

      const { rerender } = render(
        <OnboardingGuard>
          <div>Content</div>
        </OnboardingGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Content')).toBeInTheDocument()
      })

      // Change pathname and rerender
      ;(usePathname as jest.Mock).mockReturnValue('/wrapped')
      rerender(
        <OnboardingGuard>
          <div>Content</div>
        </OnboardingGuard>
      )

      await waitFor(() => {
        expect(mockGetOnboardingStatus).toHaveBeenCalledTimes(2)
      })
    })
  })

  describe('edge cases', () => {
    it('should handle nested routes correctly', async () => {
      mockGetOnboardingStatus.mockResolvedValue({ isComplete: false })
      ;(usePathname as jest.Mock).mockReturnValue('/auth/callback/plex')

      render(
        <OnboardingGuard>
          <div>Auth Callback</div>
        </OnboardingGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Auth Callback')).toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })

    it('should handle routes with query parameters', async () => {
      mockGetOnboardingStatus.mockResolvedValue({ isComplete: false })
      ;(usePathname as jest.Mock).mockReturnValue('/setup')

      render(
        <OnboardingGuard>
          <div>Setup Content</div>
        </OnboardingGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Setup Content')).toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })

    it('should handle multiple children', async () => {
      mockGetOnboardingStatus.mockResolvedValue({ isComplete: true })
      ;(usePathname as jest.Mock).mockReturnValue('/wrapped')

      render(
        <OnboardingGuard>
          <div>First Child</div>
          <div>Second Child</div>
        </OnboardingGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('First Child')).toBeInTheDocument()
        expect(screen.getByText('Second Child')).toBeInTheDocument()
      })
    })
  })
})

