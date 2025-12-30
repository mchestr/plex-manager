import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StyledInput } from '@/components/ui/input'
import { createRef } from 'react'

describe('StyledInput', () => {
  describe('Size Variants', () => {
    it('should render with small size variant', () => {
      render(<StyledInput size="sm" data-testid="input-sm" />)
      const input = screen.getByTestId('input-sm')
      expect(input).toHaveClass('px-3', 'py-1.5', 'text-sm')
    })

    it('should render with medium size variant (default)', () => {
      render(<StyledInput data-testid="input-md" />)
      const input = screen.getByTestId('input-md')
      expect(input).toHaveClass('px-4', 'py-2', 'text-sm')
    })

    it('should render with large size variant', () => {
      render(<StyledInput size="lg" data-testid="input-lg" />)
      const input = screen.getByTestId('input-lg')
      expect(input).toHaveClass('px-4', 'py-2.5', 'text-base')
    })
  })

  describe('Error State', () => {
    it('should apply error styling when error={true}', () => {
      render(<StyledInput error={true} data-testid="input-error" />)
      const input = screen.getByTestId('input-error')
      expect(input).toHaveClass('border-red-500/50', 'focus-visible:border-red-400', 'focus-visible:ring-red-400')
    })

    it('should not apply error styling when error={false}', () => {
      render(<StyledInput error={false} data-testid="input-no-error" />)
      const input = screen.getByTestId('input-no-error')
      expect(input).toHaveClass('border-slate-600', 'hover:border-slate-500')
      expect(input).not.toHaveClass('border-red-500/50')
    })

    it('should set aria-invalid="true" when error={true}', () => {
      render(<StyledInput error={true} data-testid="input-error" />)
      const input = screen.getByTestId('input-error')
      expect(input).toHaveAttribute('aria-invalid', 'true')
    })

    it('should not set aria-invalid when error={false}', () => {
      render(<StyledInput error={false} data-testid="input-no-error" />)
      const input = screen.getByTestId('input-no-error')
      expect(input).not.toHaveAttribute('aria-invalid')
    })
  })

  describe('Ref Forwarding', () => {
    it('should forward ref correctly', () => {
      const ref = createRef<HTMLInputElement>()
      render(<StyledInput ref={ref} data-testid="input-ref" />)
      expect(ref.current).toBeInstanceOf(HTMLInputElement)
      expect(ref.current).toBe(screen.getByTestId('input-ref'))
    })

    it('should allow ref methods to be called', () => {
      const ref = createRef<HTMLInputElement>()
      render(<StyledInput ref={ref} />)
      ref.current?.focus()
      expect(document.activeElement).toBe(ref.current)
    })
  })

  describe('Disabled State', () => {
    it('should handle disabled state', () => {
      render(<StyledInput disabled data-testid="input-disabled" />)
      const input = screen.getByTestId('input-disabled')
      expect(input).toBeDisabled()
      expect(input).toHaveClass('disabled:opacity-50', 'disabled:cursor-not-allowed')
    })

    it('should not be interactive when disabled', async () => {
      const user = userEvent.setup()
      render(<StyledInput disabled data-testid="input-disabled" />)
      const input = screen.getByTestId('input-disabled')

      await user.click(input)
      expect(input).not.toHaveFocus()
    })
  })

  describe('Custom ClassName', () => {
    it('should apply custom className correctly', () => {
      render(<StyledInput className="custom-class" data-testid="input-custom" />)
      const input = screen.getByTestId('input-custom')
      expect(input).toHaveClass('custom-class')
    })

    it('should merge custom className with default classes', () => {
      render(<StyledInput className="custom-class" data-testid="input-custom" />)
      const input = screen.getByTestId('input-custom')
      expect(input).toHaveClass('custom-class')
      expect(input).toHaveClass('w-full', 'bg-slate-800/50', 'border', 'rounded-lg')
    })
  })

  describe('Class Merging with cn() Utility', () => {
    it('should properly merge classes using cn() utility', () => {
      render(<StyledInput size="sm" error={true} className="mb-4" data-testid="input-merged" />)
      const input = screen.getByTestId('input-merged')

      // Should have size classes
      expect(input).toHaveClass('px-3', 'py-1.5', 'text-sm')

      // Should have error classes
      expect(input).toHaveClass('border-red-500/50')

      // Should have custom class
      expect(input).toHaveClass('mb-4')

      // Should have base classes
      expect(input).toHaveClass('w-full', 'bg-slate-800/50')
    })

    it('should handle conflicting classes correctly', () => {
      // cn() utility from tailwind-merge should handle conflicts
      render(<StyledInput className="border-blue-500" data-testid="input-conflict" />)
      const input = screen.getByTestId('input-conflict')
      expect(input).toBeInTheDocument()
    })
  })

  describe('Data TestId', () => {
    it('should use provided data-testid', () => {
      render(<StyledInput data-testid="custom-testid" />)
      expect(screen.getByTestId('custom-testid')).toBeInTheDocument()
    })

    it('should generate testid from name if not provided', () => {
      render(<StyledInput name="username" />)
      expect(screen.getByTestId('setup-input-username')).toBeInTheDocument()
    })

    it('should prefer explicit data-testid over generated one', () => {
      render(<StyledInput name="username" data-testid="custom-testid" />)
      expect(screen.getByTestId('custom-testid')).toBeInTheDocument()
    })

    it('should not have testid when neither name nor data-testid is provided', () => {
      const { container } = render(<StyledInput placeholder="test" />)
      const input = container.querySelector('input')
      expect(input).not.toHaveAttribute('data-testid')
    })
  })

  describe('User Interaction', () => {
    it('should accept user input', async () => {
      const user = userEvent.setup()
      render(<StyledInput data-testid="input-interaction" />)
      const input = screen.getByTestId('input-interaction') as HTMLInputElement

      await user.type(input, 'Hello World')
      expect(input.value).toBe('Hello World')
    })

    it('should trigger onChange handler', async () => {
      const user = userEvent.setup()
      const handleChange = jest.fn()
      render(<StyledInput onChange={handleChange} data-testid="input-change" />)
      const input = screen.getByTestId('input-change')

      await user.type(input, 'test')
      expect(handleChange).toHaveBeenCalled()
    })

    it('should be focusable', async () => {
      const user = userEvent.setup()
      render(<StyledInput data-testid="input-focus" />)
      const input = screen.getByTestId('input-focus')

      await user.click(input)
      expect(input).toHaveFocus()
    })
  })

  describe('Additional Props', () => {
    it('should pass through additional HTML input attributes', () => {
      render(
        <StyledInput
          data-testid="input-props"
          type="email"
          placeholder="Enter email"
          required
          maxLength={50}
        />
      )
      const input = screen.getByTestId('input-props')

      expect(input).toHaveAttribute('type', 'email')
      expect(input).toHaveAttribute('placeholder', 'Enter email')
      expect(input).toHaveAttribute('required')
      expect(input).toHaveAttribute('maxLength', '50')
    })

    it('should handle value prop', () => {
      render(<StyledInput value="test value" data-testid="input-value" readOnly />)
      const input = screen.getByTestId('input-value') as HTMLInputElement
      expect(input.value).toBe('test value')
    })

    it('should handle name prop', () => {
      render(<StyledInput name="email" data-testid="input-name" />)
      const input = screen.getByTestId('input-name')
      expect(input).toHaveAttribute('name', 'email')
    })
  })

  describe('Accessibility', () => {
    it('should have proper accessible attributes', () => {
      render(<StyledInput data-testid="input-a11y" />)
      const input = screen.getByTestId('input-a11y')
      expect(input).toBeInTheDocument()
      expect(input.tagName).toBe('INPUT')
    })

    it('should be keyboard accessible', async () => {
      const user = userEvent.setup()
      render(<StyledInput data-testid="input-keyboard" />)
      const input = screen.getByTestId('input-keyboard')

      await user.tab()
      expect(input).toHaveFocus()
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty props', () => {
      render(<StyledInput data-testid="input-empty" />)
      expect(screen.getByTestId('input-empty')).toBeInTheDocument()
    })

    it('should handle all size variants combined with error state', () => {
      const { rerender } = render(<StyledInput size="sm" error={true} data-testid="input-combo" />)
      let input = screen.getByTestId('input-combo')
      expect(input).toHaveClass('px-3', 'py-1.5', 'text-sm', 'border-red-500/50')

      rerender(<StyledInput size="md" error={true} data-testid="input-combo" />)
      input = screen.getByTestId('input-combo')
      expect(input).toHaveClass('px-4', 'py-2', 'text-sm', 'border-red-500/50')

      rerender(<StyledInput size="lg" error={true} data-testid="input-combo" />)
      input = screen.getByTestId('input-combo')
      expect(input).toHaveClass('px-4', 'py-2.5', 'text-base', 'border-red-500/50')
    })
  })
})
