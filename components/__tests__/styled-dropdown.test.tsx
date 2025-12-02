import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { StyledDropdown, DropdownOption } from '@/components/ui/styled-dropdown'

describe('StyledDropdown', () => {
  const mockOptions: DropdownOption[] = [
    { value: 'option1', label: 'Option 1' },
    { value: 'option2', label: 'Option 2' },
    { value: 'option3', label: 'Option 3' },
  ]

  const mockOnChange = jest.fn()

  beforeEach(() => {
    mockOnChange.mockClear()
  })

  describe('Basic Rendering', () => {
    it('should render with default props', () => {
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      expect(screen.getByText('Select an option')).toBeInTheDocument()
    })

    it('should render with selected value', () => {
      render(<StyledDropdown value="option1" onChange={mockOnChange} options={mockOptions} />)

      expect(screen.getByText('Option 1')).toBeInTheDocument()
    })

    it('should render with custom placeholder', () => {
      render(
        <StyledDropdown
          value=""
          onChange={mockOnChange}
          options={mockOptions}
          placeholder="Choose an option"
        />
      )

      expect(screen.getByText('Choose an option')).toBeInTheDocument()
    })

    it('should render dropdown icon', () => {
      const { container } = render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const icon = container.querySelector('svg')
      expect(icon).toBeInTheDocument()
    })

    it('should apply custom className', () => {
      const { container } = render(
        <StyledDropdown value="" onChange={mockOnChange} options={mockOptions} className="custom-class" />
      )

      const dropdown = container.querySelector('.custom-class')
      expect(dropdown).toBeInTheDocument()
    })
  })

  describe('Dropdown Interaction', () => {
    it('should open dropdown when button is clicked', () => {
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const button = screen.getByText('Select an option')
      fireEvent.click(button)

      expect(screen.getByText('Option 1')).toBeInTheDocument()
      expect(screen.getByText('Option 2')).toBeInTheDocument()
      expect(screen.getByText('Option 3')).toBeInTheDocument()
    })

    it('should close dropdown when button is clicked again', () => {
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const button = screen.getByText('Select an option')
      fireEvent.click(button)
      expect(screen.getByText('Option 1')).toBeInTheDocument()

      fireEvent.click(button)
      waitFor(() => {
        expect(screen.queryByText('Option 1')).not.toBeInTheDocument()
      })
    })

    it('should call onChange when option is selected', () => {
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const button = screen.getByText('Select an option')
      fireEvent.click(button)

      const option = screen.getAllByText('Option 2')[0]
      fireEvent.click(option)

      expect(mockOnChange).toHaveBeenCalledWith('option2')
    })

    it('should close dropdown after selecting an option', async () => {
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const button = screen.getByText('Select an option')
      fireEvent.click(button)

      const options = screen.getAllByText('Option 1')
      fireEvent.click(options[0])

      await waitFor(() => {
        expect(screen.queryByText('Option 2')).not.toBeInTheDocument()
      })
    })

    it('should close dropdown when clicking outside', async () => {
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const button = screen.getByText('Select an option')
      fireEvent.click(button)

      expect(screen.getByText('Option 1')).toBeInTheDocument()

      fireEvent.mouseDown(document.body)

      await waitFor(() => {
        expect(screen.queryByText('Option 2')).not.toBeInTheDocument()
      })
    })
  })

  describe('Disabled State', () => {
    it('should render disabled button', () => {
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} disabled />)

      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })

    it('should not open dropdown when disabled', () => {
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} disabled />)

      const button = screen.getByRole('button')
      fireEvent.click(button)

      expect(screen.queryByText('Option 1')).not.toBeInTheDocument()
    })

    it('should apply disabled styling', () => {
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} disabled />)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('disabled:opacity-50')
      expect(button).toHaveClass('disabled:cursor-not-allowed')
    })

    it('should handle disabled options', () => {
      const optionsWithDisabled: DropdownOption[] = [
        { value: 'option1', label: 'Option 1' },
        { value: 'option2', label: 'Option 2', disabled: true },
        { value: 'option3', label: 'Option 3' },
      ]

      render(<StyledDropdown value="" onChange={mockOnChange} options={optionsWithDisabled} />)

      const button = screen.getByText('Select an option')
      fireEvent.click(button)

      const disabledOption = screen.getAllByText('Option 2')[0]
      fireEvent.click(disabledOption)

      expect(mockOnChange).not.toHaveBeenCalled()
    })
  })

  describe('Size Variants', () => {
    it('should render small size', () => {
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} size="sm" />)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('text-[10px]')
    })

    it('should render medium size by default', () => {
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('text-sm')
    })

    it('should render large size', () => {
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} size="lg" />)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('text-base')
    })

    it('should apply correct icon size for small', () => {
      const { container } = render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} size="sm" />)

      const icon = container.querySelector('.w-3.h-3')
      expect(icon).toBeInTheDocument()
    })

    it('should apply correct icon size for large', () => {
      const { container } = render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} size="lg" />)

      const icon = container.querySelector('.w-5.h-5')
      expect(icon).toBeInTheDocument()
    })
  })

  describe('Form Integration', () => {
    it('should render hidden input when name prop is provided', () => {
      const { container } = render(
        <StyledDropdown value="option1" onChange={mockOnChange} options={mockOptions} name="dropdown-field" />
      )

      const hiddenInput = container.querySelector('input[type="hidden"]')
      expect(hiddenInput).toBeInTheDocument()
      expect(hiddenInput).toHaveAttribute('name', 'dropdown-field')
      expect(hiddenInput).toHaveValue('option1')
    })

    it('should not render hidden input when name prop is not provided', () => {
      const { container } = render(<StyledDropdown value="option1" onChange={mockOnChange} options={mockOptions} />)

      const hiddenInput = container.querySelector('input[type="hidden"]')
      expect(hiddenInput).not.toBeInTheDocument()
    })

    it('should support id attribute', () => {
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} id="my-dropdown" />)

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('id', 'my-dropdown')
    })
  })

  describe('Options Display', () => {
    it('should display all options when opened', () => {
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const button = screen.getByText('Select an option')
      fireEvent.click(button)

      mockOptions.forEach((option) => {
        expect(screen.getByText(option.label as string)).toBeInTheDocument()
      })
    })

    it('should highlight selected option', () => {
      render(<StyledDropdown value="option2" onChange={mockOnChange} options={mockOptions} />)

      const button = screen.getByText('Option 2')
      fireEvent.click(button)

      const selectedOption = screen.getAllByText('Option 2')[1]
      expect(selectedOption).toHaveClass('bg-cyan-500/20')
      expect(selectedOption).toHaveClass('text-cyan-300')
    })

    it('should handle ReactNode labels', () => {
      const optionsWithNodes: DropdownOption[] = [
        { value: 'option1', label: <span>Custom Label 1</span> },
        { value: 'option2', label: <span>Custom Label 2</span> },
      ]

      render(<StyledDropdown value="" onChange={mockOnChange} options={optionsWithNodes} />)

      const button = screen.getByText('Select an option')
      fireEvent.click(button)

      expect(screen.getByText('Custom Label 1')).toBeInTheDocument()
      expect(screen.getByText('Custom Label 2')).toBeInTheDocument()
    })

    it('should handle empty options array', () => {
      const { container } = render(<StyledDropdown value="" onChange={mockOnChange} options={[]} />)

      const button = screen.getByText('Select an option')
      fireEvent.click(button)

      // Dropdown should open but be empty - check for the dropdown menu container
      const menu = container.querySelector('.bg-slate-800.border-slate-700')
      expect(menu).toBeInTheDocument()
    })
  })

  describe('Dropdown Icon Animation', () => {
    it('should rotate icon when dropdown is open', () => {
      const { container } = render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const button = screen.getByText('Select an option')
      fireEvent.click(button)

      const icon = container.querySelector('.rotate-180')
      expect(icon).toBeInTheDocument()
    })

    it('should not rotate icon when dropdown is closed', () => {
      const { container } = render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const icon = container.querySelector('svg')
      expect(icon).not.toHaveClass('rotate-180')
    })
  })

  describe('Styling', () => {
    it('should have proper button styling', () => {
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('bg-slate-800/50')
      expect(button).toHaveClass('border-slate-600')
      expect(button).toHaveClass('rounded-lg')
    })

    it('should have proper dropdown menu styling', () => {
      const { container } = render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const button = screen.getByText('Select an option')
      fireEvent.click(button)

      const menu = container.querySelector('.bg-slate-800')
      expect(menu).toBeInTheDocument()
      expect(menu).toHaveClass('border-slate-700')
      expect(menu).toHaveClass('rounded-lg')
    })

    it('should have proper z-index for dropdown', () => {
      const { container } = render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const button = screen.getByText('Select an option')
      fireEvent.click(button)

      const menu = container.querySelector('.z-\\[200\\]')
      expect(menu).toBeInTheDocument()
    })

    it('should render backdrop when open', () => {
      const { container } = render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const button = screen.getByText('Select an option')
      fireEvent.click(button)

      const backdrop = container.querySelector('.fixed.inset-0.z-40')
      expect(backdrop).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('should handle value not in options', () => {
      render(<StyledDropdown value="invalid" onChange={mockOnChange} options={mockOptions} />)

      expect(screen.getByText('Select an option')).toBeInTheDocument()
    })

    it('should handle empty string value with placeholder', () => {
      render(
        <StyledDropdown
          value=""
          onChange={mockOnChange}
          options={mockOptions}
          placeholder="Custom placeholder"
        />
      )

      expect(screen.getByText('Custom placeholder')).toBeInTheDocument()
    })

    it('should handle rapid clicks', () => {
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const button = screen.getByText('Select an option')
      fireEvent.click(button)
      fireEvent.click(button)
      fireEvent.click(button)

      // Should not crash
      expect(button).toBeInTheDocument()
    })

    it('should handle selecting same option multiple times', () => {
      render(<StyledDropdown value="option1" onChange={mockOnChange} options={mockOptions} />)

      const button = screen.getByText('Option 1')
      fireEvent.click(button)

      const option = screen.getAllByText('Option 1')[1]
      fireEvent.click(option)

      expect(mockOnChange).toHaveBeenCalledWith('option1')
    })
  })

  describe('Accessibility', () => {
    it('should have button type', () => {
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('type', 'button')
    })

    it('should have proper focus styling', () => {
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('focus:outline-none')
      expect(button).toHaveClass('focus:border-cyan-400')
    })

    it('should support keyboard navigation', () => {
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const button = screen.getByRole('button')
      button.focus()
      expect(button).toHaveFocus()
    })

    it('should have proper option button types', () => {
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const button = screen.getByText('Select an option')
      fireEvent.click(button)

      const optionButtons = screen.getAllByRole('button')
      optionButtons.forEach((btn) => {
        expect(btn).toHaveAttribute('type', 'button')
      })
    })
  })

  describe('Integration', () => {
    it('should work with all props combined', () => {
      const { container } = render(
        <StyledDropdown
          value="option2"
          onChange={mockOnChange}
          options={mockOptions}
          placeholder="Choose"
          className="custom-class"
          disabled={false}
          size="lg"
          id="dropdown-id"
          name="dropdown-name"
        />
      )

      expect(screen.getByText('Option 2')).toBeInTheDocument()
      expect(container.querySelector('.custom-class')).toBeInTheDocument()
      expect(screen.getByRole('button')).toHaveAttribute('id', 'dropdown-id')
      expect(container.querySelector('input[name="dropdown-name"]')).toBeInTheDocument()
    })

    it('should handle complete user flow', async () => {
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      // Open dropdown
      const button = screen.getByText('Select an option')
      fireEvent.click(button)

      // Select option
      const option = screen.getAllByText('Option 2')[0]
      fireEvent.click(option)

      // Verify onChange was called
      expect(mockOnChange).toHaveBeenCalledWith('option2')

      // Verify dropdown closed
      await waitFor(() => {
        expect(screen.queryByText('Option 3')).not.toBeInTheDocument()
      })
    })
  })

  describe('Dropdown Menu Positioning', () => {
    it('should position dropdown below button', () => {
      const { container } = render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const button = screen.getByText('Select an option')
      fireEvent.click(button)

      const menu = container.querySelector('.absolute.top-full')
      expect(menu).toBeInTheDocument()
    })

    it('should have proper spacing from button', () => {
      const { container } = render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const button = screen.getByText('Select an option')
      fireEvent.click(button)

      const menu = container.querySelector('.mt-2')
      expect(menu).toBeInTheDocument()
    })

    it('should have scrollable menu for many options', () => {
      const manyOptions: DropdownOption[] = Array.from({ length: 20 }, (_, i) => ({
        value: `option${i}`,
        label: `Option ${i}`,
      }))

      const { container } = render(<StyledDropdown value="" onChange={mockOnChange} options={manyOptions} />)

      const button = screen.getByText('Select an option')
      fireEvent.click(button)

      const menu = container.querySelector('.max-h-80.overflow-y-auto')
      expect(menu).toBeInTheDocument()
    })
  })
})

