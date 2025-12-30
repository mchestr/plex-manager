import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StyledTextarea } from '@/components/ui/textarea'
import { createRef } from 'react'

describe('StyledTextarea', () => {
  describe('Size Variants', () => {
    it('should render with small size variant', () => {
      render(<StyledTextarea size="sm" data-testid="textarea-sm" />)
      const textarea = screen.getByTestId('textarea-sm')
      expect(textarea).toHaveClass('px-3', 'py-1.5', 'text-sm')
    })

    it('should render with medium size variant (default)', () => {
      render(<StyledTextarea data-testid="textarea-md" />)
      const textarea = screen.getByTestId('textarea-md')
      expect(textarea).toHaveClass('px-4', 'py-2', 'text-sm')
    })

    it('should render with large size variant', () => {
      render(<StyledTextarea size="lg" data-testid="textarea-lg" />)
      const textarea = screen.getByTestId('textarea-lg')
      expect(textarea).toHaveClass('px-4', 'py-2.5', 'text-base')
    })
  })

  describe('Error State', () => {
    it('should apply error styling when error={true}', () => {
      render(<StyledTextarea error={true} data-testid="textarea-error" />)
      const textarea = screen.getByTestId('textarea-error')
      expect(textarea).toHaveClass('border-red-500/50', 'focus-visible:border-red-400', 'focus-visible:ring-red-400')
    })

    it('should not apply error styling when error={false}', () => {
      render(<StyledTextarea error={false} data-testid="textarea-no-error" />)
      const textarea = screen.getByTestId('textarea-no-error')
      expect(textarea).toHaveClass('border-slate-600', 'hover:border-slate-500')
      expect(textarea).not.toHaveClass('border-red-500/50')
    })

    it('should set aria-invalid="true" when error={true}', () => {
      render(<StyledTextarea error={true} data-testid="textarea-error" />)
      const textarea = screen.getByTestId('textarea-error')
      expect(textarea).toHaveAttribute('aria-invalid', 'true')
    })

    it('should not set aria-invalid when error={false}', () => {
      render(<StyledTextarea error={false} data-testid="textarea-no-error" />)
      const textarea = screen.getByTestId('textarea-no-error')
      expect(textarea).not.toHaveAttribute('aria-invalid')
    })
  })

  describe('Resize Prop', () => {
    it('should render with resize="none"', () => {
      render(<StyledTextarea resize="none" data-testid="textarea-resize-none" />)
      const textarea = screen.getByTestId('textarea-resize-none')
      expect(textarea).toHaveClass('resize-none')
    })

    it('should render with resize="vertical" (default)', () => {
      render(<StyledTextarea data-testid="textarea-resize-default" />)
      const textarea = screen.getByTestId('textarea-resize-default')
      expect(textarea).toHaveClass('resize-y')
    })

    it('should render with resize="horizontal"', () => {
      render(<StyledTextarea resize="horizontal" data-testid="textarea-resize-horizontal" />)
      const textarea = screen.getByTestId('textarea-resize-horizontal')
      expect(textarea).toHaveClass('resize-x')
    })

    it('should render with resize="both"', () => {
      render(<StyledTextarea resize="both" data-testid="textarea-resize-both" />)
      const textarea = screen.getByTestId('textarea-resize-both')
      expect(textarea).toHaveClass('resize')
    })
  })

  describe('Ref Forwarding', () => {
    it('should forward ref correctly', () => {
      const ref = createRef<HTMLTextAreaElement>()
      render(<StyledTextarea ref={ref} data-testid="textarea-ref" />)
      expect(ref.current).toBeInstanceOf(HTMLTextAreaElement)
      expect(ref.current).toBe(screen.getByTestId('textarea-ref'))
    })

    it('should allow ref methods to be called', () => {
      const ref = createRef<HTMLTextAreaElement>()
      render(<StyledTextarea ref={ref} />)
      ref.current?.focus()
      expect(document.activeElement).toBe(ref.current)
    })
  })

  describe('Disabled State', () => {
    it('should handle disabled state', () => {
      render(<StyledTextarea disabled data-testid="textarea-disabled" />)
      const textarea = screen.getByTestId('textarea-disabled')
      expect(textarea).toBeDisabled()
      expect(textarea).toHaveClass('disabled:opacity-50', 'disabled:cursor-not-allowed')
    })

    it('should not be interactive when disabled', async () => {
      const user = userEvent.setup()
      render(<StyledTextarea disabled data-testid="textarea-disabled" />)
      const textarea = screen.getByTestId('textarea-disabled')

      await user.click(textarea)
      expect(textarea).not.toHaveFocus()
    })
  })

  describe('Custom ClassName', () => {
    it('should apply custom className correctly', () => {
      render(<StyledTextarea className="custom-class" data-testid="textarea-custom" />)
      const textarea = screen.getByTestId('textarea-custom')
      expect(textarea).toHaveClass('custom-class')
    })

    it('should merge custom className with default classes', () => {
      render(<StyledTextarea className="custom-class" data-testid="textarea-custom" />)
      const textarea = screen.getByTestId('textarea-custom')
      expect(textarea).toHaveClass('custom-class')
      expect(textarea).toHaveClass('w-full', 'bg-slate-800/50', 'border', 'rounded-lg')
    })
  })

  describe('Class Merging with cn() Utility', () => {
    it('should properly merge classes using cn() utility', () => {
      render(
        <StyledTextarea
          size="sm"
          error={true}
          resize="none"
          className="mb-4"
          data-testid="textarea-merged"
        />
      )
      const textarea = screen.getByTestId('textarea-merged')

      // Should have size classes
      expect(textarea).toHaveClass('px-3', 'py-1.5', 'text-sm')

      // Should have error classes
      expect(textarea).toHaveClass('border-red-500/50')

      // Should have resize classes
      expect(textarea).toHaveClass('resize-none')

      // Should have custom class
      expect(textarea).toHaveClass('mb-4')

      // Should have base classes
      expect(textarea).toHaveClass('w-full', 'bg-slate-800/50')
    })

    it('should handle conflicting classes correctly', () => {
      // cn() utility from tailwind-merge should handle conflicts
      render(<StyledTextarea className="border-blue-500" data-testid="textarea-conflict" />)
      const textarea = screen.getByTestId('textarea-conflict')
      expect(textarea).toBeInTheDocument()
    })
  })

  describe('User Interaction', () => {
    it('should accept user input', async () => {
      const user = userEvent.setup()
      render(<StyledTextarea data-testid="textarea-interaction" />)
      const textarea = screen.getByTestId('textarea-interaction') as HTMLTextAreaElement

      await user.type(textarea, 'Hello World')
      expect(textarea.value).toBe('Hello World')
    })

    it('should accept multiline input', async () => {
      const user = userEvent.setup()
      render(<StyledTextarea data-testid="textarea-multiline" />)
      const textarea = screen.getByTestId('textarea-multiline') as HTMLTextAreaElement

      await user.type(textarea, 'Line 1{Enter}Line 2{Enter}Line 3')
      expect(textarea.value).toBe('Line 1\nLine 2\nLine 3')
    })

    it('should trigger onChange handler', async () => {
      const user = userEvent.setup()
      const handleChange = jest.fn()
      render(<StyledTextarea onChange={handleChange} data-testid="textarea-change" />)
      const textarea = screen.getByTestId('textarea-change')

      await user.type(textarea, 'test')
      expect(handleChange).toHaveBeenCalled()
    })

    it('should be focusable', async () => {
      const user = userEvent.setup()
      render(<StyledTextarea data-testid="textarea-focus" />)
      const textarea = screen.getByTestId('textarea-focus')

      await user.click(textarea)
      expect(textarea).toHaveFocus()
    })
  })

  describe('Additional Props', () => {
    it('should pass through additional HTML textarea attributes', () => {
      render(
        <StyledTextarea
          data-testid="textarea-props"
          placeholder="Enter description"
          required
          maxLength={200}
          rows={5}
        />
      )
      const textarea = screen.getByTestId('textarea-props')

      expect(textarea).toHaveAttribute('placeholder', 'Enter description')
      expect(textarea).toHaveAttribute('required')
      expect(textarea).toHaveAttribute('maxLength', '200')
      expect(textarea).toHaveAttribute('rows', '5')
    })

    it('should handle value prop', () => {
      render(<StyledTextarea value="test value" data-testid="textarea-value" readOnly />)
      const textarea = screen.getByTestId('textarea-value') as HTMLTextAreaElement
      expect(textarea.value).toBe('test value')
    })

    it('should handle name prop', () => {
      render(<StyledTextarea name="description" data-testid="textarea-name" />)
      const textarea = screen.getByTestId('textarea-name')
      expect(textarea).toHaveAttribute('name', 'description')
    })
  })

  describe('Accessibility', () => {
    it('should have proper accessible attributes', () => {
      render(<StyledTextarea data-testid="textarea-a11y" />)
      const textarea = screen.getByTestId('textarea-a11y')
      expect(textarea).toBeInTheDocument()
      expect(textarea.tagName).toBe('TEXTAREA')
    })

    it('should be keyboard accessible', async () => {
      const user = userEvent.setup()
      render(<StyledTextarea data-testid="textarea-keyboard" />)
      const textarea = screen.getByTestId('textarea-keyboard')

      await user.tab()
      expect(textarea).toHaveFocus()
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty props', () => {
      render(<StyledTextarea data-testid="textarea-empty" />)
      expect(screen.getByTestId('textarea-empty')).toBeInTheDocument()
    })

    it('should handle all size variants combined with error state', () => {
      const { rerender } = render(
        <StyledTextarea size="sm" error={true} data-testid="textarea-combo" />
      )
      let textarea = screen.getByTestId('textarea-combo')
      expect(textarea).toHaveClass('px-3', 'py-1.5', 'text-sm', 'border-red-500/50')

      rerender(<StyledTextarea size="md" error={true} data-testid="textarea-combo" />)
      textarea = screen.getByTestId('textarea-combo')
      expect(textarea).toHaveClass('px-4', 'py-2', 'text-sm', 'border-red-500/50')

      rerender(<StyledTextarea size="lg" error={true} data-testid="textarea-combo" />)
      textarea = screen.getByTestId('textarea-combo')
      expect(textarea).toHaveClass('px-4', 'py-2.5', 'text-base', 'border-red-500/50')
    })

    it('should handle all resize variants', () => {
      const { rerender } = render(<StyledTextarea resize="none" data-testid="textarea-resize" />)
      let textarea = screen.getByTestId('textarea-resize')
      expect(textarea).toHaveClass('resize-none')

      rerender(<StyledTextarea resize="vertical" data-testid="textarea-resize" />)
      textarea = screen.getByTestId('textarea-resize')
      expect(textarea).toHaveClass('resize-y')

      rerender(<StyledTextarea resize="horizontal" data-testid="textarea-resize" />)
      textarea = screen.getByTestId('textarea-resize')
      expect(textarea).toHaveClass('resize-x')

      rerender(<StyledTextarea resize="both" data-testid="textarea-resize" />)
      textarea = screen.getByTestId('textarea-resize')
      expect(textarea).toHaveClass('resize')
    })

    it('should handle combination of all props', () => {
      render(
        <StyledTextarea
          size="lg"
          error={true}
          resize="none"
          disabled
          className="custom-class"
          data-testid="textarea-all-props"
        />
      )
      const textarea = screen.getByTestId('textarea-all-props')

      expect(textarea).toHaveClass('px-4', 'py-2.5', 'text-base')
      expect(textarea).toHaveClass('border-red-500/50')
      expect(textarea).toHaveClass('resize-none')
      expect(textarea).toHaveClass('custom-class')
      expect(textarea).toBeDisabled()
      expect(textarea).toHaveAttribute('aria-invalid', 'true')
    })
  })
})
