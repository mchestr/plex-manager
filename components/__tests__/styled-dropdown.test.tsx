import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StyledDropdown, DropdownOption } from '@/components/ui/select'

// Mock APIs for JSDOM (not supported by JSDOM but required by Radix)
beforeAll(() => {
  // Pointer capture API
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
    value: () => false,
  })
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    value: () => {},
  })
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
    value: () => {},
  })
  // scrollIntoView
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    value: () => {},
  })
  // ResizeObserver
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

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

      expect(screen.getByRole('combobox')).toBeInTheDocument()
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
    it('should open dropdown when trigger is clicked', async () => {
      const user = userEvent.setup()
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const trigger = screen.getByRole('combobox')
      await user.click(trigger)

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument()
      })

      expect(screen.getByRole('option', { name: 'Option 1' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Option 2' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Option 3' })).toBeInTheDocument()
    })

    it('should call onChange when option is selected', async () => {
      const user = userEvent.setup()
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const trigger = screen.getByRole('combobox')
      await user.click(trigger)

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument()
      })

      const option = screen.getByRole('option', { name: 'Option 2' })
      await user.click(option)

      expect(mockOnChange).toHaveBeenCalledWith('option2')
    })

    it('should close dropdown after selecting an option', async () => {
      const user = userEvent.setup()
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const trigger = screen.getByRole('combobox')
      await user.click(trigger)

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument()
      })

      const option = screen.getByRole('option', { name: 'Option 1' })
      await user.click(option)

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      })
    })
  })

  describe('Disabled State', () => {
    it('should render disabled trigger', () => {
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} disabled />)

      const trigger = screen.getByRole('combobox')
      expect(trigger).toBeDisabled()
    })

    it('should handle disabled options', async () => {
      const user = userEvent.setup()
      const optionsWithDisabled: DropdownOption[] = [
        { value: 'option1', label: 'Option 1' },
        { value: 'option2', label: 'Option 2', disabled: true },
        { value: 'option3', label: 'Option 3' },
      ]

      render(<StyledDropdown value="" onChange={mockOnChange} options={optionsWithDisabled} />)

      const trigger = screen.getByRole('combobox')
      await user.click(trigger)

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument()
      })

      const disabledOption = screen.getByRole('option', { name: 'Option 2' })
      expect(disabledOption).toHaveAttribute('data-disabled')
    })
  })

  describe('Size Variants', () => {
    it('should render small size', () => {
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} size="sm" />)

      const trigger = screen.getByRole('combobox')
      expect(trigger).toHaveClass('h-8', 'text-xs')
    })

    it('should render medium size by default', () => {
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const trigger = screen.getByRole('combobox')
      expect(trigger).toHaveClass('h-10', 'text-sm')
    })

    it('should render large size', () => {
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} size="lg" />)

      const trigger = screen.getByRole('combobox')
      expect(trigger).toHaveClass('h-12', 'text-base')
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
  })

  describe('Options Display', () => {
    it('should display all options when opened', async () => {
      const user = userEvent.setup()
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const trigger = screen.getByRole('combobox')
      await user.click(trigger)

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument()
      })

      mockOptions.forEach((option) => {
        expect(screen.getByRole('option', { name: option.label as string })).toBeInTheDocument()
      })
    })

    it('should handle empty options array', async () => {
      const user = userEvent.setup()
      render(<StyledDropdown value="" onChange={mockOnChange} options={[]} />)

      const trigger = screen.getByRole('combobox')
      await user.click(trigger)

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument()
      })

      expect(screen.queryByRole('option')).not.toBeInTheDocument()
    })
  })

  describe('Styling', () => {
    it('should have proper trigger styling', () => {
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const trigger = screen.getByRole('combobox')
      expect(trigger).toHaveClass('bg-slate-800/50')
      expect(trigger).toHaveClass('border-slate-600')
      expect(trigger).toHaveClass('rounded-lg')
    })
  })

  describe('Edge Cases', () => {
    it('should handle value not in options', () => {
      render(<StyledDropdown value="invalid" onChange={mockOnChange} options={mockOptions} />)

      const trigger = screen.getByRole('combobox')
      expect(trigger).toBeInTheDocument()
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

    it('should handle rapid interactions without crashing', async () => {
      const user = userEvent.setup()
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const trigger = screen.getByRole('combobox')

      // Open dropdown
      await user.click(trigger)
      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument()
      })

      // Select an option (closes dropdown)
      await user.click(screen.getByRole('option', { name: 'Option 1' }))

      // Re-open dropdown
      await user.click(trigger)
      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument()
      })

      expect(trigger).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have combobox role', () => {
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })

    it('should have proper focus styling', () => {
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const trigger = screen.getByRole('combobox')
      expect(trigger).toHaveClass('focus:outline-none')
      expect(trigger).toHaveClass('focus:border-cyan-400')
    })

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup()
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const trigger = screen.getByRole('combobox')
      trigger.focus()
      expect(trigger).toHaveFocus()

      // Open with keyboard
      await user.keyboard('{Enter}')

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument()
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
          name="dropdown-name"
          data-testid="my-dropdown"
        />
      )

      expect(screen.getByText('Option 2')).toBeInTheDocument()
      expect(container.querySelector('.custom-class')).toBeInTheDocument()
      expect(container.querySelector('input[name="dropdown-name"]')).toBeInTheDocument()
      expect(screen.getByTestId('my-dropdown')).toBeInTheDocument()
    })

    it('should handle complete user flow', async () => {
      const user = userEvent.setup()
      render(<StyledDropdown value="" onChange={mockOnChange} options={mockOptions} />)

      const trigger = screen.getByRole('combobox')
      await user.click(trigger)

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument()
      })

      const option = screen.getByRole('option', { name: 'Option 2' })
      await user.click(option)

      expect(mockOnChange).toHaveBeenCalledWith('option2')

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      })
    })
  })

  describe('Data TestId', () => {
    it('should apply data-testid to trigger', () => {
      render(
        <StyledDropdown
          value=""
          onChange={mockOnChange}
          options={mockOptions}
          data-testid="my-dropdown"
        />
      )

      expect(screen.getByTestId('my-dropdown')).toBeInTheDocument()
    })

    it('should apply data-testid to options', async () => {
      const user = userEvent.setup()
      render(
        <StyledDropdown
          value=""
          onChange={mockOnChange}
          options={mockOptions}
          data-testid="my-dropdown"
        />
      )

      const trigger = screen.getByRole('combobox')
      await user.click(trigger)

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument()
      })

      expect(screen.getByTestId('my-dropdown-option-option1')).toBeInTheDocument()
      expect(screen.getByTestId('my-dropdown-option-option2')).toBeInTheDocument()
    })
  })
})
