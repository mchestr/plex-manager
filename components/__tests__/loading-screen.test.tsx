import { render, screen } from '@testing-library/react'
import { LoadingScreen } from '@/components/ui/loading-screen'

describe('LoadingScreen', () => {
  describe('Basic Rendering', () => {
    it('should render with default message', () => {
      render(<LoadingScreen />)

      // Use getAllByText since "Loading..." appears in both sr-only and visible message
      const messages = screen.getAllByText('Loading...')
      expect(messages.length).toBeGreaterThan(0)
    })

    it('should render with custom message', () => {
      render(<LoadingScreen message="Please wait" />)

      expect(screen.getByText('Please wait')).toBeInTheDocument()
    })

    it('should render LoadingSpinner component', () => {
      const { container } = render(<LoadingScreen />)

      const spinner = container.querySelector('[role="status"]')
      expect(spinner).toBeInTheDocument()
    })

    it('should apply custom className', () => {
      const { container } = render(<LoadingScreen className="custom-class" />)

      const loadingContainer = container.querySelector('.custom-class')
      expect(loadingContainer).toBeInTheDocument()
    })
  })

  describe('Message Display', () => {
    it('should display message when provided', () => {
      render(<LoadingScreen message="Fetching data..." />)

      expect(screen.getByText('Fetching data...')).toBeInTheDocument()
    })

    it('should not display message when empty string is provided', () => {
      const { container } = render(<LoadingScreen message="" />)

      // Should not render the paragraph element for empty message
      const message = container.querySelector('p')
      expect(message).not.toBeInTheDocument()
    })

    it('should handle long messages', () => {
      const longMessage = 'This is a very long loading message that should still display properly without breaking the layout'
      render(<LoadingScreen message={longMessage} />)

      expect(screen.getByText(longMessage)).toBeInTheDocument()
    })

    it('should handle special characters in message', () => {
      render(<LoadingScreen message="Loading... 100% complete! 🎉" />)

      expect(screen.getByText('Loading... 100% complete! 🎉')).toBeInTheDocument()
    })
  })

  describe('Layout and Styling', () => {
    it('should have centered layout', () => {
      const { container } = render(<LoadingScreen />)

      const loadingContainer = container.querySelector('.flex.flex-col.items-center.justify-center')
      expect(loadingContainer).toBeInTheDocument()
    })

    it('should have minimum height', () => {
      const { container } = render(<LoadingScreen />)

      const loadingContainer = container.querySelector('.min-h-\\[50vh\\]')
      expect(loadingContainer).toBeInTheDocument()
    })

    it('should have gap between spinner and message', () => {
      const { container } = render(<LoadingScreen />)

      const loadingContainer = container.querySelector('.gap-4')
      expect(loadingContainer).toBeInTheDocument()
    })

    it('should have proper text styling for message', () => {
      render(<LoadingScreen message="Loading..." />)

      // Get the visible message (not the sr-only one)
      const messages = screen.getAllByText('Loading...')
      const visibleMessage = messages.find(msg => msg.tagName === 'P')
      expect(visibleMessage).toHaveClass('text-slate-400')
      expect(visibleMessage).toHaveClass('animate-pulse')
    })

    it('should pass large size to LoadingSpinner', () => {
      const { container } = render(<LoadingScreen />)

      // LoadingSpinner with lg size should have w-12 h-12 classes
      const spinner = container.querySelector('.w-12.h-12')
      expect(spinner).toBeInTheDocument()
    })
  })

  describe('HTML Attributes', () => {
    it('should pass through additional HTML attributes', () => {
      const { container } = render(<LoadingScreen data-testid="loading-screen" />)

      const loadingContainer = container.querySelector('[data-testid="loading-screen"]')
      expect(loadingContainer).toBeInTheDocument()
    })

    it('should support id attribute', () => {
      const { container } = render(<LoadingScreen id="my-loading-screen" />)

      const loadingContainer = container.querySelector('#my-loading-screen')
      expect(loadingContainer).toBeInTheDocument()
    })

    it('should support aria attributes', () => {
      const { container } = render(<LoadingScreen aria-label="Loading content" />)

      const loadingContainer = container.querySelector('[aria-label="Loading content"]')
      expect(loadingContainer).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('should handle undefined message prop', () => {
      render(<LoadingScreen message={undefined} />)

      // Use getAllByText since "Loading..." appears in both sr-only and visible message
      const messages = screen.getAllByText('Loading...')
      expect(messages.length).toBeGreaterThan(0)
    })

    it('should handle null className', () => {
      const { container } = render(<LoadingScreen className={undefined} />)

      const loadingContainer = container.firstChild
      expect(loadingContainer).toBeInTheDocument()
    })

    it('should handle whitespace-only message', () => {
      const { container } = render(<LoadingScreen message="   " />)

      // Check that the message paragraph exists with whitespace
      const message = container.querySelector('p.text-slate-400')
      expect(message).toBeInTheDocument()
      expect(message?.textContent).toBe('   ')
    })

    it('should handle multiple renders with different messages', () => {
      const { rerender } = render(<LoadingScreen message="First message" />)
      expect(screen.getByText('First message')).toBeInTheDocument()

      rerender(<LoadingScreen message="Second message" />)
      expect(screen.getByText('Second message')).toBeInTheDocument()
      expect(screen.queryByText('First message')).not.toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have proper loading indicator role', () => {
      const { container } = render(<LoadingScreen />)

      const spinner = container.querySelector('[role="status"]')
      expect(spinner).toBeInTheDocument()
    })

    it('should have accessible label in spinner', () => {
      const { container } = render(<LoadingScreen />)

      const spinner = container.querySelector('[role="status"]')
      expect(spinner).toHaveAttribute('aria-label', 'Loading...')
    })

    it('should have proper text contrast', () => {
      render(<LoadingScreen message="Loading..." />)

      // Get the visible message (not the sr-only one)
      const messages = screen.getAllByText('Loading...')
      const visibleMessage = messages.find(msg => msg.tagName === 'P')
      expect(visibleMessage).toHaveClass('text-slate-400')
    })

    it('should have visible loading animation', () => {
      const { container } = render(<LoadingScreen />)

      const spinner = container.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
    })
  })

  describe('Integration', () => {
    it('should work with all props combined', () => {
      const { container } = render(
        <LoadingScreen
          message="Custom loading message"
          className="custom-class"
          data-testid="integration-test"
          id="loading-screen-id"
        />
      )

      expect(screen.getByText('Custom loading message')).toBeInTheDocument()
      expect(container.querySelector('.custom-class')).toBeInTheDocument()
      expect(container.querySelector('[data-testid="integration-test"]')).toBeInTheDocument()
      expect(container.querySelector('#loading-screen-id')).toBeInTheDocument()
    })

    it('should maintain layout with custom className', () => {
      const { container } = render(<LoadingScreen className="p-8 bg-red-500" />)

      const loadingContainer = container.querySelector('.p-8.bg-red-500')
      expect(loadingContainer).toBeInTheDocument()
      // Should still have base classes
      expect(loadingContainer).toHaveClass('flex')
      expect(loadingContainer).toHaveClass('items-center')
    })
  })

  describe('Spinner Integration', () => {
    it('should render spinner with correct size', () => {
      const { container } = render(<LoadingScreen />)

      // Large spinner should have w-12 h-12
      const spinner = container.querySelector('.w-12.h-12')
      expect(spinner).toBeInTheDocument()
    })

    it('should render spinner with animation', () => {
      const { container } = render(<LoadingScreen />)

      const spinner = container.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
    })

    it('should render spinner SVG', () => {
      const { container } = render(<LoadingScreen />)

      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
      expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
    })
  })

  describe('Responsive Design', () => {
    it('should maintain responsive layout', () => {
      const { container } = render(<LoadingScreen />)

      const loadingContainer = container.querySelector('.min-h-\\[50vh\\]')
      expect(loadingContainer).toBeInTheDocument()
    })

    it('should handle very long messages without breaking layout', () => {
      const longMessage = 'A'.repeat(200)
      const { container } = render(<LoadingScreen message={longMessage} />)

      const loadingContainer = container.querySelector('.flex.flex-col')
      expect(loadingContainer).toBeInTheDocument()
    })
  })
})

