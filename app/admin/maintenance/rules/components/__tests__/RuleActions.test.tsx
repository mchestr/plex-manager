import { render, screen } from '@testing-library/react'
import { RuleActions } from '../RuleActions'

// Mock next/link
jest.mock('next/link', () => {
  return ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  )
})

describe('RuleActions', () => {
  describe('Basic Rendering', () => {
    it('should render create rule link', () => {
      render(<RuleActions />)

      const link = screen.getByRole('link', { name: /Create Rule/i })
      expect(link).toBeInTheDocument()
    })

    it('should link to new rule page', () => {
      render(<RuleActions />)

      const link = screen.getByRole('link')
      expect(link).toHaveAttribute('href', '/admin/maintenance/rules/new')
    })

    it('should display "Create Rule" text', () => {
      render(<RuleActions />)

      expect(screen.getByText('Create Rule')).toBeInTheDocument()
    })
  })

  describe('Styling', () => {
    it('should have proper button styling classes', () => {
      render(<RuleActions />)

      const link = screen.getByRole('link')
      expect(link).toHaveClass('px-4', 'py-2')
      expect(link).toHaveClass('bg-cyan-600')
      expect(link).toHaveClass('hover:bg-cyan-500')
      expect(link).toHaveClass('text-white')
      expect(link).toHaveClass('rounded-lg')
      expect(link).toHaveClass('font-medium')
    })

    it('should have flex layout with gap for icon', () => {
      render(<RuleActions />)

      const link = screen.getByRole('link')
      expect(link).toHaveClass('flex', 'items-center', 'gap-2')
    })

    it('should have transition effect', () => {
      render(<RuleActions />)

      const link = screen.getByRole('link')
      expect(link).toHaveClass('transition-colors')
    })
  })

  describe('Icon', () => {
    it('should render plus icon', () => {
      const { container } = render(<RuleActions />)

      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it('should have proper icon size', () => {
      const { container } = render(<RuleActions />)

      const svg = container.querySelector('svg')
      expect(svg).toHaveClass('w-5', 'h-5')
    })

    it('should have plus icon path', () => {
      const { container } = render(<RuleActions />)

      const path = container.querySelector('path')
      expect(path).toBeInTheDocument()
      expect(path).toHaveAttribute('d', 'M12 4v16m8-8H4')
    })
  })

  describe('Accessibility', () => {
    it('should be keyboard accessible as a link', () => {
      render(<RuleActions />)

      const link = screen.getByRole('link')
      expect(link).toBeInTheDocument()
      // Links are inherently keyboard accessible
    })
  })
})
