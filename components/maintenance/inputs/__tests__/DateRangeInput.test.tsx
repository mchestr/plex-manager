import { render, screen, fireEvent } from '@testing-library/react'
import { DateRangeInput } from '../DateRangeInput'
import type { Condition } from '@/lib/validations/maintenance'

describe('DateRangeInput', () => {
  const mockOnChange = jest.fn()

  beforeEach(() => {
    mockOnChange.mockClear()
  })

  const createCondition = (value: string[] | null): Condition => ({
    type: 'condition',
    id: 'test-id',
    field: 'addedAt',
    operator: 'between',
    value,
  })

  const getDateInputs = (container: HTMLElement) => {
    return container.querySelectorAll('input[type="date"]') as NodeListOf<HTMLInputElement>
  }

  describe('Basic Rendering', () => {
    it('should render two date inputs', () => {
      const condition = createCondition(['', ''])

      const { container } = render(<DateRangeInput condition={condition} onChange={mockOnChange} />)

      const inputs = getDateInputs(container)
      expect(inputs).toHaveLength(2)
      expect(inputs[0]).toHaveAttribute('type', 'date')
      expect(inputs[1]).toHaveAttribute('type', 'date')
    })

    it('should render "to" separator between inputs', () => {
      const condition = createCondition(['', ''])

      render(<DateRangeInput condition={condition} onChange={mockOnChange} />)

      expect(screen.getByText('to')).toBeInTheDocument()
    })

    it('should display current start and end values', () => {
      const condition = createCondition(['2024-01-01', '2024-12-31'])

      const { container } = render(<DateRangeInput condition={condition} onChange={mockOnChange} />)

      const inputs = getDateInputs(container)
      expect(inputs[0]).toHaveValue('2024-01-01')
      expect(inputs[1]).toHaveValue('2024-12-31')
    })
  })

  describe('Value Handling', () => {
    it('should handle null value as empty strings', () => {
      const condition = createCondition(null)

      const { container } = render(<DateRangeInput condition={condition} onChange={mockOnChange} />)

      const inputs = getDateInputs(container)
      expect(inputs[0]).toHaveValue('')
      expect(inputs[1]).toHaveValue('')
    })

    it('should handle partial values', () => {
      const condition = createCondition(['2024-01-01', ''])

      const { container } = render(<DateRangeInput condition={condition} onChange={mockOnChange} />)

      const inputs = getDateInputs(container)
      expect(inputs[0]).toHaveValue('2024-01-01')
      expect(inputs[1]).toHaveValue('')
    })

    it('should handle only end date provided', () => {
      const condition = createCondition(['', '2024-12-31'])

      const { container } = render(<DateRangeInput condition={condition} onChange={mockOnChange} />)

      const inputs = getDateInputs(container)
      expect(inputs[0]).toHaveValue('')
      expect(inputs[1]).toHaveValue('2024-12-31')
    })
  })

  describe('User Interactions', () => {
    it('should call onChange when start date changes', () => {
      const condition = createCondition(['', '2024-12-31'])

      const { container } = render(<DateRangeInput condition={condition} onChange={mockOnChange} />)

      const inputs = getDateInputs(container)
      fireEvent.change(inputs[0], { target: { value: '2024-01-01' } })

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: ['2024-01-01', '2024-12-31'],
        })
      )
    })

    it('should call onChange when end date changes', () => {
      const condition = createCondition(['2024-01-01', ''])

      const { container } = render(<DateRangeInput condition={condition} onChange={mockOnChange} />)

      const inputs = getDateInputs(container)
      fireEvent.change(inputs[1], { target: { value: '2024-12-31' } })

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: ['2024-01-01', '2024-12-31'],
        })
      )
    })

    it('should preserve end date when changing start date', () => {
      const condition = createCondition(['', '2024-12-31'])

      const { container } = render(<DateRangeInput condition={condition} onChange={mockOnChange} />)

      const inputs = getDateInputs(container)
      fireEvent.change(inputs[0], { target: { value: '2024-01-01' } })

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: ['2024-01-01', '2024-12-31'],
        })
      )
    })

    it('should preserve start date when changing end date', () => {
      const condition = createCondition(['2024-01-01', ''])

      const { container } = render(<DateRangeInput condition={condition} onChange={mockOnChange} />)

      const inputs = getDateInputs(container)
      fireEvent.change(inputs[1], { target: { value: '2024-12-31' } })

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: ['2024-01-01', '2024-12-31'],
        })
      )
    })

    it('should preserve condition field and operator when changing dates', () => {
      const condition = createCondition(['', ''])

      const { container } = render(<DateRangeInput condition={condition} onChange={mockOnChange} />)

      const inputs = getDateInputs(container)
      fireEvent.change(inputs[0], { target: { value: '2024-01-01' } })

      expect(mockOnChange).toHaveBeenCalledWith({
        type: 'condition',
        id: 'test-id',
        field: 'addedAt',
        operator: 'between',
        value: ['2024-01-01', ''],
      })
    })

    it('should handle clearing start date', () => {
      const condition = createCondition(['2024-01-01', '2024-12-31'])

      const { container } = render(<DateRangeInput condition={condition} onChange={mockOnChange} />)

      const inputs = getDateInputs(container)
      fireEvent.change(inputs[0], { target: { value: '' } })

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: ['', '2024-12-31'],
        })
      )
    })

    it('should handle clearing end date', () => {
      const condition = createCondition(['2024-01-01', '2024-12-31'])

      const { container } = render(<DateRangeInput condition={condition} onChange={mockOnChange} />)

      const inputs = getDateInputs(container)
      fireEvent.change(inputs[1], { target: { value: '' } })

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: ['2024-01-01', ''],
        })
      )
    })
  })

  describe('Edge Cases', () => {
    it('should handle same start and end date', () => {
      const condition = createCondition(['2024-06-15', '2024-06-15'])

      const { container } = render(<DateRangeInput condition={condition} onChange={mockOnChange} />)

      const inputs = getDateInputs(container)
      expect(inputs[0]).toHaveValue('2024-06-15')
      expect(inputs[1]).toHaveValue('2024-06-15')
    })

    it('should handle year boundaries', () => {
      const condition = createCondition(['2023-12-31', '2024-01-01'])

      const { container } = render(<DateRangeInput condition={condition} onChange={mockOnChange} />)

      const inputs = getDateInputs(container)
      expect(inputs[0]).toHaveValue('2023-12-31')
      expect(inputs[1]).toHaveValue('2024-01-01')
    })

    it('should handle empty array as initial value', () => {
      const condition: Condition = {
        type: 'condition',
        id: 'test-id',
        field: 'addedAt',
        operator: 'between',
        value: [],
      }

      const { container } = render(<DateRangeInput condition={condition} onChange={mockOnChange} />)

      const inputs = getDateInputs(container)
      expect(inputs[0]).toHaveValue('')
      expect(inputs[1]).toHaveValue('')
    })
  })

  describe('Accessibility', () => {
    it('should have proper input styling classes', () => {
      const condition = createCondition(['', ''])

      const { container } = render(<DateRangeInput condition={condition} onChange={mockOnChange} />)

      const inputs = getDateInputs(container)
      expect(inputs[0]).toHaveClass('flex-1')
      expect(inputs[1]).toHaveClass('flex-1')
    })

    it('should display "to" separator with proper styling', () => {
      const condition = createCondition(['', ''])

      render(<DateRangeInput condition={condition} onChange={mockOnChange} />)

      const separator = screen.getByText('to')
      expect(separator).toHaveClass('text-slate-400')
    })
  })
})
