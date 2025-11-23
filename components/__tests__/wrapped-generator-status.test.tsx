import { WrappedGeneratorStatus } from '@/components/generator/wrapped-generator-status'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock Next.js Link component
jest.mock('next/link', () => {
  const MockLink = ({ children, href }: { children: React.ReactNode; href: string }) => {
    return <a href={href}>{children}</a>
  }
  MockLink.displayName = 'Link'
  return MockLink
})

describe('WrappedGeneratorStatus', () => {
  const mockOnRegenerate = jest.fn()
  const year = 2024

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Completed State', () => {
    it('should render completed status with success styling', () => {
      render(
        <WrappedGeneratorStatus
          status="completed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
        />
      )

      expect(screen.getByText(`Your ${year} Plex Wrapped`)).toBeInTheDocument()
      expect(screen.getByText('Ready')).toBeInTheDocument()
      expect(screen.getByText('Ready')).toHaveClass('bg-green-500/20', 'text-green-400')
    })

    it('should display success message when completed', () => {
      render(
        <WrappedGeneratorStatus
          status="completed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
        />
      )

      expect(screen.getByText(`Your Plex Wrapped for ${year} has been generated!`)).toBeInTheDocument()
    })

    it('should show link to view wrapped when completed', () => {
      render(
        <WrappedGeneratorStatus
          status="completed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
        />
      )

      const link = screen.getByText('View Your Wrapped')
      expect(link).toBeInTheDocument()
      expect(link.closest('a')).toHaveAttribute('href', '/wrapped')
    })

    it('should display error message even when completed if error is provided', () => {
      const errorMessage = 'Warning: Some data was incomplete'
      render(
        <WrappedGeneratorStatus
          status="completed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
          error={errorMessage}
        />
      )

      expect(screen.getByText(errorMessage)).toBeInTheDocument()
      expect(screen.getByText(errorMessage)).toHaveClass('text-red-300')
    })

    it('should not show regenerate button when completed', () => {
      render(
        <WrappedGeneratorStatus
          status="completed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
        />
      )

      expect(screen.queryByText('Try Again')).not.toBeInTheDocument()
    })

    it('should have proper styling for completed state container', () => {
      const { container } = render(
        <WrappedGeneratorStatus
          status="completed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
        />
      )

      const statusContainer = container.firstChild
      expect(statusContainer).toHaveClass('bg-slate-800/50', 'border-slate-700')
    })
  })

  describe('Failed State', () => {
    it('should render failed status with error styling', () => {
      render(
        <WrappedGeneratorStatus
          status="failed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
        />
      )

      expect(screen.getByText(`Your ${year} Plex Wrapped`)).toBeInTheDocument()
      expect(screen.getByText('Failed')).toBeInTheDocument()
      expect(screen.getByText('Failed')).toHaveClass('bg-red-500/20', 'text-red-400')
    })

    it('should display error message when failed', () => {
      const errorMessage = 'Generation failed due to timeout'
      render(
        <WrappedGeneratorStatus
          status="failed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
          error={errorMessage}
        />
      )

      expect(screen.getByText(errorMessage)).toBeInTheDocument()
      expect(screen.getByText(errorMessage)).toHaveClass('text-red-300')
    })

    it('should show Try Again button when failed', () => {
      render(
        <WrappedGeneratorStatus
          status="failed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
        />
      )

      expect(screen.getByText('Try Again')).toBeInTheDocument()
    })

    it('should call onRegenerate when Try Again is clicked', async () => {
      const user = userEvent.setup()
      render(
        <WrappedGeneratorStatus
          status="failed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
        />
      )

      const tryAgainButton = screen.getByText('Try Again')
      await user.click(tryAgainButton)

      expect(mockOnRegenerate).toHaveBeenCalledTimes(1)
    })

    it('should disable Try Again button when regenerating', () => {
      render(
        <WrappedGeneratorStatus
          status="failed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={true}
        />
      )

      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
      expect(button).toHaveClass('disabled:opacity-50', 'disabled:cursor-not-allowed')
    })

    it('should show loading spinner when regenerating', () => {
      render(
        <WrappedGeneratorStatus
          status="failed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={true}
        />
      )

      expect(screen.getByText('Generating...')).toBeInTheDocument()

      // Check for spinner SVG
      const spinner = screen.getByRole('button').querySelector('svg')
      expect(spinner).toBeInTheDocument()
      expect(spinner).toHaveClass('animate-spin')
    })

    it('should have proper styling for failed state container', () => {
      const { container } = render(
        <WrappedGeneratorStatus
          status="failed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
        />
      )

      const statusContainer = container.firstChild
      expect(statusContainer).toHaveClass('bg-slate-800/50', 'border-red-500/50')
    })

    it('should not show View Wrapped link when failed', () => {
      render(
        <WrappedGeneratorStatus
          status="failed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
        />
      )

      expect(screen.queryByText('View Your Wrapped')).not.toBeInTheDocument()
    })
  })

  describe('Generating State', () => {
    it('should return null for generating status', () => {
      const { container } = render(
        <WrappedGeneratorStatus
          status="generating"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
        />
      )

      expect(container.firstChild).toBeNull()
    })
  })

  describe('Null State', () => {
    it('should return null when status is null', () => {
      const { container } = render(
        <WrappedGeneratorStatus
          status={null}
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
        />
      )

      expect(container.firstChild).toBeNull()
    })
  })

  describe('Error Handling', () => {
    it('should handle null error gracefully in completed state', () => {
      render(
        <WrappedGeneratorStatus
          status="completed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
          error={null}
        />
      )

      // Should not show error section
      const errorElements = screen.queryByText(/Warning/i)
      expect(errorElements).not.toBeInTheDocument()
    })

    it('should handle undefined error gracefully in completed state', () => {
      render(
        <WrappedGeneratorStatus
          status="completed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
          error={undefined}
        />
      )

      // Should render without error section
      expect(screen.getByText('View Your Wrapped')).toBeInTheDocument()
    })

    it('should handle empty string error in failed state', () => {
      render(
        <WrappedGeneratorStatus
          status="failed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
          error=""
        />
      )

      // Should still show Try Again button
      expect(screen.getByText('Try Again')).toBeInTheDocument()
    })

    it('should handle long error messages', () => {
      const longError = 'A'.repeat(500)
      render(
        <WrappedGeneratorStatus
          status="failed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
          error={longError}
        />
      )

      expect(screen.getByText(longError)).toBeInTheDocument()
    })

    it('should handle error with special characters', () => {
      const errorWithSpecialChars = 'Error: <script>alert("xss")</script>'
      render(
        <WrappedGeneratorStatus
          status="failed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
          error={errorWithSpecialChars}
        />
      )

      // React should escape the content
      expect(screen.getByText(errorWithSpecialChars)).toBeInTheDocument()
    })
  })

  describe('Year Display', () => {
    it('should display correct year in completed state', () => {
      render(
        <WrappedGeneratorStatus
          status="completed"
          year={2023}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
        />
      )

      expect(screen.getByText('Your 2023 Plex Wrapped')).toBeInTheDocument()
      expect(screen.getByText('Your Plex Wrapped for 2023 has been generated!')).toBeInTheDocument()
    })

    it('should display correct year in failed state', () => {
      render(
        <WrappedGeneratorStatus
          status="failed"
          year={2022}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
        />
      )

      expect(screen.getByText('Your 2022 Plex Wrapped')).toBeInTheDocument()
    })

    it('should handle year 0', () => {
      render(
        <WrappedGeneratorStatus
          status="completed"
          year={0}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
        />
      )

      expect(screen.getByText('Your 0 Plex Wrapped')).toBeInTheDocument()
    })

    it('should handle future year', () => {
      render(
        <WrappedGeneratorStatus
          status="completed"
          year={2099}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
        />
      )

      expect(screen.getByText('Your 2099 Plex Wrapped')).toBeInTheDocument()
    })
  })

  describe('Button States', () => {
    it('should have proper button styling when not regenerating', () => {
      render(
        <WrappedGeneratorStatus
          status="failed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
        />
      )

      const button = screen.getByRole('button')
      expect(button).toHaveClass('bg-cyan-600', 'hover:bg-cyan-700')
      expect(button).not.toBeDisabled()
    })

    it('should prevent multiple clicks when regenerating', async () => {
      const user = userEvent.setup()
      render(
        <WrappedGeneratorStatus
          status="failed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={true}
        />
      )

      const button = screen.getByRole('button')

      // Try to click multiple times
      await user.click(button)
      await user.click(button)
      await user.click(button)

      // Should not call onRegenerate because button is disabled
      expect(mockOnRegenerate).not.toHaveBeenCalled()
    })

    it('should show correct text when not regenerating', () => {
      render(
        <WrappedGeneratorStatus
          status="failed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
        />
      )

      expect(screen.getByText('Try Again')).toBeInTheDocument()
      expect(screen.queryByText('Generating...')).not.toBeInTheDocument()
    })

    it('should show correct text when regenerating', () => {
      render(
        <WrappedGeneratorStatus
          status="failed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={true}
        />
      )

      expect(screen.getByText('Generating...')).toBeInTheDocument()
      expect(screen.queryByText('Try Again')).not.toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have proper semantic HTML in completed state', () => {
      render(
        <WrappedGeneratorStatus
          status="completed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
        />
      )

      // Should have heading
      expect(screen.getByRole('heading', { name: `Your ${year} Plex Wrapped` })).toBeInTheDocument()

      // Should have link
      expect(screen.getByRole('link', { name: 'View Your Wrapped' })).toBeInTheDocument()
    })

    it('should have proper semantic HTML in failed state', () => {
      render(
        <WrappedGeneratorStatus
          status="failed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
        />
      )

      // Should have heading
      expect(screen.getByRole('heading', { name: `Your ${year} Plex Wrapped` })).toBeInTheDocument()

      // Should have button
      expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument()
    })

    it('should indicate loading state to screen readers', () => {
      render(
        <WrappedGeneratorStatus
          status="failed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={true}
        />
      )

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('disabled')
    })

    it('should have proper color contrast for text', () => {
      render(
        <WrappedGeneratorStatus
          status="completed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
        />
      )

      const heading = screen.getByRole('heading')
      expect(heading).toHaveClass('text-white')
    })
  })

  describe('Edge Cases', () => {
    it('should handle rapid status changes', () => {
      const { rerender } = render(
        <WrappedGeneratorStatus
          status="failed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
        />
      )

      expect(screen.getByText('Try Again')).toBeInTheDocument()

      rerender(
        <WrappedGeneratorStatus
          status="completed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
        />
      )

      expect(screen.getByText('View Your Wrapped')).toBeInTheDocument()
      expect(screen.queryByText('Try Again')).not.toBeInTheDocument()
    })

    it('should handle regenerating flag change', () => {
      const { rerender } = render(
        <WrappedGeneratorStatus
          status="failed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
        />
      )

      expect(screen.getByText('Try Again')).toBeInTheDocument()

      rerender(
        <WrappedGeneratorStatus
          status="failed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={true}
        />
      )

      expect(screen.getByText('Generating...')).toBeInTheDocument()
    })

    it('should not crash with missing onRegenerate callback', () => {
      expect(() => {
        render(
          <WrappedGeneratorStatus
            status="failed"
            year={year}
            onRegenerate={undefined as any}
            isRegenerating={false}
          />
        )
      }).not.toThrow()
    })
  })
})

