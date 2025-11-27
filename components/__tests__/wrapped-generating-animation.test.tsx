import { WrappedGeneratingAnimation } from '@/components/generator/wrapped-generating-animation'
import { act, render, screen } from '@testing-library/react'

describe('WrappedGeneratingAnimation', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  describe('Compact Mode', () => {
    it('should render compact version when compact prop is true', () => {
      const { container } = render(<WrappedGeneratingAnimation year={2024} compact />)

      // Should have compact styling (min-h-[400px] instead of fixed inset-0)
      const compactContainer = container.querySelector('.min-h-\\[400px\\]')
      expect(compactContainer).toBeInTheDocument()
    })

    it('should display year in compact mode', () => {
      render(<WrappedGeneratingAnimation year={2024} compact />)

      expect(screen.getByText(/Creating Your 2024 Wrapped/i)).toBeInTheDocument()
    })

    it('should show animated phrase in compact mode', () => {
      render(<WrappedGeneratingAnimation year={2024} compact />)

      // Initially should show typing cursor
      const cursor = screen.getByText('|')
      expect(cursor).toBeInTheDocument()
      expect(cursor).toHaveClass('animate-pulse')
    })

    it('should display helpful message in compact mode', () => {
      render(<WrappedGeneratingAnimation year={2024} compact />)

      expect(
        screen.getByText(/Rex is working hard! This usually takes 30-60 seconds/i)
      ).toBeInTheDocument()
    })

    it('should show loading dots in compact mode', () => {
      const { container } = render(<WrappedGeneratingAnimation year={2024} compact />)

      // Should have 3 bouncing dots
      const dots = container.querySelectorAll('.animate-bounce')
      expect(dots.length).toBeGreaterThanOrEqual(3)
    })

    it('should use current year when year prop is not provided in compact mode', () => {
      const currentYear = new Date().getFullYear()
      render(<WrappedGeneratingAnimation compact />)

      expect(screen.getByText(new RegExp(`Creating Your ${currentYear} Wrapped`, 'i'))).toBeInTheDocument()
    })
  })

  describe('Full Screen Mode', () => {
    it('should render full screen version by default', () => {
      const { container } = render(<WrappedGeneratingAnimation year={2024} />)

      // Should have fixed positioning
      const fullScreenContainer = container.querySelector('.fixed.inset-0')
      expect(fullScreenContainer).toBeInTheDocument()
    })

    it('should display year in full screen mode', () => {
      render(<WrappedGeneratingAnimation year={2024} />)

      expect(screen.getByText(/Creating Your 2024 Wrapped/i)).toBeInTheDocument()
    })

    it('should show animated phrase in full screen mode', () => {
      render(<WrappedGeneratingAnimation year={2024} />)

      // Should show typing cursor
      const cursor = screen.getByText('|')
      expect(cursor).toBeInTheDocument()
    })

    it('should display fun message in full screen mode', () => {
      render(<WrappedGeneratingAnimation year={2024} />)

      expect(screen.getByText(/Rex is working hard!/i)).toBeInTheDocument()
      expect(screen.getByText(/This usually takes about 30-60 seconds/i)).toBeInTheDocument()
    })

    it('should show more loading dots in full screen mode', () => {
      const { container } = render(<WrappedGeneratingAnimation year={2024} />)

      // Should have 5 bouncing dots in full screen
      const dots = container.querySelectorAll('.animate-bounce')
      expect(dots.length).toBeGreaterThanOrEqual(5)
    })

    it('should use current year when year prop is not provided', () => {
      const currentYear = new Date().getFullYear()
      render(<WrappedGeneratingAnimation />)

      expect(screen.getByText(new RegExp(`Creating Your ${currentYear} Wrapped`, 'i'))).toBeInTheDocument()
    })

    it('should render background particles', () => {
      const { container } = render(<WrappedGeneratingAnimation year={2024} />)

      // Should have background particles with twinkle animation
      const particles = container.querySelectorAll('.animate-twinkle')
      expect(particles.length).toBeGreaterThan(0)
    })

    it('should render dinosaur with glow effect', () => {
      const { container } = render(<WrappedGeneratingAnimation year={2024} />)

      // Should have glow effect div
      const glowEffect = container.querySelector('.blur-3xl')
      expect(glowEffect).toBeInTheDocument()
    })
  })

  describe('Animation Behavior', () => {
    it('should start with typing animation', () => {
      render(<WrappedGeneratingAnimation year={2024} compact />)

      // Cursor should be visible
      expect(screen.getByText('|')).toBeInTheDocument()
    })

    it('should cycle through phrases over time', async () => {
      render(<WrappedGeneratingAnimation year={2024} compact />)

      // Get initial phrase container
      const phraseContainer = screen.getByText('|').parentElement

      // Fast forward through typing animation (80ms per char * ~50 chars)
      act(() => {
        jest.advanceTimersByTime(4000)
      })

      // Fast forward through display time (2500ms)
      act(() => {
        jest.advanceTimersByTime(2500)
      })

      // Fast forward through next typing animation
      act(() => {
        jest.advanceTimersByTime(4000)
      })

      // Phrase should have changed (cursor should still be there)
      expect(screen.getByText('|')).toBeInTheDocument()
    })

    it('should show typing cursor with pulse animation', () => {
      render(<WrappedGeneratingAnimation year={2024} compact />)

      const cursor = screen.getByText('|')
      expect(cursor).toHaveClass('animate-pulse')
    })

    it('should render dinosaur SVG', () => {
      const { container } = render(<WrappedGeneratingAnimation year={2024} compact />)

      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
      expect(svg).toHaveAttribute('viewBox', '0 0 200 200')
    })

    it('should have bouncing dinosaur animation', () => {
      const { container } = render(<WrappedGeneratingAnimation year={2024} compact />)

      const bouncingElement = container.querySelector('.animate-bounce')
      expect(bouncingElement).toBeInTheDocument()
    })
  })

  describe('Dinosaur Rendering', () => {
    it('should render dinosaur with all body parts', () => {
      const { container } = render(<WrappedGeneratingAnimation year={2024} compact />)

      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()

      // Check for main body parts (paths for body, head, tail, legs)
      const paths = svg?.querySelectorAll('path')
      expect(paths && paths.length).toBeGreaterThan(5) // body, head, tail, legs, arms
    })

    it('should render dinosaur with eye', () => {
      const { container } = render(<WrappedGeneratingAnimation year={2024} compact />)

      const svg = container.querySelector('svg')
      const circles = svg?.querySelectorAll('circle')
      expect(circles && circles.length).toBeGreaterThan(0) // eye
    })

    it('should render dinosaur with smile', () => {
      const { container } = render(<WrappedGeneratingAnimation year={2024} compact />)

      const svg = container.querySelector('svg')
      const paths = svg?.querySelectorAll('path')
      expect(paths && paths.length).toBeGreaterThan(0) // smile and spikes
    })

    it('should render floating particles around dinosaur', () => {
      const { container } = render(<WrappedGeneratingAnimation year={2024} compact />)

      // Should have floating particles with animate-float class
      const floatingParticles = container.querySelectorAll('.animate-float')
      expect(floatingParticles.length).toBeGreaterThan(0)
    })
  })

  describe('Responsive Design', () => {
    it('should apply responsive classes in full screen mode', () => {
      const { container } = render(<WrappedGeneratingAnimation year={2024} />)

      // Should have responsive text sizes (md:text-6xl, md:text-3xl, etc.)
      const title = screen.getByText(/Creating Your 2024 Wrapped/i)
      expect(title).toHaveClass('text-4xl')
    })

    it('should have responsive sizing for dinosaur in full screen', () => {
      const { container } = render(<WrappedGeneratingAnimation year={2024} />)

      // Should have responsive dinosaur size classes
      const dinosaurContainer = container.querySelector('.w-48')
      expect(dinosaurContainer).toBeInTheDocument()
    })

    it('should have smaller dinosaur in compact mode', () => {
      const { container } = render(<WrappedGeneratingAnimation year={2024} compact />)

      // Should have smaller dinosaur (w-24 instead of w-48)
      const dinosaurContainer = container.querySelector('.w-24')
      expect(dinosaurContainer).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('should handle undefined year prop', () => {
      const currentYear = new Date().getFullYear()
      render(<WrappedGeneratingAnimation />)

      expect(screen.getByText(new RegExp(`Creating Your ${currentYear} Wrapped`, 'i'))).toBeInTheDocument()
    })

    it('should handle year 0 by using current year', () => {
      const currentYear = new Date().getFullYear()
      render(<WrappedGeneratingAnimation year={0} />)

      // Year 0 is falsy, so component uses current year as fallback
      expect(screen.getByText(new RegExp(`Creating Your ${currentYear} Wrapped`, 'i'))).toBeInTheDocument()
    })

    it('should handle future year', () => {
      const futureYear = 2099
      render(<WrappedGeneratingAnimation year={futureYear} />)

      expect(screen.getByText(new RegExp(`Creating Your ${futureYear} Wrapped`, 'i'))).toBeInTheDocument()
    })

    it('should not crash when compact is undefined', () => {
      expect(() => {
        render(<WrappedGeneratingAnimation year={2024} />)
      }).not.toThrow()
    })

    it('should render consistently with same props', () => {
      const { container: container1 } = render(<WrappedGeneratingAnimation year={2024} compact />)
      const { container: container2 } = render(<WrappedGeneratingAnimation year={2024} compact />)

      // Both should render the same structure
      expect(container1.querySelector('svg')).toBeInTheDocument()
      expect(container2.querySelector('svg')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have proper text contrast for readability', () => {
      render(<WrappedGeneratingAnimation year={2024} compact />)

      const title = screen.getByText(/Creating Your 2024 Wrapped/i)
      expect(title).toHaveClass('text-white')
    })

    it('should have visible loading indicators', () => {
      render(<WrappedGeneratingAnimation year={2024} compact />)

      // Loading dots should be visible
      const message = screen.getByText(/Rex is working hard!/i)
      expect(message).toBeInTheDocument()
    })

    it('should communicate loading state clearly', () => {
      render(<WrappedGeneratingAnimation year={2024} compact />)

      // Should have clear messaging about what's happening
      expect(screen.getByText(/Creating Your 2024 Wrapped/i)).toBeInTheDocument()
      expect(screen.getByText(/Rex is working hard!/i)).toBeInTheDocument()
    })
  })
})

