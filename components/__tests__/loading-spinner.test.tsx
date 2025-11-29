import { render } from '@testing-library/react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'

describe('LoadingSpinner', () => {
  describe('Basic Rendering', () => {
    it('should render with default size', () => {
      const { container } = render(<LoadingSpinner />)

      const spinner = container.querySelector('.w-8.h-8')
      expect(spinner).toBeInTheDocument()
    })

    it('should render with role="status"', () => {
      const { container } = render(<LoadingSpinner />)

      const spinner = container.querySelector('[role="status"]')
      expect(spinner).toBeInTheDocument()
    })

    it('should have accessible label', () => {
      const { container } = render(<LoadingSpinner />)

      const spinner = container.querySelector('[role="status"]')
      expect(spinner).toHaveAttribute('aria-label', 'Loading...')
    })

    it('should render SVG element', () => {
      const { container } = render(<LoadingSpinner />)

      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
      expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
      expect(svg).toHaveAttribute('fill', 'none')
    })
  })

  describe('Size Variants', () => {
    it('should render small size', () => {
      const { container } = render(<LoadingSpinner size="sm" />)

      const spinner = container.querySelector('.w-4.h-4')
      expect(spinner).toBeInTheDocument()
    })

    it('should render medium size', () => {
      const { container } = render(<LoadingSpinner size="md" />)

      const spinner = container.querySelector('.w-8.h-8')
      expect(spinner).toBeInTheDocument()
    })

    it('should render large size', () => {
      const { container } = render(<LoadingSpinner size="lg" />)

      const spinner = container.querySelector('.w-12.h-12')
      expect(spinner).toBeInTheDocument()
    })

    it('should render extra large size', () => {
      const { container } = render(<LoadingSpinner size="xl" />)

      const spinner = container.querySelector('.w-16.h-16')
      expect(spinner).toBeInTheDocument()
    })
  })

  describe('Animation', () => {
    it('should have spin animation', () => {
      const { container } = render(<LoadingSpinner />)

      const svg = container.querySelector('.animate-spin')
      expect(svg).toBeInTheDocument()
    })

    it('should have proper color classes', () => {
      const { container } = render(<LoadingSpinner />)

      const svg = container.querySelector('.text-slate-200')
      expect(svg).toBeInTheDocument()
    })

    it('should render circle with opacity', () => {
      const { container } = render(<LoadingSpinner />)

      const circle = container.querySelector('circle')
      expect(circle).toBeInTheDocument()
      expect(circle).toHaveClass('opacity-25')
    })

    it('should render path with opacity', () => {
      const { container } = render(<LoadingSpinner />)

      const path = container.querySelector('path')
      expect(path).toBeInTheDocument()
      expect(path).toHaveClass('opacity-75')
    })
  })

  describe('Custom ClassName', () => {
    it('should apply custom className to container', () => {
      const { container } = render(<LoadingSpinner className="custom-class" />)

      const spinner = container.querySelector('.custom-class')
      expect(spinner).toBeInTheDocument()
    })

    it('should merge custom className with default classes', () => {
      const { container } = render(<LoadingSpinner className="custom-class" />)

      const spinner = container.querySelector('[role="status"]')
      expect(spinner).toHaveClass('custom-class')
      expect(spinner).toHaveClass('flex')
      expect(spinner).toHaveClass('items-center')
      expect(spinner).toHaveClass('justify-center')
    })

    it('should handle multiple custom classes', () => {
      const { container } = render(<LoadingSpinner className="class-1 class-2 class-3" />)

      const spinner = container.querySelector('[role="status"]')
      expect(spinner).toHaveClass('class-1')
      expect(spinner).toHaveClass('class-2')
      expect(spinner).toHaveClass('class-3')
    })
  })

  describe('HTML Attributes', () => {
    it('should pass through additional HTML attributes', () => {
      const { container } = render(<LoadingSpinner data-testid="spinner" />)

      const spinner = container.querySelector('[data-testid="spinner"]')
      expect(spinner).toBeInTheDocument()
    })

    it('should support id attribute', () => {
      const { container } = render(<LoadingSpinner id="my-spinner" />)

      const spinner = container.querySelector('#my-spinner')
      expect(spinner).toBeInTheDocument()
    })

    it('should support aria attributes', () => {
      const { container } = render(<LoadingSpinner aria-label="Custom loading" />)

      const spinner = container.querySelector('[aria-label="Custom loading"]')
      expect(spinner).toBeInTheDocument()
    })

    it('should support style attribute', () => {
      const { container } = render(<LoadingSpinner style={{ opacity: 0.5 }} />)

      const spinner = container.querySelector('[role="status"]')
      expect(spinner).toHaveStyle({ opacity: 0.5 })
    })
  })

  describe('SVG Structure', () => {
    it('should have correct SVG attributes', () => {
      const { container } = render(<LoadingSpinner />)

      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('xmlns', 'http://www.w3.org/2000/svg')
      expect(svg).toHaveAttribute('fill', 'none')
      expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
    })

    it('should render circle with correct attributes', () => {
      const { container } = render(<LoadingSpinner />)

      const circle = container.querySelector('circle')
      expect(circle).toHaveAttribute('cx', '12')
      expect(circle).toHaveAttribute('cy', '12')
      expect(circle).toHaveAttribute('r', '10')
      expect(circle).toHaveAttribute('stroke', 'currentColor')
      expect(circle).toHaveAttribute('stroke-width', '4')
    })

    it('should render path with correct d attribute', () => {
      const { container } = render(<LoadingSpinner />)

      const path = container.querySelector('path')
      expect(path).toHaveAttribute('fill', 'currentColor')
      expect(path).toHaveAttribute('d')
    })
  })

  describe('Layout', () => {
    it('should have flex container', () => {
      const { container } = render(<LoadingSpinner />)

      const spinner = container.querySelector('.flex')
      expect(spinner).toBeInTheDocument()
    })

    it('should center content', () => {
      const { container } = render(<LoadingSpinner />)

      const spinner = container.querySelector('.items-center.justify-center')
      expect(spinner).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('should handle undefined size prop', () => {
      const { container } = render(<LoadingSpinner size={undefined} />)

      // Should default to medium size
      const spinner = container.querySelector('.w-8.h-8')
      expect(spinner).toBeInTheDocument()
    })

    it('should handle undefined className', () => {
      const { container } = render(<LoadingSpinner className={undefined} />)

      const spinner = container.querySelector('[role="status"]')
      expect(spinner).toBeInTheDocument()
    })

    it('should handle multiple renders with different sizes', () => {
      const { container, rerender } = render(<LoadingSpinner size="sm" />)
      expect(container.querySelector('.w-4.h-4')).toBeInTheDocument()

      rerender(<LoadingSpinner size="xl" />)
      expect(container.querySelector('.w-16.h-16')).toBeInTheDocument()
      expect(container.querySelector('.w-4.h-4')).not.toBeInTheDocument()
    })

    it('should handle empty className string', () => {
      const { container } = render(<LoadingSpinner className="" />)

      const spinner = container.querySelector('[role="status"]')
      expect(spinner).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have role="status" for screen readers', () => {
      const { container } = render(<LoadingSpinner />)

      const spinner = container.querySelector('[role="status"]')
      expect(spinner).toBeInTheDocument()
    })

    it('should have aria-label for screen readers', () => {
      const { container } = render(<LoadingSpinner />)

      const spinner = container.querySelector('[role="status"]')
      expect(spinner).toHaveAttribute('aria-label', 'Loading...')
    })

    it('should be visible to screen readers', () => {
      const { container } = render(<LoadingSpinner />)

      const spinner = container.querySelector('[role="status"]')
      expect(spinner).not.toHaveAttribute('aria-hidden', 'true')
    })
  })

  describe('Integration', () => {
    it('should work with all props combined', () => {
      const { container } = render(
        <LoadingSpinner
          size="lg"
          className="custom-class"
          data-testid="integration-spinner"
          id="spinner-id"
        />
      )

      const spinner = container.querySelector('[role="status"]')
      expect(spinner).toBeInTheDocument()
      expect(spinner).toHaveClass('custom-class')
      expect(spinner).toHaveAttribute('data-testid', 'integration-spinner')
      expect(spinner).toHaveAttribute('id', 'spinner-id')

      const svg = container.querySelector('.w-12.h-12')
      expect(svg).toBeInTheDocument()
    })

    it('should maintain accessibility with custom props', () => {
      const { container } = render(
        <LoadingSpinner
          size="xl"
          className="opacity-50"
          label="Custom loading indicator"
        />
      )

      const spinner = container.querySelector('[role="status"]')
      expect(spinner).toHaveAttribute('aria-label', 'Custom loading indicator')
      expect(spinner).toHaveClass('opacity-50')
    })
  })

  describe('Responsive Design', () => {
    it('should render correctly at all size variants', () => {
      const sizes: Array<'sm' | 'md' | 'lg' | 'xl'> = ['sm', 'md', 'lg', 'xl']
      const expectedClasses = ['w-4.h-4', 'w-8.h-8', 'w-12.h-12', 'w-16.h-16']

      sizes.forEach((size, index) => {
        const { container } = render(<LoadingSpinner size={size} />)
        const spinner = container.querySelector(`.${expectedClasses[index].replace('.', '.')}`)
        expect(spinner).toBeInTheDocument()
      })
    })
  })

  describe('Visual Consistency', () => {
    it('should use consistent color scheme', () => {
      const { container } = render(<LoadingSpinner />)

      const svg = container.querySelector('svg')
      expect(svg).toHaveClass('text-slate-200')
    })

    it('should maintain aspect ratio', () => {
      const { container } = render(<LoadingSpinner size="lg" />)

      const svg = container.querySelector('.w-12.h-12')
      expect(svg).toBeInTheDocument()
    })
  })
})

