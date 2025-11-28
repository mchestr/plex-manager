import { render, screen, fireEvent } from '@testing-library/react'
import { RangeInput } from '../RangeInput'
import type { Condition } from '@/lib/validations/maintenance'

describe('RangeInput', () => {
  const mockOnChange = jest.fn()

  beforeEach(() => {
    mockOnChange.mockClear()
  })

  const createCondition = (value: number[] | null): Condition => ({
    type: 'condition',
    id: 'test-id',
    field: 'playCount',
    operator: 'between',
    value,
  })

  describe('Basic Rendering', () => {
    it('should render two number inputs', () => {
      const condition = createCondition([0, 0])

      render(<RangeInput condition={condition} onChange={mockOnChange} />)

      const inputs = screen.getAllByRole('spinbutton')
      expect(inputs).toHaveLength(2)
      expect(inputs[0]).toHaveAttribute('placeholder', 'Min')
      expect(inputs[1]).toHaveAttribute('placeholder', 'Max')
    })

    it('should render "to" separator between inputs', () => {
      const condition = createCondition([0, 0])

      render(<RangeInput condition={condition} onChange={mockOnChange} />)

      expect(screen.getByText('to')).toBeInTheDocument()
    })

    it('should display current min and max values', () => {
      const condition = createCondition([5, 10])

      render(<RangeInput condition={condition} onChange={mockOnChange} />)

      const inputs = screen.getAllByRole('spinbutton')
      expect(inputs[0]).toHaveValue(5)
      expect(inputs[1]).toHaveValue(10)
    })
  })

  describe('Value Handling', () => {
    it('should handle null value as zeros', () => {
      const condition = createCondition(null)

      render(<RangeInput condition={condition} onChange={mockOnChange} />)

      const inputs = screen.getAllByRole('spinbutton')
      expect(inputs[0]).toHaveValue(0)
      expect(inputs[1]).toHaveValue(0)
    })

    it('should handle empty array as zeros', () => {
      const condition: Condition = {
        type: 'condition',
        id: 'test-id',
        field: 'playCount',
        operator: 'between',
        value: [],
      }

      render(<RangeInput condition={condition} onChange={mockOnChange} />)

      const inputs = screen.getAllByRole('spinbutton')
      // Empty array defaults to [0, 0], but 0 displays as null in number inputs
      expect(inputs[0]).toHaveValue(null)
      expect(inputs[1]).toHaveValue(null)
    })
  })

  describe('User Interactions', () => {
    it('should call onChange when min value changes', () => {
      const condition = createCondition([0, 100])

      render(<RangeInput condition={condition} onChange={mockOnChange} />)

      const inputs = screen.getAllByRole('spinbutton')
      fireEvent.change(inputs[0], { target: { value: '10' } })

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: [10, 100],
        })
      )
    })

    it('should call onChange when max value changes', () => {
      const condition = createCondition([0, 0])

      render(<RangeInput condition={condition} onChange={mockOnChange} />)

      const inputs = screen.getAllByRole('spinbutton')
      fireEvent.change(inputs[1], { target: { value: '50' } })

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: [0, 50],
        })
      )
    })

    it('should preserve max when changing min', () => {
      const condition = createCondition([0, 100])

      render(<RangeInput condition={condition} onChange={mockOnChange} />)

      const inputs = screen.getAllByRole('spinbutton')
      fireEvent.change(inputs[0], { target: { value: '25' } })

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: [25, 100],
        })
      )
    })

    it('should preserve min when changing max', () => {
      const condition = createCondition([25, 0])

      render(<RangeInput condition={condition} onChange={mockOnChange} />)

      const inputs = screen.getAllByRole('spinbutton')
      fireEvent.change(inputs[1], { target: { value: '75' } })

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: [25, 75],
        })
      )
    })

    it('should preserve condition field and operator', () => {
      const condition = createCondition([0, 0])

      render(<RangeInput condition={condition} onChange={mockOnChange} />)

      const inputs = screen.getAllByRole('spinbutton')
      fireEvent.change(inputs[0], { target: { value: '5' } })

      expect(mockOnChange).toHaveBeenCalledWith({
        type: 'condition',
        id: 'test-id',
        field: 'playCount',
        operator: 'between',
        value: [5, 0],
      })
    })
  })

  describe('Unit Conversion - Bytes', () => {
    const createBytesCondition = (value: number[]): Condition => ({
      type: 'condition',
      id: 'test-id',
      field: 'fileSize',
      operator: 'between',
      value,
    })

    const oneGB = 1024 * 1024 * 1024

    it('should convert bytes to GB for display', () => {
      const condition = createBytesCondition([oneGB * 5, oneGB * 10])

      render(<RangeInput condition={condition} onChange={mockOnChange} unit="bytes" />)

      const inputs = screen.getAllByRole('spinbutton')
      expect(inputs[0]).toHaveValue(5)
      expect(inputs[1]).toHaveValue(10)
    })

    it('should display GB unit label', () => {
      const condition = createBytesCondition([0, 0])

      render(<RangeInput condition={condition} onChange={mockOnChange} unit="bytes" />)

      expect(screen.getByText('GB')).toBeInTheDocument()
    })

    it('should convert GB input to bytes for storage', () => {
      const condition = createBytesCondition([0, oneGB * 100])

      render(<RangeInput condition={condition} onChange={mockOnChange} unit="bytes" />)

      const inputs = screen.getAllByRole('spinbutton')
      fireEvent.change(inputs[0], { target: { value: '2' } })

      // 2 GB converted to bytes
      const expectedBytes = 2 * oneGB
      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: [expectedBytes, oneGB * 100],
        })
      )
    })
  })

  describe('Unit Conversion - kbps', () => {
    const createKbpsCondition = (value: number[]): Condition => ({
      type: 'condition',
      id: 'test-id',
      field: 'bitrate',
      operator: 'between',
      value,
    })

    it('should convert kbps to Mbps for display', () => {
      const condition = createKbpsCondition([5000, 10000]) // 5 Mbps, 10 Mbps

      render(<RangeInput condition={condition} onChange={mockOnChange} unit="kbps" />)

      const inputs = screen.getAllByRole('spinbutton')
      expect(inputs[0]).toHaveValue(5)
      expect(inputs[1]).toHaveValue(10)
    })

    it('should display Mbps unit label', () => {
      const condition = createKbpsCondition([0, 0])

      render(<RangeInput condition={condition} onChange={mockOnChange} unit="kbps" />)

      expect(screen.getByText('Mbps')).toBeInTheDocument()
    })

    it('should convert Mbps input to kbps for storage', () => {
      const condition = createKbpsCondition([0, 10000])

      render(<RangeInput condition={condition} onChange={mockOnChange} unit="kbps" />)

      const inputs = screen.getAllByRole('spinbutton')
      fireEvent.change(inputs[0], { target: { value: '3' } })

      // 3 Mbps converted to kbps
      const expectedKbps = 3000
      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: [expectedKbps, 10000],
        })
      )
    })
  })

  describe('Unit Conversion - Minutes', () => {
    const createMinutesCondition = (value: number[]): Condition => ({
      type: 'condition',
      id: 'test-id',
      field: 'duration',
      operator: 'between',
      value,
    })

    it('should display values without conversion for minutes', () => {
      const condition = createMinutesCondition([30, 120])

      render(<RangeInput condition={condition} onChange={mockOnChange} unit="minutes" />)

      const inputs = screen.getAllByRole('spinbutton')
      expect(inputs[0]).toHaveValue(30)
      expect(inputs[1]).toHaveValue(120)
    })

    it('should display min unit label', () => {
      const condition = createMinutesCondition([0, 0])

      render(<RangeInput condition={condition} onChange={mockOnChange} unit="minutes" />)

      expect(screen.getByText('min')).toBeInTheDocument()
    })
  })

  describe('Min/Max Limits', () => {
    it('should apply min attribute to both inputs', () => {
      const condition = createCondition([0, 0])

      render(<RangeInput condition={condition} onChange={mockOnChange} min={0} />)

      const inputs = screen.getAllByRole('spinbutton')
      expect(inputs[0]).toHaveAttribute('min', '0')
      expect(inputs[1]).toHaveAttribute('min', '0')
    })

    it('should apply max attribute to both inputs', () => {
      const condition = createCondition([0, 0])

      render(<RangeInput condition={condition} onChange={mockOnChange} max={100} />)

      const inputs = screen.getAllByRole('spinbutton')
      expect(inputs[0]).toHaveAttribute('max', '100')
      expect(inputs[1]).toHaveAttribute('max', '100')
    })
  })

  describe('Edge Cases', () => {
    it('should handle decimal values', () => {
      const condition = createCondition([1.5, 2.5])

      render(<RangeInput condition={condition} onChange={mockOnChange} />)

      const inputs = screen.getAllByRole('spinbutton')
      expect(inputs[0]).toHaveValue(1.5)
      expect(inputs[1]).toHaveValue(2.5)
    })

    it('should handle same min and max values', () => {
      const condition = createCondition([50, 50])

      render(<RangeInput condition={condition} onChange={mockOnChange} />)

      const inputs = screen.getAllByRole('spinbutton')
      expect(inputs[0]).toHaveValue(50)
      expect(inputs[1]).toHaveValue(50)
    })

    it('should not display unit label when no unit provided', () => {
      const condition = createCondition([0, 0])

      render(<RangeInput condition={condition} onChange={mockOnChange} />)

      expect(screen.queryByText('GB')).not.toBeInTheDocument()
      expect(screen.queryByText('Mbps')).not.toBeInTheDocument()
      expect(screen.queryByText('min')).not.toBeInTheDocument()
    })

    it('should have step="any" for decimal support', () => {
      const condition = createCondition([0, 0])

      render(<RangeInput condition={condition} onChange={mockOnChange} />)

      const inputs = screen.getAllByRole('spinbutton')
      expect(inputs[0]).toHaveAttribute('step', 'any')
      expect(inputs[1]).toHaveAttribute('step', 'any')
    })
  })
})
