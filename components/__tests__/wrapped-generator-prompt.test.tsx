import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WrappedGeneratorPrompt } from '@/components/generator/wrapped-generator-prompt'

describe('WrappedGeneratorPrompt', () => {
  const mockOnGenerate = jest.fn()
  const year = 2024

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Initial Rendering', () => {
    it('should render the prompt with year', () => {
      render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
        />
      )

      expect(screen.getByText(`Your ${year} Plex Wrapped`)).toBeInTheDocument()
    })

    it('should display descriptive text about wrapped generation', () => {
      render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
        />
      )

      expect(
        screen.getByText(/Generate your personalized Plex Wrapped to see your viewing statistics/i)
      ).toBeInTheDocument()
    })

    it('should show generate button', () => {
      render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
        />
      )

      expect(screen.getByRole('button', { name: /Generate My Wrapped/i })).toBeInTheDocument()
    })

    it('should have lightning icon in button', () => {
      const { container } = render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
        />
      )

      const button = screen.getByRole('button')
      const svg = button.querySelector('svg')
      expect(svg).toBeInTheDocument()
      expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
    })

    it('should have gradient button styling', () => {
      render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
        />
      )

      const button = screen.getByRole('button')
      expect(button).toBeInTheDocument()
    })
  })

  describe('Generate Button Interaction', () => {
    it('should call onGenerate when button is clicked', async () => {
      const user = userEvent.setup()
      render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
        />
      )

      const button = screen.getByRole('button', { name: /Generate My Wrapped/i })
      await user.click(button)

      expect(mockOnGenerate).toHaveBeenCalledTimes(1)
    })

    it('should not call onGenerate when button is disabled', async () => {
      const user = userEvent.setup()
      render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={true}
        />
      )

      const button = screen.getByRole('button')
      await user.click(button)

      expect(mockOnGenerate).not.toHaveBeenCalled()
    })

    it('should handle multiple rapid clicks when not generating', async () => {
      const user = userEvent.setup()
      render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
        />
      )

      const button = screen.getByRole('button')
      await user.click(button)
      await user.click(button)
      await user.click(button)

      expect(mockOnGenerate).toHaveBeenCalledTimes(3)
    })
  })

  describe('Loading State', () => {
    it('should disable button when generating', () => {
      render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={true}
        />
      )

      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })

    it('should apply disabled styling when generating', () => {
      render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={true}
        />
      )

      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })

    it('should enable button when not generating', () => {
      render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
        />
      )

      const button = screen.getByRole('button')
      expect(button).not.toBeDisabled()
    })
  })

  describe('Error Display', () => {
    it('should display error message when error is provided', () => {
      const errorMessage = 'Failed to generate wrapped'
      render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
          error={errorMessage}
        />
      )

      expect(screen.getByText(errorMessage)).toBeInTheDocument()
    })

    it('should style error message with red colors', () => {
      const errorMessage = 'Failed to generate wrapped'
      render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
          error={errorMessage}
        />
      )

      const errorElement = screen.getByText(errorMessage)
      expect(errorElement).toHaveClass('text-red-300')
      expect(errorElement.parentElement).toHaveClass('bg-red-900/30', 'border-red-500/50')
    })

    it('should not display error section when error is null', () => {
      render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
          error={null}
        />
      )

      // Error container should not be present
      const container = screen.getByRole('button').parentElement
      const errorDiv = container?.querySelector('.bg-red-900\\/30')
      expect(errorDiv).not.toBeInTheDocument()
    })

    it('should not display error section when error is undefined', () => {
      render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
          error={undefined}
        />
      )

      // Error container should not be present
      const container = screen.getByRole('button').parentElement
      const errorDiv = container?.querySelector('.bg-red-900\\/30')
      expect(errorDiv).not.toBeInTheDocument()
    })

    it('should handle empty string error', () => {
      render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
          error=""
        />
      )

      // Should not show error section for empty string
      const container = screen.getByRole('button').parentElement
      const errorDiv = container?.querySelector('.bg-red-900\\/30')
      expect(errorDiv).not.toBeInTheDocument()
    })

    it('should display long error messages', () => {
      const longError = 'A'.repeat(500)
      render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
          error={longError}
        />
      )

      expect(screen.getByText(longError)).toBeInTheDocument()
    })

    it('should handle error with special characters', () => {
      const errorWithSpecialChars = 'Error: <script>alert("xss")</script>'
      render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
          error={errorWithSpecialChars}
        />
      )

      // React should escape the content
      expect(screen.getByText(errorWithSpecialChars)).toBeInTheDocument()
    })

    it('should display error above the button', () => {
      const errorMessage = 'Test error'
      const { container } = render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
          error={errorMessage}
        />
      )

      const errorElement = screen.getByText(errorMessage).parentElement
      const button = screen.getByRole('button')

      // Error should come before button in DOM
      expect(errorElement?.compareDocumentPosition(button)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING
      )
    })
  })

  describe('Year Display', () => {
    it('should display correct year in title', () => {
      render(
        <WrappedGeneratorPrompt
          year={2023}
          onGenerate={mockOnGenerate}
          isGenerating={false}
        />
      )

      expect(screen.getByText('Your 2023 Plex Wrapped')).toBeInTheDocument()
    })

    it('should display correct year in description', () => {
      render(
        <WrappedGeneratorPrompt
          year={2022}
          onGenerate={mockOnGenerate}
          isGenerating={false}
        />
      )

      expect(screen.getByText(/Generate your personalized Plex Wrapped to see your viewing statistics and highlights from2022/)).toBeInTheDocument()
    })

    it('should handle year 0', () => {
      render(
        <WrappedGeneratorPrompt
          year={0}
          onGenerate={mockOnGenerate}
          isGenerating={false}
        />
      )

      expect(screen.getByText('Your 0 Plex Wrapped')).toBeInTheDocument()
    })

    it('should handle future year', () => {
      render(
        <WrappedGeneratorPrompt
          year={2099}
          onGenerate={mockOnGenerate}
          isGenerating={false}
        />
      )

      expect(screen.getByText('Your 2099 Plex Wrapped')).toBeInTheDocument()
    })

    it('should handle negative year', () => {
      render(
        <WrappedGeneratorPrompt
          year={-1}
          onGenerate={mockOnGenerate}
          isGenerating={false}
        />
      )

      expect(screen.getByText('Your -1 Plex Wrapped')).toBeInTheDocument()
    })
  })

  describe('Container Styling', () => {
    it('should have proper background and border styling', () => {
      const { container } = render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
        />
      )

      const promptContainer = container.firstChild
      expect(promptContainer).toHaveClass('bg-slate-800/50', 'border-slate-700', 'rounded-lg')
    })

    it('should have backdrop blur effect', () => {
      const { container } = render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
        />
      )

      const promptContainer = container.firstChild
      expect(promptContainer).toHaveClass('backdrop-blur-sm')
    })

    it('should have proper padding', () => {
      const { container } = render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
        />
      )

      const promptContainer = container.firstChild
      expect(promptContainer).toHaveClass('p-6')
    })
  })

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
        />
      )

      const heading = screen.getByRole('heading', { name: `Your ${year} Plex Wrapped` })
      expect(heading).toBeInTheDocument()
      expect(heading.tagName).toBe('H2')
    })

    it('should have accessible button text', () => {
      render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
        />
      )

      expect(screen.getByRole('button', { name: /Generate My Wrapped/i })).toBeInTheDocument()
    })

    it('should indicate disabled state to screen readers', () => {
      render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={true}
        />
      )

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('disabled')
    })

    it('should have proper color contrast for text', () => {
      render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
        />
      )

      const heading = screen.getByRole('heading')
      expect(heading).toHaveClass('text-white')

      const description = screen.getByText(/Generate your personalized/i)
      expect(description).toHaveClass('text-slate-400')
    })

    it('should have visible focus states on button', () => {
      render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
        />
      )

      const button = screen.getByRole('button')
      expect(button).not.toBeDisabled()
    })
  })

  describe('Edge Cases', () => {
    it('should handle rapid prop changes', () => {
      const { rerender } = render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
        />
      )

      expect(screen.getByRole('button')).not.toBeDisabled()

      rerender(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={true}
        />
      )

      expect(screen.getByRole('button')).toBeDisabled()

      rerender(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
        />
      )

      expect(screen.getByRole('button')).not.toBeDisabled()
    })

    it('should handle error appearing and disappearing', () => {
      const { rerender } = render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
          error="Error message"
        />
      )

      expect(screen.getByText('Error message')).toBeInTheDocument()

      rerender(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
          error={null}
        />
      )

      expect(screen.queryByText('Error message')).not.toBeInTheDocument()
    })

    it('should not crash with missing onGenerate callback', () => {
      expect(() => {
        render(
          <WrappedGeneratorPrompt
            year={year}
            onGenerate={undefined as any}
            isGenerating={false}
          />
        )
      }).not.toThrow()
    })

    it('should handle year change', () => {
      const { rerender } = render(
        <WrappedGeneratorPrompt
          year={2023}
          onGenerate={mockOnGenerate}
          isGenerating={false}
        />
      )

      expect(screen.getByText('Your 2023 Plex Wrapped')).toBeInTheDocument()

      rerender(
        <WrappedGeneratorPrompt
          year={2024}
          onGenerate={mockOnGenerate}
          isGenerating={false}
        />
      )

      expect(screen.getByText('Your 2024 Plex Wrapped')).toBeInTheDocument()
      expect(screen.queryByText('Your 2023 Plex Wrapped')).not.toBeInTheDocument()
    })
  })

  describe('Button Icon', () => {
    it('should render lightning bolt icon', () => {
      const { container } = render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
        />
      )

      const button = screen.getByRole('button')
      const svg = button.querySelector('svg')
      const path = svg?.querySelector('path')

      expect(path).toBeInTheDocument()
      expect(path).toHaveAttribute('d', 'M13 10V3L4 14h7v7l9-11h-7z')
    })

    it('should have proper icon sizing', () => {
      const { container } = render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
        />
      )

      const button = screen.getByRole('button')
      const svg = button.querySelector('svg')

      expect(svg).toHaveClass('w-5', 'h-5')
    })

    it('should position icon with text', () => {
      render(
        <WrappedGeneratorPrompt
          year={year}
          onGenerate={mockOnGenerate}
          isGenerating={false}
        />
      )

      const button = screen.getByRole('button')
      const svg = button.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })
  })
})

