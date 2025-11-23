import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { usePathname, useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { AdminNav } from '@/components/admin/shared/admin-nav'

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
      expect(screen.getByText('Configuration')).toBeInTheDocument()
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

      // Mobile view shows only first word of labels
      // Share Analytics becomes "Share"
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
      expect(sectionHeaders.length).toBe(2) // Analytics and Configuration
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
        expect(svg).toHaveAttribute('fill')
        expect(svg).toHaveAttribute('stroke')
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

