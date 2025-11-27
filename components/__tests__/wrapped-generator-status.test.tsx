import { WrappedGeneratorStatus } from '@/components/generator/wrapped-generator-status'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// Mock Next.js Link component
jest.mock('next/link', () => {
  const MockLink = ({ children, href }: { children: React.ReactNode; href: string }) => {
    return <a href={href}>{children}</a>
  }
  MockLink.displayName = 'Link'
  return MockLink
})

// Mock the toast to prevent infinite loops and timeouts
const mockShowError = jest.fn()
const mockShowSuccess = jest.fn()
const mockShowInfo = jest.fn()
const mockShowToast = jest.fn()

jest.mock('@/components/ui/toast', () => {
  const actual = jest.requireActual('@/components/ui/toast')
  return {
    ...actual,
    useToast: () => ({
      showToast: mockShowToast,
      showSuccess: mockShowSuccess,
      showError: mockShowError,
      showInfo: mockShowInfo,
    }),
    ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }
})

const renderWithToast = (component: React.ReactElement) => {
  return render(component)
}

describe('WrappedGeneratorStatus', () => {
  const mockOnRegenerate = jest.fn()
  const year = 2024

  beforeEach(() => {
    jest.clearAllMocks()
    mockShowError.mockClear()
    mockShowSuccess.mockClear()
    mockShowInfo.mockClear()
    mockShowToast.mockClear()
  })

  describe('Completed State', () => {
    it('should render completed status with success styling', () => {
      renderWithToast(
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
      renderWithToast(
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
      renderWithToast(
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
      renderWithToast(
        <WrappedGeneratorStatus
          status="completed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
          error={errorMessage}
        />
      )

      // Error is shown as toast, not in UI
      expect(mockShowError).toHaveBeenCalledWith(errorMessage, 6000)
    })

    it('should not show regenerate button when completed', () => {
      renderWithToast(
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
      const { container } = renderWithToast(
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
      renderWithToast(
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
      renderWithToast(
        <WrappedGeneratorStatus
          status="failed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
          error={errorMessage}
        />
      )

      // Error is shown as toast, not in UI
      expect(mockShowError).toHaveBeenCalledWith(errorMessage, 6000)
    })

    it('should show Try Again button when failed', () => {
      renderWithToast(
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
      renderWithToast(
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
      renderWithToast(
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
      renderWithToast(
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
      const { container } = renderWithToast(
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
      renderWithToast(
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
      const { container } = renderWithToast(
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
      const { container } = renderWithToast(
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
      renderWithToast(
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
      renderWithToast(
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
      renderWithToast(
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
      renderWithToast(
        <WrappedGeneratorStatus
          status="failed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
          error={longError}
        />
      )

      // Error is shown as toast, not in UI
      expect(mockShowError).toHaveBeenCalledWith(longError, 6000)
    })

    it('should handle error with special characters', () => {
      const errorWithSpecialChars = 'Error: <script>alert("xss")</script>'
      renderWithToast(
        <WrappedGeneratorStatus
          status="failed"
          year={year}
          onRegenerate={mockOnRegenerate}
          isRegenerating={false}
          error={errorWithSpecialChars}
        />
      )

      // Error is shown as toast, not in UI
      expect(mockShowError).toHaveBeenCalledWith(errorWithSpecialChars, 6000)
    })
  })

  describe('Year Display', () => {
    it('should display correct year in completed state', () => {
      renderWithToast(
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
      renderWithToast(
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
      renderWithToast(
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
      renderWithToast(
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
      renderWithToast(
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
      renderWithToast(
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
      renderWithToast(
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
      renderWithToast(
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
      renderWithToast(
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
      renderWithToast(
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
      renderWithToast(
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
      renderWithToast(
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
      const { rerender } = renderWithToast(
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
      const { rerender } = renderWithToast(
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

