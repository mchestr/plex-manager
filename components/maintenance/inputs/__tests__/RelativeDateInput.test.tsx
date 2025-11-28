import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RelativeDateInput } from '../RelativeDateInput'
import type { Condition } from '@/lib/validations/maintenance'

// Mock StyledDropdown component
jest.mock('@/components/ui/styled-dropdown', () => ({
  StyledDropdown: ({
    value,
    onChange,
    options,
  }: {
    value: string
    onChange: (value: string) => void
    options: Array<{ value: string; label: string }>
  }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      data-testid="unit-dropdown"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}))

describe('RelativeDateInput', () => {
  const mockOnChange = jest.fn()

  beforeEach(() => {
    mockOnChange.mockClear()
  })

  const createCondition = (
    value: number,
    valueUnit: 'days' | 'months' | 'years' = 'days'
  ): Condition => ({
    type: 'condition',
    id: 'test-id',
    field: 'lastWatchedAt',
    operator: 'olderThan',
    value,
    valueUnit,
  })

  describe('Basic Rendering', () => {
    it('should render number input and unit dropdown', () => {
      const condition = createCondition(30)

      render(<RelativeDateInput condition={condition} onChange={mockOnChange} />)

      expect(screen.getByPlaceholderText('Enter number')).toBeInTheDocument()
      expect(screen.getByTestId('unit-dropdown')).toBeInTheDocument()
      expect(screen.getByText('ago')).toBeInTheDocument()
    })

    it('should display current value', () => {
      const condition = createCondition(90)

      render(<RelativeDateInput condition={condition} onChange={mockOnChange} />)

      const input = screen.getByPlaceholderText('Enter number')
      expect(input).toHaveValue(90)
    })

    it('should display current unit', () => {
      const condition = createCondition(6, 'months')

      render(<RelativeDateInput condition={condition} onChange={mockOnChange} />)

      const dropdown = screen.getByTestId('unit-dropdown')
      expect(dropdown).toHaveValue('months')
    })
  })

  describe('Value Handling', () => {
    it('should handle zero value', () => {
      const condition = createCondition(0)

      render(<RelativeDateInput condition={condition} onChange={mockOnChange} />)

      const input = screen.getByPlaceholderText('Enter number')
      expect(input).toHaveValue(0)
    })

    it('should default unit to days when not provided', () => {
      const condition: Condition = {
        type: 'condition',
        id: 'test-id',
        field: 'lastWatchedAt',
        operator: 'olderThan',
        value: 30,
      }

      render(<RelativeDateInput condition={condition} onChange={mockOnChange} />)

      const dropdown = screen.getByTestId('unit-dropdown')
      expect(dropdown).toHaveValue('days')
    })

    it('should default value to 0 when null', () => {
      const condition: Condition = {
        type: 'condition',
        id: 'test-id',
        field: 'lastWatchedAt',
        operator: 'olderThan',
        value: null,
        valueUnit: 'days',
      }

      render(<RelativeDateInput condition={condition} onChange={mockOnChange} />)

      const input = screen.getByPlaceholderText('Enter number')
      expect(input).toHaveValue(0)
    })
  })

  describe('User Interactions', () => {
    it('should call onChange when number value changes', () => {
      const condition = createCondition(0)

      render(<RelativeDateInput condition={condition} onChange={mockOnChange} />)

      const input = screen.getByPlaceholderText('Enter number')
      fireEvent.change(input, { target: { value: '60' } })

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: 60,
        })
      )
    })

    it('should call onChange when unit changes', async () => {
      const user = userEvent.setup()
      const condition = createCondition(30, 'days')

      render(<RelativeDateInput condition={condition} onChange={mockOnChange} />)

      const dropdown = screen.getByTestId('unit-dropdown')
      await user.selectOptions(dropdown, 'months')

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          valueUnit: 'months',
        })
      )
    })

    it('should preserve condition field and operator when changing value', () => {
      const condition = createCondition(30)

      render(<RelativeDateInput condition={condition} onChange={mockOnChange} />)

      const input = screen.getByPlaceholderText('Enter number')
      fireEvent.change(input, { target: { value: '7' } })

      expect(mockOnChange).toHaveBeenCalledWith({
        type: 'condition',
        id: 'test-id',
        field: 'lastWatchedAt',
        operator: 'olderThan',
        value: 7,
        valueUnit: 'days',
      })
    })

    it('should handle clearing value', () => {
      const condition = createCondition(30)

      render(<RelativeDateInput condition={condition} onChange={mockOnChange} />)

      const input = screen.getByPlaceholderText('Enter number')
      fireEvent.change(input, { target: { value: '' } })

      // After clearing, value should be 0
      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: 0,
        })
      )
    })
  })

  describe('Unit Options', () => {
    it('should have days option', () => {
      const condition = createCondition(30)

      render(<RelativeDateInput condition={condition} onChange={mockOnChange} />)

      expect(screen.getByText('days')).toBeInTheDocument()
    })

    it('should have months option', () => {
      const condition = createCondition(30)

      render(<RelativeDateInput condition={condition} onChange={mockOnChange} />)

      expect(screen.getByText('months')).toBeInTheDocument()
    })

    it('should have years option', () => {
      const condition = createCondition(30)

      render(<RelativeDateInput condition={condition} onChange={mockOnChange} />)

      expect(screen.getByText('years')).toBeInTheDocument()
    })

    it('should switch from days to years', async () => {
      const user = userEvent.setup()
      const condition = createCondition(365, 'days')

      render(<RelativeDateInput condition={condition} onChange={mockOnChange} />)

      const dropdown = screen.getByTestId('unit-dropdown')
      await user.selectOptions(dropdown, 'years')

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          valueUnit: 'years',
        })
      )
    })
  })

  describe('Edge Cases', () => {
    it('should handle large numbers', () => {
      const condition = createCondition(9999)

      render(<RelativeDateInput condition={condition} onChange={mockOnChange} />)

      const input = screen.getByPlaceholderText('Enter number')
      expect(input).toHaveValue(9999)
    })

    it('should have min attribute of 1', () => {
      const condition = createCondition(30)

      render(<RelativeDateInput condition={condition} onChange={mockOnChange} />)

      const input = screen.getByPlaceholderText('Enter number')
      expect(input).toHaveAttribute('min', '1')
    })
  })

  describe('Accessibility', () => {
    it('should render the "ago" label', () => {
      const condition = createCondition(30)

      render(<RelativeDateInput condition={condition} onChange={mockOnChange} />)

      expect(screen.getByText('ago')).toBeInTheDocument()
    })
  })
})
