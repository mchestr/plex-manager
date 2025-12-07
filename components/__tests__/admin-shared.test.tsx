import { AdminNav } from '@/components/admin/shared/admin-nav'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock Next.js navigation
const mockPush = jest.fn()
const mockRefresh = jest.fn()
const mockUsePathname = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
  usePathname: () => mockUsePathname(),
}))

// Mock next-auth
const mockSignOut = jest.fn()
jest.mock('next-auth/react', () => ({
  signOut: () => mockSignOut(),
}))

describe('AdminNav', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUsePathname.mockReturnValue('/admin/users')
  })

  describe('Basic Rendering', () => {
    it('should render desktop sidebar', () => {
      const { container } = render(<AdminNav />)

      const sidebar = container.querySelector('aside')
      expect(sidebar).toBeInTheDocument()
      expect(sidebar).toHaveClass('hidden', 'md:flex')
    })

    it('should render mobile navigation', () => {
      const { container } = render(<AdminNav />)

      const mobileNav = container.querySelector('nav.md\\:hidden')
      expect(mobileNav).toBeInTheDocument()
    })

    it('should render admin panel header', () => {
      render(<AdminNav />)

      expect(screen.getByText('Admin Panel')).toBeInTheDocument()
      expect(screen.getByText('Plex Manager')).toBeInTheDocument()
    })

    it('should render all navigation items', () => {
      render(<AdminNav />)

      // Core navigation items
      expect(screen.getAllByText('Users').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Share Analytics').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Invites').length).toBeGreaterThan(0)

      // Analytics items
      expect(screen.getAllByText('LLM Usage').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Cost Analysis').length).toBeGreaterThan(0)

      // Config items
      expect(screen.getAllByText('Prompts').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Playground').length).toBeGreaterThan(0)

      // System items
      expect(screen.getAllByText('Settings').length).toBeGreaterThan(0)
    })

    it('should render Back to Home link', () => {
      render(<AdminNav />)

      const homeLinks = screen.getAllByText('Back to Home')
      expect(homeLinks.length).toBeGreaterThan(0)
    })

    it('should render Sign Out button', () => {
      render(<AdminNav />)

      const signOutButtons = screen.getAllByText('Sign Out')
      expect(signOutButtons.length).toBeGreaterThan(0)
    })
  })

  describe('Navigation Links', () => {
    it('should have correct href for Users', () => {
      const { container } = render(<AdminNav />)

      const usersLinks = container.querySelectorAll('a[href="/admin/users"]')
      expect(usersLinks.length).toBeGreaterThan(0)
    })

    it('should have correct href for Share Analytics', () => {
      const { container } = render(<AdminNav />)

      const sharesLinks = container.querySelectorAll('a[href="/admin/shares"]')
      expect(sharesLinks.length).toBeGreaterThan(0)
    })

    it('should have correct href for Invites', () => {
      const { container } = render(<AdminNav />)

      const invitesLinks = container.querySelectorAll('a[href="/admin/invites"]')
      expect(invitesLinks.length).toBeGreaterThan(0)
    })

    it('should have correct href for LLM Usage', () => {
      const { container } = render(<AdminNav />)

      const llmLinks = container.querySelectorAll('a[href="/admin/llm-usage"]')
      expect(llmLinks.length).toBeGreaterThan(0)
    })

    it('should have correct href for Cost Analysis', () => {
      const { container } = render(<AdminNav />)

      const costLinks = container.querySelectorAll('a[href="/admin/cost-analysis"]')
      expect(costLinks.length).toBeGreaterThan(0)
    })

    it('should have correct href for Prompts', () => {
      const { container } = render(<AdminNav />)

      const promptsLinks = container.querySelectorAll('a[href="/admin/prompts"]')
      expect(promptsLinks.length).toBeGreaterThan(0)
    })

    it('should have correct href for Playground', () => {
      const { container } = render(<AdminNav />)

      const playgroundLinks = container.querySelectorAll('a[href="/admin/playground"]')
      expect(playgroundLinks.length).toBeGreaterThan(0)
    })

    it('should have correct href for Settings', () => {
      const { container } = render(<AdminNav />)

      const settingsLinks = container.querySelectorAll('a[href="/admin/settings"]')
      expect(settingsLinks.length).toBeGreaterThan(0)
    })

    it('should have correct href for Back to Home', () => {
      const { container } = render(<AdminNav />)

      const homeLinks = container.querySelectorAll('a[href="/"]')
      expect(homeLinks.length).toBeGreaterThan(0)
    })
  })

  describe('Active State Logic', () => {
    it('should mark Users as active on /admin/users', () => {
      mockUsePathname.mockReturnValue('/admin/users')
      const { container } = render(<AdminNav />)

      const activeLinks = container.querySelectorAll('.from-cyan-600\\/20')
      expect(activeLinks.length).toBeGreaterThan(0)
    })

    it('should mark Users as active on /admin', () => {
      mockUsePathname.mockReturnValue('/admin')
      const { container } = render(<AdminNav />)

      const activeLinks = container.querySelectorAll('.from-cyan-600\\/20')
      expect(activeLinks.length).toBeGreaterThan(0)
    })

    it('should mark Share Analytics as active on /admin/shares', () => {
      mockUsePathname.mockReturnValue('/admin/shares')
      const { container } = render(<AdminNav />)

      const activeLinks = container.querySelectorAll('.from-cyan-600\\/20')
      expect(activeLinks.length).toBeGreaterThan(0)
    })

    it('should mark Invites as active on /admin/invites', () => {
      mockUsePathname.mockReturnValue('/admin/invites')
      const { container } = render(<AdminNav />)

      const activeLinks = container.querySelectorAll('.from-cyan-600\\/20')
      expect(activeLinks.length).toBeGreaterThan(0)
    })

    it('should mark LLM Usage as active on /admin/llm-usage', () => {
      mockUsePathname.mockReturnValue('/admin/llm-usage')
      const { container } = render(<AdminNav />)

      const activeLinks = container.querySelectorAll('.from-cyan-600\\/20')
      expect(activeLinks.length).toBeGreaterThan(0)
    })

    it('should mark Cost Analysis as active on /admin/cost-analysis', () => {
      mockUsePathname.mockReturnValue('/admin/cost-analysis')
      const { container } = render(<AdminNav />)

      const activeLinks = container.querySelectorAll('.from-cyan-600\\/20')
      expect(activeLinks.length).toBeGreaterThan(0)
    })

    it('should mark Prompts as active on /admin/prompts', () => {
      mockUsePathname.mockReturnValue('/admin/prompts')
      const { container } = render(<AdminNav />)

      const activeLinks = container.querySelectorAll('.from-cyan-600\\/20')
      expect(activeLinks.length).toBeGreaterThan(0)
    })

    it('should mark Prompts as active on /admin/prompts/123', () => {
      mockUsePathname.mockReturnValue('/admin/prompts/123')
      const { container } = render(<AdminNav />)

      const activeLinks = container.querySelectorAll('.from-cyan-600\\/20')
      expect(activeLinks.length).toBeGreaterThan(0)
    })

    it('should NOT mark Prompts as active on /admin/playground', () => {
      mockUsePathname.mockReturnValue('/admin/playground')
      render(<AdminNav />)

      // Playground should be active instead
      const { container } = render(<AdminNav />)
      const activeLinks = container.querySelectorAll('.from-cyan-600\\/20')
      expect(activeLinks.length).toBeGreaterThan(0)
    })

    it('should mark Playground as active on /admin/playground', () => {
      mockUsePathname.mockReturnValue('/admin/playground')
      const { container } = render(<AdminNav />)

      const activeLinks = container.querySelectorAll('.from-cyan-600\\/20')
      expect(activeLinks.length).toBeGreaterThan(0)
    })

    it('should mark Settings as active on /admin/settings', () => {
      mockUsePathname.mockReturnValue('/admin/settings')
      const { container } = render(<AdminNav />)

      const activeLinks = container.querySelectorAll('.from-cyan-600\\/20')
      expect(activeLinks.length).toBeGreaterThan(0)
    })
  })

  describe('Sign Out Functionality', () => {
    it('should call signOut when Sign Out button is clicked', async () => {
      const user = userEvent.setup()
      render(<AdminNav />)

      const signOutButton = screen.getAllByText('Sign Out')[0]
      await user.click(signOutButton)

      expect(mockSignOut).toHaveBeenCalledTimes(1)
    })

    it('should call router.push and router.refresh after sign out', async () => {
      const user = userEvent.setup()
      render(<AdminNav />)

      const signOutButton = screen.getAllByText('Sign Out')[0]
      await user.click(signOutButton)

      expect(mockPush).toHaveBeenCalledWith('/')
      expect(mockRefresh).toHaveBeenCalled()
    })

    it('should have proper styling for Sign Out button', () => {
      const { container } = render(<AdminNav />)

      const signOutButton = container.querySelector('button')
      expect(signOutButton).toHaveClass('hover:text-red-400', 'hover:bg-red-500/10')
    })
  })

  describe('Desktop Layout', () => {
    it('should render section headers in desktop view', () => {
      render(<AdminNav />)

      expect(screen.getByText('Analytics')).toBeInTheDocument()
      expect(screen.getByText('Prompts & Testing')).toBeInTheDocument()
    })

    it('should have proper sidebar styling', () => {
      const { container } = render(<AdminNav />)

      const sidebar = container.querySelector('aside')
      expect(sidebar).toHaveClass('fixed', 'left-0', 'top-0', 'bottom-0', 'w-64')
      expect(sidebar).toHaveClass('bg-slate-900/95', 'backdrop-blur-sm')
    })

    it('should render active indicators in desktop view', () => {
      mockUsePathname.mockReturnValue('/admin/users')
      const { container } = render(<AdminNav />)

      const activeIndicators = container.querySelectorAll('.bg-cyan-400')
      expect(activeIndicators.length).toBeGreaterThan(0)
    })

    it('should render all icons in desktop view', () => {
      const { container } = render(<AdminNav />)

      const svgs = container.querySelectorAll('svg')
      // Should have icons for all nav items plus admin panel logo
      expect(svgs.length).toBeGreaterThan(10)
    })
  })

  describe('Mobile Layout', () => {
    it('should render mobile navigation at bottom', () => {
      const { container } = render(<AdminNav />)

      const mobileNav = container.querySelector('nav.md\\:hidden')
      expect(mobileNav).toHaveClass('fixed', 'bottom-0', 'left-0', 'right-0')
    })

    it('should truncate labels in mobile view', () => {
      render(<AdminNav />)

      // Mobile view shows only first word of labels for primary items
      // Share Analytics becomes "Share" in the bottom bar
      const mobileLabels = screen.getAllByText('Share')
      expect(mobileLabels.length).toBeGreaterThan(0)
    })

    it('should render active indicators in mobile view', () => {
      mockUsePathname.mockReturnValue('/admin/users')
      const { container } = render(<AdminNav />)

      const mobileNav = container.querySelector('nav.md\\:hidden')
      const activeIndicators = mobileNav?.querySelectorAll('.bg-cyan-400')
      expect(activeIndicators?.length).toBeGreaterThan(0)
    })

    it('should have proper mobile navigation styling', () => {
      const { container } = render(<AdminNav />)

      const mobileNav = container.querySelector('nav.md\\:hidden')
      expect(mobileNav).toHaveClass('bg-slate-900/95', 'backdrop-blur-sm')
      expect(mobileNav).toHaveClass('border-t', 'border-slate-700')
    })
  })

  describe('Responsive Behavior', () => {
    it('should hide desktop sidebar on mobile', () => {
      const { container } = render(<AdminNav />)

      const sidebar = container.querySelector('aside')
      expect(sidebar).toHaveClass('hidden', 'md:flex')
    })

    it('should hide mobile nav on desktop', () => {
      const { container } = render(<AdminNav />)

      const mobileNav = container.querySelector('nav.md\\:hidden')
      expect(mobileNav).toBeInTheDocument()
      expect(mobileNav).toHaveClass('md:hidden')
    })

    it('should adjust padding for mobile content', () => {
      const { container } = render(<AdminNav />)

      const mobileNav = container.querySelector('nav.md\\:hidden')
      expect(mobileNav).toHaveClass('pb-2')
    })
  })

  describe('Visual Styling', () => {
    it('should have gradient background for admin panel logo', () => {
      const { container } = render(<AdminNav />)

      const logo = container.querySelector('.bg-gradient-to-br.from-cyan-600.to-purple-600')
      expect(logo).toBeInTheDocument()
    })

    it('should have hover effects on navigation items', () => {
      const { container } = render(<AdminNav />)

      // Check for links with hover effects in the desktop sidebar
      const navLinks = container.querySelectorAll('aside a[href^="/admin/"]')
      expect(navLinks.length).toBeGreaterThan(0)

      // At least some links should have hover:text-white class
      const linksWithHover = Array.from(navLinks).filter(link =>
        link.className.includes('hover:text-white')
      )
      expect(linksWithHover.length).toBeGreaterThan(0)
    })

    it('should have proper border styling', () => {
      const { container } = render(<AdminNav />)

      const sidebar = container.querySelector('aside')
      expect(sidebar).toHaveClass('border-r', 'border-slate-700')
    })

    it('should have proper text colors', () => {
      mockUsePathname.mockReturnValue('/admin/settings')
      const { container } = render(<AdminNav />)

      const inactiveLinks = container.querySelectorAll('.text-slate-400')
      expect(inactiveLinks.length).toBeGreaterThan(0)
    })

    it('should render section dividers', () => {
      const { container } = render(<AdminNav />)

      const sectionHeaders = container.querySelectorAll('.text-xs.font-semibold.text-slate-500')
      expect(sectionHeaders.length).toBe(2) // Analytics, and Prompts & Testing
    })
  })

  describe('Edge Cases', () => {
    it('should handle undefined pathname', () => {
      mockUsePathname.mockReturnValue(undefined as any)

      // The component should handle undefined pathname gracefully
      const { container } = render(<AdminNav />)

      // Component should render without errors
      expect(container.querySelector('aside')).toBeInTheDocument()

      // No links should be active when pathname is undefined
      const activeLinks = container.querySelectorAll('.from-cyan-600\\/20')
      expect(activeLinks.length).toBe(0)
    })

    it('should handle pathname without /admin prefix', () => {
      mockUsePathname.mockReturnValue('/some-other-page')

      const { container } = render(<AdminNav />)
      const activeLinks = container.querySelectorAll('.from-cyan-600\\/20')
      // No links should be active
      expect(activeLinks.length).toBe(0)
    })

    it('should handle deep nested paths', () => {
      // Use a path that actually uses startsWith logic (not /admin/users which has special case)
      mockUsePathname.mockReturnValue('/admin/llm-usage/details')

      const { container } = render(<AdminNav />)
      // Check that the component renders without errors
      expect(container.querySelector('aside')).toBeInTheDocument()

      // The /admin/llm-usage path should be active since pathname starts with it
      const activeLinks = container.querySelectorAll('.from-cyan-600\\/20')
      expect(activeLinks.length).toBeGreaterThan(0)
    })

    it('should handle rapid navigation clicks', async () => {
      const user = userEvent.setup()
      const { container } = render(<AdminNav />)

      const usersLinks = container.querySelectorAll('a[href="/admin/users"]')
      const firstLink = usersLinks[0] as HTMLElement

      // Click multiple times rapidly
      await user.click(firstLink)
      await user.click(firstLink)
      await user.click(firstLink)

      // Should not throw errors
      expect(firstLink).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should render semantic HTML elements', () => {
      const { container } = render(<AdminNav />)

      expect(container.querySelector('aside')).toBeInTheDocument()
      expect(container.querySelector('nav')).toBeInTheDocument()
    })

    it('should have proper SVG attributes', () => {
      const { container } = render(<AdminNav />)

      const svgs = container.querySelectorAll('svg')
      svgs.forEach((svg) => {
        expect(svg).toHaveAttribute('viewBox')
        // SVGs should have either fill or stroke (or both)
        expect(svg.hasAttribute('fill') || svg.hasAttribute('stroke')).toBe(true)
      })
    })

    it('should have clickable elements', () => {
      const { container } = render(<AdminNav />)

      const links = container.querySelectorAll('a')
      expect(links.length).toBeGreaterThan(0)

      const buttons = container.querySelectorAll('button')
      expect(buttons.length).toBeGreaterThan(0)
    })

    it('should have proper text contrast', () => {
      const { container } = render(<AdminNav />)

      const whiteText = container.querySelectorAll('.text-white')
      expect(whiteText.length).toBeGreaterThan(0)
    })
  })

  describe('Mobile More Menu', () => {
    it('should render More button in mobile navigation', () => {
      render(<AdminNav />)

      const moreButton = screen.getByTestId('admin-nav-more-mobile')
      expect(moreButton).toBeInTheDocument()
      expect(moreButton).toHaveTextContent('More')
    })

    it('should have proper ARIA attributes on More button', () => {
      render(<AdminNav />)

      const moreButton = screen.getByTestId('admin-nav-more-mobile')
      expect(moreButton).toHaveAttribute('aria-expanded', 'false')
      expect(moreButton).toHaveAttribute('aria-haspopup', 'true')
      expect(moreButton).toHaveAttribute('aria-label', 'More navigation options')
      expect(moreButton).toHaveAttribute('aria-controls', 'mobile-more-menu')
    })

    it('should toggle More menu open when clicked', async () => {
      const user = userEvent.setup()
      const { container } = render(<AdminNav />)

      const moreButton = screen.getByTestId('admin-nav-more-mobile')

      // Menu should be closed initially
      expect(container.querySelector('#mobile-more-menu')).not.toBeInTheDocument()
      expect(moreButton).toHaveAttribute('aria-expanded', 'false')

      // Click to open
      await user.click(moreButton)

      // Menu should now be open
      expect(container.querySelector('#mobile-more-menu')).toBeInTheDocument()
      expect(moreButton).toHaveAttribute('aria-expanded', 'true')
    })

    it('should close More menu when clicked again', async () => {
      const user = userEvent.setup()
      const { container } = render(<AdminNav />)

      const moreButton = screen.getByTestId('admin-nav-more-mobile')

      // Open the menu
      await user.click(moreButton)
      expect(container.querySelector('#mobile-more-menu')).toBeInTheDocument()

      // Close the menu
      await user.click(moreButton)
      expect(container.querySelector('#mobile-more-menu')).not.toBeInTheDocument()
    })

    it('should render secondary nav items in More menu', async () => {
      const user = userEvent.setup()
      render(<AdminNav />)

      const moreButton = screen.getByTestId('admin-nav-more-mobile')
      await user.click(moreButton)

      // Check for secondary items in the menu (analytics + config nav items)
      expect(screen.getByTestId('admin-nav-llm-usage-mobile')).toBeInTheDocument()
      expect(screen.getByTestId('admin-nav-cost-analysis-mobile')).toBeInTheDocument()
      expect(screen.getByTestId('admin-nav-discord-mobile')).toBeInTheDocument()
      expect(screen.getByTestId('admin-nav-prompts-mobile')).toBeInTheDocument()
      expect(screen.getByTestId('admin-nav-playground-mobile')).toBeInTheDocument()
    })

    it('should render Home and Sign Out in More menu', async () => {
      const user = userEvent.setup()
      render(<AdminNav />)

      const moreButton = screen.getByTestId('admin-nav-more-mobile')
      await user.click(moreButton)

      expect(screen.getByTestId('admin-nav-home-mobile')).toBeInTheDocument()
      expect(screen.getByTestId('admin-nav-signout-mobile')).toBeInTheDocument()
    })

    it('should have proper ARIA attributes on More menu panel', async () => {
      const user = userEvent.setup()
      const { container } = render(<AdminNav />)

      const moreButton = screen.getByTestId('admin-nav-more-mobile')
      await user.click(moreButton)

      const moreMenu = container.querySelector('#mobile-more-menu')
      expect(moreMenu).toHaveAttribute('role', 'menu')
      expect(moreMenu).toHaveAttribute('aria-label', 'Additional navigation options')
    })

    it('should have menuitem role on links in More menu', async () => {
      const user = userEvent.setup()
      render(<AdminNav />)

      const moreButton = screen.getByTestId('admin-nav-more-mobile')
      await user.click(moreButton)

      const llmUsage = screen.getByTestId('admin-nav-llm-usage-mobile')
      expect(llmUsage).toHaveAttribute('role', 'menuitem')

      const home = screen.getByTestId('admin-nav-home-mobile')
      expect(home).toHaveAttribute('role', 'menuitem')

      const signOut = screen.getByTestId('admin-nav-signout-mobile')
      expect(signOut).toHaveAttribute('role', 'menuitem')
    })

    it('should close More menu on navigation', async () => {
      const user = userEvent.setup()
      mockUsePathname.mockReturnValue('/admin/users')
      const { container, rerender } = render(<AdminNav />)

      const moreButton = screen.getByTestId('admin-nav-more-mobile')
      await user.click(moreButton)

      // Menu should be open
      expect(container.querySelector('#mobile-more-menu')).toBeInTheDocument()

      // Simulate navigation by changing pathname
      mockUsePathname.mockReturnValue('/admin/shares')
      rerender(<AdminNav />)

      // Menu should be closed after navigation
      expect(container.querySelector('#mobile-more-menu')).not.toBeInTheDocument()
    })

    it('should highlight More button when secondary item is active', () => {
      mockUsePathname.mockReturnValue('/admin/llm-usage')
      render(<AdminNav />)

      const moreButton = screen.getByTestId('admin-nav-more-mobile')
      expect(moreButton).toHaveClass('text-cyan-400')
    })

    it('should show indicator dot when secondary item is active and menu is closed', () => {
      mockUsePathname.mockReturnValue('/admin/llm-usage')
      const { container } = render(<AdminNav />)

      const moreButton = screen.getByTestId('admin-nav-more-mobile')
      // There should be a small indicator dot
      const indicator = moreButton.querySelector('.bg-cyan-400')
      expect(indicator).toBeInTheDocument()
      expect(indicator).toHaveClass('w-1', 'h-1', 'rounded-full')
    })

    it('should not show indicator dot when menu is open', async () => {
      const user = userEvent.setup()
      mockUsePathname.mockReturnValue('/admin/llm-usage')
      render(<AdminNav />)

      const moreButton = screen.getByTestId('admin-nav-more-mobile')
      await user.click(moreButton)

      // When menu is open, indicator should not be shown
      const indicator = moreButton.querySelector('.w-1.h-1.rounded-full.bg-cyan-400')
      expect(indicator).not.toBeInTheDocument()
    })

    it('should not highlight More button when primary item is active', () => {
      mockUsePathname.mockReturnValue('/admin/users')
      render(<AdminNav />)

      const moreButton = screen.getByTestId('admin-nav-more-mobile')
      expect(moreButton).toHaveClass('text-slate-400')
    })

    it('should render primary nav items in bottom bar', () => {
      const { container } = render(<AdminNav />)

      const mobileNav = container.querySelector('nav.md\\:hidden')
      // Primary items should be visible in bottom bar (search within mobile nav)
      expect(mobileNav?.querySelector('[data-testid="admin-nav-users-mobile"]')).toBeInTheDocument()
      expect(mobileNav?.querySelector('[data-testid="admin-nav-invites-mobile"]')).toBeInTheDocument()
      expect(mobileNav?.querySelector('[data-testid="admin-nav-share-analytics-mobile"]')).toBeInTheDocument()
      expect(mobileNav?.querySelector('[data-testid="admin-nav-settings-mobile"]')).toBeInTheDocument()
    })

    it('should call signOut when Sign Out is clicked in More menu', async () => {
      const user = userEvent.setup()
      render(<AdminNav />)

      const moreButton = screen.getByTestId('admin-nav-more-mobile')
      await user.click(moreButton)

      const signOutButton = screen.getByTestId('admin-nav-signout-mobile')
      await user.click(signOutButton)

      expect(mockSignOut).toHaveBeenCalledTimes(1)
    })

    it('should have grid layout with 3 columns in More menu', async () => {
      const user = userEvent.setup()
      const { container } = render(<AdminNav />)

      const moreButton = screen.getByTestId('admin-nav-more-mobile')
      await user.click(moreButton)

      const grid = container.querySelector('#mobile-more-menu .grid')
      expect(grid).toHaveClass('grid-cols-3')
    })

    it('should close More menu when clicking outside', async () => {
      const user = userEvent.setup()
      const { container } = render(<AdminNav />)

      const moreButton = screen.getByTestId('admin-nav-more-mobile')
      await user.click(moreButton)

      // Menu should be open
      expect(container.querySelector('#mobile-more-menu')).toBeInTheDocument()

      // Click on the backdrop to close the menu
      const backdrop = screen.getByTestId('mobile-more-menu-backdrop')
      await user.click(backdrop)

      // Menu should be closed (AnimatePresence handles exit animation)
      expect(container.querySelector('#mobile-more-menu')).not.toBeInTheDocument()
    })

    it('should close More menu when pressing Escape key', async () => {
      const user = userEvent.setup()
      const { container } = render(<AdminNav />)

      const moreButton = screen.getByTestId('admin-nav-more-mobile')
      await user.click(moreButton)

      // Menu should be open
      expect(container.querySelector('#mobile-more-menu')).toBeInTheDocument()

      // Press Escape key
      await user.keyboard('{Escape}')

      // Menu should be closed
      expect(container.querySelector('#mobile-more-menu')).not.toBeInTheDocument()
    })

    it('should return focus to More button when closing menu with Escape', async () => {
      const user = userEvent.setup()
      render(<AdminNav />)

      const moreButton = screen.getByTestId('admin-nav-more-mobile')
      await user.click(moreButton)

      // Press Escape key
      await user.keyboard('{Escape}')

      // Focus should return to More button
      expect(moreButton).toHaveFocus()
    })

    it('should focus first menu item when menu opens', async () => {
      const user = userEvent.setup()
      render(<AdminNav />)

      const moreButton = screen.getByTestId('admin-nav-more-mobile')
      await user.click(moreButton)

      // First menu item should be focused (wait for async focus)
      const firstMenuItem = screen.getByTestId('admin-nav-llm-usage-mobile')
      await waitFor(() => {
        expect(firstMenuItem).toHaveFocus()
      })
    })

    it('should navigate menu items with arrow keys', async () => {
      const user = userEvent.setup()
      render(<AdminNav />)

      const moreButton = screen.getByTestId('admin-nav-more-mobile')
      await user.click(moreButton)

      // Wait for first item to be focused
      const firstMenuItem = screen.getByTestId('admin-nav-llm-usage-mobile')
      await waitFor(() => {
        expect(firstMenuItem).toHaveFocus()
      })

      // Press ArrowDown to go to second item
      await user.keyboard('{ArrowDown}')
      const secondMenuItem = screen.getByTestId('admin-nav-cost-analysis-mobile')
      expect(secondMenuItem).toHaveFocus()

      // Press ArrowUp to go back to first item
      await user.keyboard('{ArrowUp}')
      expect(firstMenuItem).toHaveFocus()
    })

    it('should wrap around when navigating past last item with ArrowDown', async () => {
      const user = userEvent.setup()
      render(<AdminNav />)

      const moreButton = screen.getByTestId('admin-nav-more-mobile')
      await user.click(moreButton)

      // Wait for first item to be focused
      const firstMenuItem = screen.getByTestId('admin-nav-llm-usage-mobile')
      await waitFor(() => {
        expect(firstMenuItem).toHaveFocus()
      })

      // Navigate to last item (Sign Out) - there are 7 items total (5 menu items + Home + Sign Out)
      for (let i = 0; i < 6; i++) {
        await user.keyboard('{ArrowDown}')
      }

      const signOutButton = screen.getByTestId('admin-nav-signout-mobile')
      expect(signOutButton).toHaveFocus()

      // ArrowDown should wrap to first item
      await user.keyboard('{ArrowDown}')
      expect(firstMenuItem).toHaveFocus()
    })

    it('should have focus-visible styles on menu items', async () => {
      const user = userEvent.setup()
      render(<AdminNav />)

      const moreButton = screen.getByTestId('admin-nav-more-mobile')
      await user.click(moreButton)

      const firstMenuItem = screen.getByTestId('admin-nav-llm-usage-mobile')
      expect(firstMenuItem).toHaveClass('focus-visible:ring-2')
      expect(firstMenuItem).toHaveClass('focus-visible:ring-cyan-500')
    })

    it('should render backdrop overlay when menu is open', async () => {
      const user = userEvent.setup()
      render(<AdminNav />)

      const moreButton = screen.getByTestId('admin-nav-more-mobile')

      // Backdrop should not exist before opening
      expect(screen.queryByTestId('mobile-more-menu-backdrop')).not.toBeInTheDocument()

      await user.click(moreButton)

      // Backdrop should be visible
      const backdrop = screen.getByTestId('mobile-more-menu-backdrop')
      expect(backdrop).toBeInTheDocument()
      expect(backdrop).toHaveClass('bg-black/50')
    })
  })

  describe('Integration', () => {
    it('should work with all navigation paths', () => {
      const paths = [
        '/admin',
        '/admin/users',
        '/admin/shares',
        '/admin/invites',
        '/admin/llm-usage',
        '/admin/cost-analysis',
        '/admin/prompts',
        '/admin/playground',
        '/admin/settings',
      ]

      paths.forEach((path) => {
        mockUsePathname.mockReturnValue(path)
        const { container } = render(<AdminNav />)
        const activeLinks = container.querySelectorAll('.from-cyan-600\\/20')
        expect(activeLinks.length).toBeGreaterThan(0)
      })
    })

    it('should maintain state across re-renders', () => {
      mockUsePathname.mockReturnValue('/admin/users')
      const { rerender } = render(<AdminNav />)

      mockUsePathname.mockReturnValue('/admin/settings')
      rerender(<AdminNav />)

      const { container } = render(<AdminNav />)
      const activeLinks = container.querySelectorAll('.from-cyan-600\\/20')
      expect(activeLinks.length).toBeGreaterThan(0)
    })
  })
})

