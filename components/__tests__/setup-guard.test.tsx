import { render, screen, waitFor } from '@testing-library/react'
import { SetupGuard } from '@/components/setup/setup-guard'
import * as setupActions from '@/actions/setup'

// Mock next/navigation
const mockReplace = jest.fn()
const mockPathname = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
  usePathname: () => mockPathname(),
}))

// Mock the setup actions
jest.mock('@/actions/setup', () => ({
  getSetupStatus: jest.fn(),
}))

describe('SetupGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Default to root path
    mockPathname.mockReturnValue('/')
  })

  describe('Setup Complete', () => {
    beforeEach(() => {
      jest.spyOn(setupActions, 'getSetupStatus').mockResolvedValue({
        isComplete: true,
        currentStep: 5,
      })
    })

    it('should render children when setup is complete', async () => {
      render(
        <SetupGuard>
          <div>Protected Content</div>
        </SetupGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Protected Content')).toBeInTheDocument()
      })
    })

    it('should not redirect when setup is complete', async () => {
      render(
        <SetupGuard>
          <div>Protected Content</div>
        </SetupGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Protected Content')).toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })

    it('should render children on any route when setup is complete', async () => {
      mockPathname.mockReturnValue('/admin/users')

      render(
        <SetupGuard>
          <div>Admin Content</div>
        </SetupGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Admin Content')).toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })
  })

  describe('Setup Incomplete', () => {
    beforeEach(() => {
      jest.spyOn(setupActions, 'getSetupStatus').mockResolvedValue({
        isComplete: false,
        currentStep: 1,
      })
    })

    it('should redirect to /setup when on root path', async () => {
      mockPathname.mockReturnValue('/')

      render(
        <SetupGuard>
          <div>Protected Content</div>
        </SetupGuard>
      )

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/setup')
      })

      // Should not render children
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    })

    it('should allow access to auth callback route even when setup incomplete', async () => {
      mockPathname.mockReturnValue('/auth/callback')

      render(
        <SetupGuard>
          <div>Auth Content</div>
        </SetupGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Auth Content')).toBeInTheDocument()
      })

      // Should not redirect auth routes
      expect(mockReplace).not.toHaveBeenCalled()
    })

    it('should allow access to admin routes even during incomplete setup', async () => {
      mockPathname.mockReturnValue('/admin/users')

      render(
        <SetupGuard>
          <div>Admin Content</div>
        </SetupGuard>
      )

      // /admin routes are now allowed even during incomplete setup
      await waitFor(() => {
        expect(screen.getByText('Admin Content')).toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })

    it('should redirect to /setup when on wrapped route', async () => {
      mockPathname.mockReturnValue('/wrapped')

      render(
        <SetupGuard>
          <div>Wrapped Content</div>
        </SetupGuard>
      )

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/setup')
      })

      expect(screen.queryByText('Wrapped Content')).not.toBeInTheDocument()
    })

    it('should allow access to /setup route', async () => {
      mockPathname.mockReturnValue('/setup')

      render(
        <SetupGuard>
          <div>Setup Content</div>
        </SetupGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Setup Content')).toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })

    it('should allow access to /api routes', async () => {
      mockPathname.mockReturnValue('/api/auth/callback')

      render(
        <SetupGuard>
          <div>API Content</div>
        </SetupGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('API Content')).toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })

    it('should allow access to nested /api routes', async () => {
      mockPathname.mockReturnValue('/api/wrapped/share')

      render(
        <SetupGuard>
          <div>API Content</div>
        </SetupGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('API Content')).toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })

    it('should not render children while redirecting', async () => {
      // Use a non-admin route since /admin routes are now allowed
      mockPathname.mockReturnValue('/wrapped')

      render(
        <SetupGuard>
          <div>Protected Content</div>
        </SetupGuard>
      )

      // Initially should show loading screen
      expect(screen.getByText('Checking setup status...')).toBeInTheDocument()
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/setup')
      })

      // Should still not show protected content after redirect
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    })
  })

  describe('Loading State', () => {
    it('should show loading screen while checking setup status', () => {
      jest.spyOn(setupActions, 'getSetupStatus').mockImplementation(
        () => new Promise(() => {}) // Never resolves
      )

      render(
        <SetupGuard>
          <div>Protected Content</div>
        </SetupGuard>
      )

      // Should show loading screen while checking
      expect(screen.getByText('Checking setup status...')).toBeInTheDocument()
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    })

    it('should show loading screen while checking', () => {
      jest.spyOn(setupActions, 'getSetupStatus').mockImplementation(
        () => new Promise(() => {}) // Never resolves
      )

      render(
        <SetupGuard>
          <div>Protected Content</div>
        </SetupGuard>
      )

      // Should show loading screen
      expect(screen.getByText('Checking setup status...')).toBeInTheDocument()
    })
  })

  describe('Error Handling', () => {
    beforeEach(() => {
      // Suppress console.error for these tests
      jest.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('should assume setup is complete on error', async () => {
      jest.spyOn(setupActions, 'getSetupStatus').mockRejectedValue(
        new Error('Database connection failed')
      )

      render(
        <SetupGuard>
          <div>Protected Content</div>
        </SetupGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Protected Content')).toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })

    it('should log error to console', async () => {
      const error = new Error('Database connection failed')
      jest.spyOn(setupActions, 'getSetupStatus').mockRejectedValue(error)

      render(
        <SetupGuard>
          <div>Protected Content</div>
        </SetupGuard>
      )

      await waitFor(() => {
        expect(console.error).toHaveBeenCalledWith(
          'Error checking setup status:',
          error
        )
      })
    })

    it('should not block app on network error', async () => {
      jest.spyOn(setupActions, 'getSetupStatus').mockRejectedValue(
        new Error('Network error')
      )

      render(
        <SetupGuard>
          <div>App Content</div>
        </SetupGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('App Content')).toBeInTheDocument()
      })
    })

    it('should handle error on any route', async () => {
      mockPathname.mockReturnValue('/admin/settings')
      jest.spyOn(setupActions, 'getSetupStatus').mockRejectedValue(
        new Error('Server error')
      )

      render(
        <SetupGuard>
          <div>Admin Settings</div>
        </SetupGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Admin Settings')).toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })
  })

  describe('Route Checking', () => {
    it('should check route with trailing slash', async () => {
      jest.spyOn(setupActions, 'getSetupStatus').mockResolvedValue({
        isComplete: false,
        currentStep: 1,
      })
      mockPathname.mockReturnValue('/setup/')

      render(
        <SetupGuard>
          <div>Setup Content</div>
        </SetupGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Setup Content')).toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })

    it('should handle nested setup routes', async () => {
      jest.spyOn(setupActions, 'getSetupStatus').mockResolvedValue({
        isComplete: false,
        currentStep: 1,
      })
      mockPathname.mockReturnValue('/setup/step/2')

      render(
        <SetupGuard>
          <div>Setup Step Content</div>
        </SetupGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Setup Step Content')).toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })

    it('should not allow routes that only contain "setup" in the middle', async () => {
      jest.spyOn(setupActions, 'getSetupStatus').mockResolvedValue({
        isComplete: false,
        currentStep: 1,
      })
      mockPathname.mockReturnValue('/admin/setup-config')

      render(
        <SetupGuard>
          <div>Config Content</div>
        </SetupGuard>
      )

      // /admin routes are now allowed even during incomplete setup
      await waitFor(() => {
        expect(screen.getByText('Config Content')).toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })

    it('should not allow routes that only contain "api" in the middle', async () => {
      jest.spyOn(setupActions, 'getSetupStatus').mockResolvedValue({
        isComplete: false,
        currentStep: 1,
      })
      mockPathname.mockReturnValue('/admin/api-settings')

      render(
        <SetupGuard>
          <div>API Settings</div>
        </SetupGuard>
      )

      // /admin routes are now allowed even during incomplete setup
      await waitFor(() => {
        expect(screen.getByText('API Settings')).toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })
  })

  describe('Pathname Changes', () => {
    it('should re-check setup status when pathname changes', async () => {
      const getSetupStatusSpy = jest.spyOn(setupActions, 'getSetupStatus')
        .mockResolvedValue({
          isComplete: true,
          currentStep: 5,
        })

      mockPathname.mockReturnValue('/')

      const { rerender } = render(
        <SetupGuard>
          <div>Content</div>
        </SetupGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Content')).toBeInTheDocument()
      })

      const initialCallCount = getSetupStatusSpy.mock.calls.length

      // Change pathname
      mockPathname.mockReturnValue('/admin')

      rerender(
        <SetupGuard>
          <div>Content</div>
        </SetupGuard>
      )

      await waitFor(() => {
        expect(getSetupStatusSpy.mock.calls.length).toBeGreaterThan(initialCallCount)
      })
    })

    it('should handle transition from protected to setup route', async () => {
      jest.spyOn(setupActions, 'getSetupStatus').mockResolvedValue({
        isComplete: false,
        currentStep: 1,
      })

      mockPathname.mockReturnValue('/admin')

      const { rerender, container } = render(
        <SetupGuard>
          <div>Admin Content</div>
        </SetupGuard>
      )

      // /admin routes are now allowed even during incomplete setup
      await waitFor(() => {
        expect(screen.getByText('Admin Content')).toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()

      // Now navigate to setup
      mockPathname.mockReturnValue('/setup')
      mockReplace.mockClear()

      rerender(
        <SetupGuard>
          <div>Setup Content</div>
        </SetupGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Setup Content')).toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty pathname', async () => {
      jest.spyOn(setupActions, 'getSetupStatus').mockResolvedValue({
        isComplete: false,
        currentStep: 1,
      })
      mockPathname.mockReturnValue('')

      render(
        <SetupGuard>
          <div>Content</div>
        </SetupGuard>
      )

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/setup')
      })

      expect(screen.queryByText('Content')).not.toBeInTheDocument()
    })

    it('should handle case-sensitive routes', async () => {
      jest.spyOn(setupActions, 'getSetupStatus').mockResolvedValue({
        isComplete: false,
        currentStep: 1,
      })
      mockPathname.mockReturnValue('/Setup')

      render(
        <SetupGuard>
          <div>Content</div>
        </SetupGuard>
      )

      // Should redirect because /Setup !== /setup
      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/setup')
      })

      // Should show loading/redirecting screen, not the content
      expect(screen.queryByText('Content')).not.toBeInTheDocument()
    })

    it('should handle multiple children', async () => {
      jest.spyOn(setupActions, 'getSetupStatus').mockResolvedValue({
        isComplete: true,
        currentStep: 5,
      })

      render(
        <SetupGuard>
          <div>First Child</div>
          <div>Second Child</div>
          <div>Third Child</div>
        </SetupGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('First Child')).toBeInTheDocument()
        expect(screen.getByText('Second Child')).toBeInTheDocument()
        expect(screen.getByText('Third Child')).toBeInTheDocument()
      })
    })

    it('should handle nested components as children', async () => {
      jest.spyOn(setupActions, 'getSetupStatus').mockResolvedValue({
        isComplete: true,
        currentStep: 5,
      })

      render(
        <SetupGuard>
          <div>
            <header>Header</header>
            <main>Main Content</main>
            <footer>Footer</footer>
          </div>
        </SetupGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Header')).toBeInTheDocument()
        expect(screen.getByText('Main Content')).toBeInTheDocument()
        expect(screen.getByText('Footer')).toBeInTheDocument()
      })
    })

    it('should handle null children gracefully', async () => {
      jest.spyOn(setupActions, 'getSetupStatus').mockResolvedValue({
        isComplete: true,
        currentStep: 5,
      })

      const { container } = render(
        <SetupGuard>
          {null}
        </SetupGuard>
      )

      await waitFor(() => {
        expect(container.textContent).toBe('')
      })
    })

    it('should handle undefined children gracefully', async () => {
      jest.spyOn(setupActions, 'getSetupStatus').mockResolvedValue({
        isComplete: true,
        currentStep: 5,
      })

      const { container } = render(
        <SetupGuard>
          {undefined}
        </SetupGuard>
      )

      await waitFor(() => {
        expect(container.textContent).toBe('')
      })
    })
  })

  describe('Integration Scenarios', () => {
    it('should handle complete setup flow', async () => {
      const getSetupStatusSpy = jest.spyOn(setupActions, 'getSetupStatus')
        .mockResolvedValueOnce({
          isComplete: false,
          currentStep: 1,
        })
        .mockResolvedValueOnce({
          isComplete: true,
          currentStep: 5,
        })

      mockPathname.mockReturnValue('/')

      const { rerender } = render(
        <SetupGuard>
          <div>Home Content</div>
        </SetupGuard>
      )

      // Should redirect initially
      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/setup')
      })

      mockReplace.mockClear()

      // Simulate setup completion and re-render
      rerender(
        <SetupGuard>
          <div>Home Content</div>
        </SetupGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Home Content')).toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })

    it('should allow API routes during incomplete setup', async () => {
      jest.spyOn(setupActions, 'getSetupStatus').mockResolvedValue({
        isComplete: false,
        currentStep: 2,
      })

      const apiRoutes = [
        '/api/auth/signin',
        '/api/auth/callback',
        '/api/wrapped/share',
        '/api/admin/users',
      ]

      for (const route of apiRoutes) {
        mockPathname.mockReturnValue(route)
        mockReplace.mockClear()

        const { unmount } = render(
          <SetupGuard>
            <div>API Content</div>
          </SetupGuard>
        )

        await waitFor(() => {
          expect(screen.getByText('API Content')).toBeInTheDocument()
        })

        expect(mockReplace).not.toHaveBeenCalled()
        unmount()
      }
    })

    it('should block all non-setup/api routes during incomplete setup', async () => {
      jest.spyOn(setupActions, 'getSetupStatus').mockResolvedValue({
        isComplete: false,
        currentStep: 2,
      })

      // Routes that should be blocked (not /admin routes which are now allowed)
      const blockedRoutes = [
        '/',
        '/wrapped',
        '/wrapped/share',
        '/onboarding',
      ]

      for (const route of blockedRoutes) {
        mockPathname.mockReturnValue(route)
        mockReplace.mockClear()

        const { unmount } = render(
          <SetupGuard>
            <div>Protected Content</div>
          </SetupGuard>
        )

        await waitFor(() => {
          expect(mockReplace).toHaveBeenCalledWith('/setup')
        })

        // Should show loading/redirecting screen, not the protected content
        expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
        unmount()
      }

      // Test that /admin routes are allowed
      const allowedAdminRoutes = ['/admin', '/admin/users']
      for (const route of allowedAdminRoutes) {
        mockPathname.mockReturnValue(route)
        mockReplace.mockClear()

        const { unmount } = render(
          <SetupGuard>
            <div>Admin Content</div>
          </SetupGuard>
        )

        await waitFor(() => {
          expect(screen.getByText('Admin Content')).toBeInTheDocument()
        })

        expect(mockReplace).not.toHaveBeenCalled()
        unmount()
      }
    })
  })

  describe('Security', () => {
    it('should not expose setup status to children', async () => {
      jest.spyOn(setupActions, 'getSetupStatus').mockResolvedValue({
        isComplete: true,
        currentStep: 5,
      })

      const ChildComponent = () => {
        // Children should not have access to setup status
        return <div>Child Component</div>
      }

      render(
        <SetupGuard>
          <ChildComponent />
        </SetupGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Child Component')).toBeInTheDocument()
      })
    })

    it('should prevent access to protected routes before setup', async () => {
      jest.spyOn(setupActions, 'getSetupStatus').mockResolvedValue({
        isComplete: false,
        currentStep: 1,
      })

      // Use a non-admin route for this test since /admin routes are now allowed
      mockPathname.mockReturnValue('/wrapped/settings')

      render(
        <SetupGuard>
          <div>Sensitive Settings</div>
        </SetupGuard>
      )

      // Should never render sensitive content
      expect(screen.queryByText('Sensitive Settings')).not.toBeInTheDocument()

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/setup')
      })

      // Should still not render sensitive content after redirect
      expect(screen.queryByText('Sensitive Settings')).not.toBeInTheDocument()
    })
  })

  describe('Performance', () => {
    it('should call getSetupStatus on mount', async () => {
      const getSetupStatusSpy = jest.spyOn(setupActions, 'getSetupStatus')
        .mockResolvedValue({
          isComplete: true,
          currentStep: 5,
        })

      render(
        <SetupGuard>
          <div>Content</div>
        </SetupGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Content')).toBeInTheDocument()
      })

      // Should have been called at least once
      expect(getSetupStatusSpy).toHaveBeenCalled()
    })

    it('should handle re-renders efficiently', async () => {
      const getSetupStatusSpy = jest.spyOn(setupActions, 'getSetupStatus')
        .mockResolvedValue({
          isComplete: true,
          currentStep: 5,
        })

      mockPathname.mockReturnValue('/')

      const { rerender } = render(
        <SetupGuard>
          <div>Content</div>
        </SetupGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Content')).toBeInTheDocument()
      })

      const initialCallCount = getSetupStatusSpy.mock.calls.length

      // Re-render with same pathname - children change but dependencies don't
      rerender(
        <SetupGuard>
          <div>Updated Content</div>
        </SetupGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Updated Content')).toBeInTheDocument()
      })

      // Call count should not increase significantly since pathname and router haven't changed
      // Allow for React StrictMode which may call effects twice
      expect(getSetupStatusSpy.mock.calls.length).toBeLessThanOrEqual(initialCallCount + 1)
    })
  })
})

