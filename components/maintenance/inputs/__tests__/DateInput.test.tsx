import { render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { DateInput } from '../DateInput'
import type { Condition } from '@/lib/validations/maintenance'

describe('DateInput', () => {
  const mockOnChange = jest.fn()

  beforeEach(() => {
    mockOnChange.mockClear()
  })

  const createCondition = (value: string | null): Condition => ({
    type: 'condition',
    id: 'test-id',
    field: 'addedAt',
    operator: 'before',
    value,
  })

  const getDateInput = (container: HTMLElement) => {
    return container.querySelector('input[type="date"]') as HTMLInputElement
  }

  describe('Basic Rendering', () => {
    it('should render date input', () => {
      const condition = createCondition(null)

      const { container } = render(<DateInput condition={condition} onChange={mockOnChange} />)

      const input = getDateInput(container)
      expect(input).toBeInTheDocument()
      expect(input).toHaveAttribute('type', 'date')
    })

    it('should display current value', () => {
      const condition = createCondition('2024-01-15')

      const { container } = render(<DateInput condition={condition} onChange={mockOnChange} />)

      const input = getDateInput(container)
      expect(input).toHaveValue('2024-01-15')
    })
  })

  describe('Value Handling', () => {
    it('should handle null value as empty string', () => {
      const condition = createCondition(null)

      const { container } = render(<DateInput condition={condition} onChange={mockOnChange} />)

      const input = getDateInput(container)
      expect(input).toHaveValue('')
    })

    it('should handle empty string value', () => {
      const condition = createCondition('')

      const { container } = render(<DateInput condition={condition} onChange={mockOnChange} />)

      const input = getDateInput(container)
      expect(input).toHaveValue('')
    })
  })

  describe('User Interactions', () => {
    it('should call onChange when value changes', () => {
      const condition = createCondition('')

      const { container } = render(<DateInput condition={condition} onChange={mockOnChange} />)

      const input = getDateInput(container)
      fireEvent.change(input, { target: { value: '2024-06-15' } })

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: '2024-06-15',
        })
      )
    })

    it('should preserve condition field and operator when changing value', () => {
      const condition = createCondition('')

      const { container } = render(<DateInput condition={condition} onChange={mockOnChange} />)

      const input = getDateInput(container)
      fireEvent.change(input, { target: { value: '2024-06-15' } })

      expect(mockOnChange).toHaveBeenCalledWith({
        type: 'condition',
        id: 'test-id',
        field: 'addedAt',
        operator: 'before',
        value: '2024-06-15',
      })
    })

    it('should handle clearing the input', () => {
      const condition = createCondition('2024-01-15')

      const { container } = render(<DateInput condition={condition} onChange={mockOnChange} />)

      const input = getDateInput(container)
      fireEvent.change(input, { target: { value: '' } })

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: '',
        })
      )
    })
  })

  describe('Edge Cases', () => {
    it('should handle different date formats in display', () => {
      const condition = createCondition('2023-12-31')

      const { container } = render(<DateInput condition={condition} onChange={mockOnChange} />)

      const input = getDateInput(container)
      expect(input).toHaveValue('2023-12-31')
    })

    it('should handle first day of year', () => {
      const condition = createCondition('2024-01-01')

      const { container } = render(<DateInput condition={condition} onChange={mockOnChange} />)

      const input = getDateInput(container)
      expect(input).toHaveValue('2024-01-01')
    })

    it('should handle last day of year', () => {
      const condition = createCondition('2024-12-31')

      const { container } = render(<DateInput condition={condition} onChange={mockOnChange} />)

      const input = getDateInput(container)
      expect(input).toHaveValue('2024-12-31')
    })
  })

  describe('Accessibility', () => {
    it('should have proper input styling classes', () => {
      const condition = createCondition('')

      const { container } = render(<DateInput condition={condition} onChange={mockOnChange} />)

      const input = getDateInput(container)
      expect(input).toHaveClass('flex-1')
    })
  })
})
