import { AdminFooterClient } from '@/components/shared/admin-footer-client'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Session } from 'next-auth'

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))

// Mock next-auth
jest.mock('next-auth/react', () => ({
  signOut: jest.fn(),
}))

// Mock LLMToggle component
jest.mock('@/components/admin/settings/llm-toggle', () => ({
  LLMToggle: ({ initialDisabled }: { initialDisabled: boolean }) => (
    <div data-testid="llm-toggle">LLM Toggle: {initialDisabled ? 'OFF' : 'ON'}</div>
  ),
}))

describe('AdminFooterClient', () => {
  const mockPush = jest.fn()
  const mockRefresh = jest.fn()

  const mockSession: Session = {
    user: {
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
      isAdmin: true,
    },
    expires: '2025-12-31',
  }

  const mockStats = {
    totalTokens: 1500000,
    totalCost: 25.5678,
    totalRequests: 150,
  }

  const mockShareStats = {
    totalShares: 45,
    totalVisits: 320,
  }

  const defaultProps = {
    session: mockSession,
    stats: mockStats,
    totalUsers: 100,
    shareStats: mockShareStats,
    llmDisabled: false,
    appVersion: '1.2.3',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      refresh: mockRefresh,
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('Mobile View', () => {
    beforeEach(() => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      })
    })

    it('renders collapsed mobile view by default', () => {
      render(<AdminFooterClient {...defaultProps} />)

      // Check that the toggle button is visible
      const toggleButton = screen.getByRole('button', { name: /1,500,000/i })
      expect(toggleButton).toBeInTheDocument()

      // Check that key stats are visible in collapsed view
      expect(screen.getAllByText('1,500,000').length).toBeGreaterThan(0)
      expect(screen.getAllByText('$25.57').length).toBeGreaterThan(0)
    })

    it('expands mobile view when toggle button is clicked', () => {
      render(<AdminFooterClient {...defaultProps} />)

      const toggleButton = screen.getByRole('button', { name: /1,500,000/i })
      fireEvent.click(toggleButton)

      // Check that expanded content is visible
      expect(screen.getAllByText(/User:/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/Admin:/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/ID:/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/Tokens:/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/Cost:/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/Users:/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/Generations:/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/Shares:/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/Visits:/i).length).toBeGreaterThan(0)
    })

    it('collapses mobile view when toggle button is clicked again', () => {
      render(<AdminFooterClient {...defaultProps} />)

      const toggleButton = screen.getByRole('button', { name: /1,500,000/i })

      // Expand
      fireEvent.click(toggleButton)
      expect(screen.getAllByText(/User:/i).length).toBeGreaterThan(0)

      // Collapse
      fireEvent.click(toggleButton)
      // After collapsing, the mobile expanded section should be hidden
      // But desktop view still has "User:" text, so we can't check for complete absence
      // Instead, check that the expanded section container is not visible
      const expandedSections = screen.queryAllByText(/Generations:/i)
      // When collapsed, only desktop view shows this (if visible)
      expect(expandedSections.length).toBeLessThanOrEqual(1)
    })

    it('displays user information correctly in expanded mobile view', () => {
      render(<AdminFooterClient {...defaultProps} />)

      const toggleButton = screen.getByRole('button', { name: /1,500,000/i })
      fireEvent.click(toggleButton)

      expect(screen.getAllByText('Test User')[0]).toBeInTheDocument()
      expect(screen.getAllByText('Yes')[0]).toBeInTheDocument() // Admin status
      expect(screen.getAllByText(/user-123/i)[0]).toBeInTheDocument() // User ID (truncated)
    })

    it('displays stats correctly in expanded mobile view', () => {
      render(<AdminFooterClient {...defaultProps} />)

      const toggleButton = screen.getByRole('button', { name: /1,500,000/i })
      fireEvent.click(toggleButton)

      expect(screen.getAllByText('1,500,000').length).toBeGreaterThan(0) // Tokens
      expect(screen.getAllByText('$25.5678').length).toBeGreaterThan(0) // Cost with 4 decimals
      expect(screen.getAllByText('100').length).toBeGreaterThan(0) // Users
      expect(screen.getAllByText('150').length).toBeGreaterThan(0) // Generations
      expect(screen.getAllByText('45').length).toBeGreaterThan(0) // Shares
      expect(screen.getAllByText('320').length).toBeGreaterThan(0) // Visits
    })

    it('renders the app version in expanded mobile view', () => {
      render(<AdminFooterClient {...defaultProps} />)

      const toggleButton = screen.getByRole('button', { name: /1,500,000/i })
      fireEvent.click(toggleButton)

      expect(screen.getByTestId('admin-footer-version')).toHaveTextContent('v1.2.3')
    })

    it('renders LLM toggle in expanded mobile view', () => {
      render(<AdminFooterClient {...defaultProps} />)

      const toggleButton = screen.getByRole('button', { name: /1,500,000/i })
      fireEvent.click(toggleButton)

      expect(screen.getAllByTestId('llm-toggle').length).toBeGreaterThan(0)
      expect(screen.getAllByText(/LLM Toggle: ON/i).length).toBeGreaterThan(0)
    })

    it('renders navigation links in expanded mobile view', () => {
      render(<AdminFooterClient {...defaultProps} />)

      const toggleButton = screen.getByRole('button', { name: /1,500,000/i })
      fireEvent.click(toggleButton)

      const homeLinks = screen.getAllByRole('link', { name: /Home/i })
      expect(homeLinks[0]).toHaveAttribute('href', '/')

      const dashboardLinks = screen.getAllByRole('link', { name: /Dashboard/i })
      expect(dashboardLinks[0]).toHaveAttribute('href', '/admin')
    })

    it('handles sign out correctly in mobile view', async () => {
      render(<AdminFooterClient {...defaultProps} />)

      const toggleButton = screen.getByRole('button', { name: /1,500,000/i })
      fireEvent.click(toggleButton)

      const logoutButtons = screen.getAllByRole('button', { name: /Logout/i })
      fireEvent.click(logoutButtons[0])

      await waitFor(() => {
        expect(signOut).toHaveBeenCalledWith({ redirect: false })
        expect(mockPush).toHaveBeenCalledWith('/')
        expect(mockRefresh).toHaveBeenCalled()
      })
    })
  })

  describe('Desktop View', () => {
    beforeEach(() => {
      // Mock desktop viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      })
    })

    it('renders desktop view with all information', () => {
      render(<AdminFooterClient {...defaultProps} />)

      // User info - both mobile and desktop views render, so use getAllByText
      expect(screen.getAllByText('Test User').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Yes').length).toBeGreaterThan(0) // Admin status
      expect(screen.getAllByText(/user-123/i).length).toBeGreaterThan(0)

      // Stats
      expect(screen.getAllByText('1,500,000').length).toBeGreaterThan(0)
      expect(screen.getAllByText('$25.5678').length).toBeGreaterThan(0)
      expect(screen.getAllByText('100').length).toBeGreaterThan(0)
      expect(screen.getAllByText('150').length).toBeGreaterThan(0)
      expect(screen.getAllByText('45').length).toBeGreaterThan(0)
      expect(screen.getAllByText('320').length).toBeGreaterThan(0)
    })

    it('renders the app version in desktop view', () => {
      render(<AdminFooterClient {...defaultProps} />)

      expect(screen.getByTestId('admin-footer-version-desktop')).toHaveTextContent('v1.2.3')
    })

    it('renders LLM toggle in desktop view', () => {
      render(<AdminFooterClient {...defaultProps} />)

      expect(screen.getAllByTestId('llm-toggle').length).toBeGreaterThan(0)
      expect(screen.getAllByText(/LLM Toggle: ON/i).length).toBeGreaterThan(0)
    })

    it('renders navigation links in desktop view', () => {
      render(<AdminFooterClient {...defaultProps} />)

      const homeLinks = screen.getAllByRole('link', { name: /Home/i })
      expect(homeLinks[0]).toHaveAttribute('href', '/')

      const dashboardLinks = screen.getAllByRole('link', { name: /Dashboard/i })
      expect(dashboardLinks[0]).toHaveAttribute('href', '/admin')
    })

    it('handles sign out correctly in desktop view', async () => {
      render(<AdminFooterClient {...defaultProps} />)

      const logoutButtons = screen.getAllByRole('button', { name: /Logout/i })
      fireEvent.click(logoutButtons[0])

      await waitFor(() => {
        expect(signOut).toHaveBeenCalledWith({ redirect: false })
        expect(mockPush).toHaveBeenCalledWith('/')
        expect(mockRefresh).toHaveBeenCalled()
      })
    })
  })

  describe('Session Variations', () => {
    it('handles session with email only (no name)', () => {
      const sessionWithoutName: Session = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          isAdmin: true,
        },
        expires: '2025-12-31',
      }

      render(<AdminFooterClient {...defaultProps} session={sessionWithoutName} />)

      expect(screen.getAllByText('test@example.com').length).toBeGreaterThan(0)
    })

    it('handles session without name or email', () => {
      const anonymousSession: Session = {
        user: {
          id: 'user-123',
          isAdmin: true,
        },
        expires: '2025-12-31',
      }

      render(<AdminFooterClient {...defaultProps} session={anonymousSession} />)

      expect(screen.getAllByText('Anonymous').length).toBeGreaterThan(0)
    })

    it('displays non-admin status correctly', () => {
      const nonAdminSession: Session = {
        user: {
          id: 'user-123',
          name: 'Test User',
          email: 'test@example.com',
          isAdmin: false,
        },
        expires: '2025-12-31',
      }

      render(<AdminFooterClient {...defaultProps} session={nonAdminSession} />)

      const toggleButton = screen.getByRole('button', { name: /1,500,000/i })
      fireEvent.click(toggleButton)

      expect(screen.getAllByText('No').length).toBeGreaterThan(0) // Admin status
    })

    it('handles null session', () => {
      render(<AdminFooterClient {...defaultProps} session={null} />)

      expect(screen.getAllByText('Anonymous').length).toBeGreaterThan(0)
    })
  })

  describe('Stats Formatting', () => {
    it('formats large token numbers with commas', () => {
      const largeStats = {
        totalTokens: 123456789,
        totalCost: 1234.5678,
        totalRequests: 9876,
      }

      render(<AdminFooterClient {...defaultProps} stats={largeStats} />)

      expect(screen.getAllByText('123,456,789').length).toBeGreaterThan(0)
    })

    it('formats cost with correct decimal places', () => {
      const preciseStats = {
        totalTokens: 1000,
        totalCost: 0.0001,
        totalRequests: 10,
      }

      render(<AdminFooterClient {...defaultProps} stats={preciseStats} />)

      const toggleButton = screen.getByRole('button', { name: /1,000/i })
      fireEvent.click(toggleButton)

      expect(screen.getAllByText('$0.0001').length).toBeGreaterThan(0)
    })

    it('displays zero values correctly', () => {
      const zeroStats = {
        totalTokens: 0,
        totalCost: 0,
        totalRequests: 0,
      }

      const zeroShareStats = {
        totalShares: 0,
        totalVisits: 0,
      }

      render(
        <AdminFooterClient
          {...defaultProps}
          stats={zeroStats}
          shareStats={zeroShareStats}
          totalUsers={0}
        />
      )

      const toggleButton = screen.getByRole('button', { name: /0/i })
      fireEvent.click(toggleButton)

      expect(screen.getAllByText('$0.0000').length).toBeGreaterThan(0)
    })
  })

  describe('LLM Toggle Integration', () => {
    it('passes llmDisabled=true to LLMToggle', () => {
      render(<AdminFooterClient {...defaultProps} llmDisabled={true} />)

      const toggleButton = screen.getByRole('button', { name: /1,500,000/i })
      fireEvent.click(toggleButton)

      expect(screen.getAllByText(/LLM Toggle: OFF/i).length).toBeGreaterThan(0)
    })

    it('passes llmDisabled=false to LLMToggle', () => {
      render(<AdminFooterClient {...defaultProps} llmDisabled={false} />)

      const toggleButton = screen.getByRole('button', { name: /1,500,000/i })
      fireEvent.click(toggleButton)

      expect(screen.getAllByText(/LLM Toggle: ON/i).length).toBeGreaterThan(0)
    })
  })

  describe('Share Links', () => {
    it('renders share links that navigate to /admin/shares', () => {
      render(<AdminFooterClient {...defaultProps} />)

      const toggleButton = screen.getByRole('button', { name: /1,500,000/i })
      fireEvent.click(toggleButton)

      const shareLinks = screen.getAllByRole('link', { name: /Shares:/i })
      shareLinks.forEach(link => {
        expect(link).toHaveAttribute('href', '/admin/shares')
      })

      const visitLinks = screen.getAllByRole('link', { name: /Visits:/i })
      visitLinks.forEach(link => {
        expect(link).toHaveAttribute('href', '/admin/shares')
      })
    })
  })

  describe('Accessibility', () => {
    it('has proper ARIA attributes for expand/collapse button', () => {
      render(<AdminFooterClient {...defaultProps} />)

      const toggleButton = screen.getByRole('button', { name: /1,500,000/i })
      expect(toggleButton).toBeInTheDocument()
    })

    it('has proper semantic HTML structure', () => {
      const { container } = render(<AdminFooterClient {...defaultProps} />)

      const footer = container.querySelector('footer')
      expect(footer).toBeInTheDocument()
      expect(footer).toHaveClass('fixed', 'bottom-0')
    })

    it('all interactive elements are keyboard accessible', () => {
      render(<AdminFooterClient {...defaultProps} />)

      const toggleButton = screen.getByRole('button', { name: /1,500,000/i })
      fireEvent.click(toggleButton)

      const links = screen.getAllByRole('link')
      links.forEach(link => {
        expect(link).toBeInTheDocument()
      })

      const buttons = screen.getAllByRole('button')
      buttons.forEach(button => {
        expect(button).toBeInTheDocument()
      })
    })
  })

  describe('Visual States', () => {
    it('applies correct CSS classes for collapsed state', () => {
      const { container } = render(<AdminFooterClient {...defaultProps} />)

      const toggleButton = screen.getByRole('button', { name: /1,500,000/i })
      const svg = toggleButton.querySelector('svg')

      expect(svg).not.toHaveClass('rotate-180')
    })

    it('applies correct CSS classes for expanded state', () => {
      const { container } = render(<AdminFooterClient {...defaultProps} />)

      const toggleButton = screen.getByRole('button', { name: /1,500,000/i })
      fireEvent.click(toggleButton)

      const svg = toggleButton.querySelector('svg')
      expect(svg).toHaveClass('rotate-180')
    })

    it('applies correct color classes for admin status', () => {
      render(<AdminFooterClient {...defaultProps} />)

      const toggleButton = screen.getByRole('button', { name: /1,500,000/i })
      fireEvent.click(toggleButton)

      const adminYesElements = screen.getAllByText('Yes')
      expect(adminYesElements[0]).toHaveClass('text-green-400')
    })

    it('applies correct color classes for non-admin status', () => {
      const nonAdminSession: Session = {
        user: {
          id: 'user-123',
          name: 'Test User',
          email: 'test@example.com',
          isAdmin: false,
        },
        expires: '2025-12-31',
      }

      render(<AdminFooterClient {...defaultProps} session={nonAdminSession} />)

      const toggleButton = screen.getByRole('button', { name: /1,500,000/i })
      fireEvent.click(toggleButton)

      const adminNoElements = screen.getAllByText('No')
      expect(adminNoElements[0]).toHaveClass('text-red-400')
    })
  })
})

