import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StringInput } from '../StringInput'
import type { Condition } from '@/lib/validations/maintenance'

describe('StringInput', () => {
  const mockOnChange = jest.fn()

  beforeEach(() => {
    mockOnChange.mockClear()
  })

  const createCondition = (value: string | null): Condition => ({
    type: 'condition',
    id: 'test-id',
    field: 'title',
    operator: 'contains',
    value,
  })

  describe('Basic Rendering', () => {
    it('should render text input with default placeholder', () => {
      const condition = createCondition(null)

      render(<StringInput condition={condition} onChange={mockOnChange} />)

      const input = screen.getByPlaceholderText('Enter value')
      expect(input).toBeInTheDocument()
      expect(input).toHaveAttribute('type', 'text')
    })

    it('should render with custom placeholder', () => {
      const condition = createCondition(null)

      render(
        <StringInput
          condition={condition}
          onChange={mockOnChange}
          placeholder="Enter title"
        />
      )

      expect(screen.getByPlaceholderText('Enter title')).toBeInTheDocument()
    })

    it('should display current value', () => {
      const condition = createCondition('test value')

      render(<StringInput condition={condition} onChange={mockOnChange} />)

      const input = screen.getByPlaceholderText('Enter value')
      expect(input).toHaveValue('test value')
    })
  })

  describe('Value Handling', () => {
    it('should handle null value as empty string', () => {
      const condition = createCondition(null)

      render(<StringInput condition={condition} onChange={mockOnChange} />)

      const input = screen.getByPlaceholderText('Enter value')
      expect(input).toHaveValue('')
    })

    it('should handle undefined-like value as empty string', () => {
      const condition: Condition = {
        type: 'condition',
        id: 'test-id',
        field: 'title',
        operator: 'contains',
        value: '',
      }

      render(<StringInput condition={condition} onChange={mockOnChange} />)

      const input = screen.getByPlaceholderText('Enter value')
      expect(input).toHaveValue('')
    })
  })

  describe('User Interactions', () => {
    it('should call onChange when value changes', async () => {
      const user = userEvent.setup()
      const condition = createCondition('')

      render(<StringInput condition={condition} onChange={mockOnChange} />)

      const input = screen.getByPlaceholderText('Enter value')
      await user.type(input, 'x')

      // Each character typed triggers onChange
      expect(mockOnChange).toHaveBeenCalledTimes(1)
      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: 'x',
        })
      )
    })

    it('should preserve condition field and operator when changing value', async () => {
      const user = userEvent.setup()
      const condition = createCondition('')

      render(<StringInput condition={condition} onChange={mockOnChange} />)

      const input = screen.getByPlaceholderText('Enter value')
      await user.type(input, 'x')

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'condition',
          id: 'test-id',
          field: 'title',
          operator: 'contains',
          value: 'x',
        })
      )
    })

    it('should handle clearing the input', async () => {
      const user = userEvent.setup()
      const condition = createCondition('existing value')

      render(<StringInput condition={condition} onChange={mockOnChange} />)

      const input = screen.getByPlaceholderText('Enter value')
      await user.clear(input)

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: '',
        })
      )
    })

    it('should handle pasting text', async () => {
      const user = userEvent.setup()
      const condition = createCondition('')

      render(<StringInput condition={condition} onChange={mockOnChange} />)

      const input = screen.getByPlaceholderText('Enter value')
      await user.click(input)
      await user.paste('pasted text')

      expect(mockOnChange).toHaveBeenCalled()
      const lastCall = mockOnChange.mock.calls[mockOnChange.mock.calls.length - 1][0]
      expect(lastCall.value).toBe('pasted text')
    })
  })

  describe('Edge Cases', () => {
    it('should handle special characters in display', () => {
      const condition = createCondition('!@#$%^&*()')

      render(<StringInput condition={condition} onChange={mockOnChange} />)

      const input = screen.getByPlaceholderText('Enter value')
      expect(input).toHaveValue('!@#$%^&*()')
    })

    it('should handle whitespace in display', () => {
      const condition = createCondition('  spaces  ')

      render(<StringInput condition={condition} onChange={mockOnChange} />)

      const input = screen.getByPlaceholderText('Enter value')
      expect(input).toHaveValue('  spaces  ')
    })

    it('should handle long text', () => {
      const longText = 'a'.repeat(1000)
      const condition = createCondition(longText)

      render(<StringInput condition={condition} onChange={mockOnChange} />)

      const input = screen.getByPlaceholderText('Enter value')
      expect(input).toHaveValue(longText)
    })
  })

  describe('Accessibility', () => {
    it('should have proper input styling classes', () => {
      const condition = createCondition('')

      render(<StringInput condition={condition} onChange={mockOnChange} />)

      const input = screen.getByPlaceholderText('Enter value')
      expect(input).toHaveClass('flex-1')
    })
  })
})
