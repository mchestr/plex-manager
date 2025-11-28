import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MultiTextInput } from '../MultiTextInput'
import type { Condition } from '@/lib/validations/maintenance'

describe('MultiTextInput', () => {
  const mockOnChange = jest.fn()

  beforeEach(() => {
    mockOnChange.mockClear()
  })

  const createCondition = (value: string[] | null): Condition => ({
    type: 'condition',
    id: 'test-id',
    field: 'genres',
    operator: 'containsAny',
    value,
  })

  describe('Basic Rendering', () => {
    it('should render text input and Add button', () => {
      const condition = createCondition([])

      render(<MultiTextInput condition={condition} onChange={mockOnChange} />)

      expect(screen.getByPlaceholderText('Type and press Enter')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
    })

    it('should not display tags when array is empty', () => {
      const condition = createCondition([])

      render(<MultiTextInput condition={condition} onChange={mockOnChange} />)

      // No tags should be visible
      expect(screen.queryByText('×')).not.toBeInTheDocument()
    })

    it('should display existing values as tags', () => {
      const condition = createCondition(['Action', 'Comedy', 'Drama'])

      render(<MultiTextInput condition={condition} onChange={mockOnChange} />)

      expect(screen.getByText('Action')).toBeInTheDocument()
      expect(screen.getByText('Comedy')).toBeInTheDocument()
      expect(screen.getByText('Drama')).toBeInTheDocument()
    })

    it('should display remove button for each tag', () => {
      const condition = createCondition(['Tag1', 'Tag2'])

      render(<MultiTextInput condition={condition} onChange={mockOnChange} />)

      const removeButtons = screen.getAllByText('×')
      expect(removeButtons).toHaveLength(2)
    })
  })

  describe('Value Handling', () => {
    it('should handle null value as empty array', () => {
      const condition = createCondition(null)

      render(<MultiTextInput condition={condition} onChange={mockOnChange} />)

      expect(screen.queryByText('×')).not.toBeInTheDocument()
    })

    it('should handle undefined value as empty array', () => {
      const condition: Condition = {
        type: 'condition',
        id: 'test-id',
        field: 'genres',
        operator: 'containsAny',
        value: null,
      }

      render(<MultiTextInput condition={condition} onChange={mockOnChange} />)

      expect(screen.queryByText('×')).not.toBeInTheDocument()
    })
  })

  describe('Adding Values', () => {
    it('should add value when Add button is clicked', async () => {
      const user = userEvent.setup()
      const condition = createCondition([])

      render(<MultiTextInput condition={condition} onChange={mockOnChange} />)

      const input = screen.getByPlaceholderText('Type and press Enter')
      await user.type(input, 'NewTag')
      await user.click(screen.getByRole('button', { name: 'Add' }))

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: ['NewTag'],
        })
      )
    })

    it('should add value when Enter key is pressed', async () => {
      const user = userEvent.setup()
      const condition = createCondition([])

      render(<MultiTextInput condition={condition} onChange={mockOnChange} />)

      const input = screen.getByPlaceholderText('Type and press Enter')
      await user.type(input, 'NewTag{Enter}')

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: ['NewTag'],
        })
      )
    })

    it('should append to existing values', async () => {
      const user = userEvent.setup()
      const condition = createCondition(['Existing'])

      render(<MultiTextInput condition={condition} onChange={mockOnChange} />)

      const input = screen.getByPlaceholderText('Type and press Enter')
      await user.type(input, 'New{Enter}')

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: ['Existing', 'New'],
        })
      )
    })

    it('should clear input after adding value', async () => {
      const user = userEvent.setup()
      const condition = createCondition([])

      render(<MultiTextInput condition={condition} onChange={mockOnChange} />)

      const input = screen.getByPlaceholderText('Type and press Enter')
      await user.type(input, 'Test{Enter}')

      // The input should be cleared
      expect(input).toHaveValue('')
    })

    it('should trim whitespace from values', async () => {
      const user = userEvent.setup()
      const condition = createCondition([])

      render(<MultiTextInput condition={condition} onChange={mockOnChange} />)

      const input = screen.getByPlaceholderText('Type and press Enter')
      await user.type(input, '  SpacedTag  {Enter}')

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: ['SpacedTag'],
        })
      )
    })

    it('should not add empty values', async () => {
      const user = userEvent.setup()
      const condition = createCondition([])

      render(<MultiTextInput condition={condition} onChange={mockOnChange} />)

      const input = screen.getByPlaceholderText('Type and press Enter')
      await user.type(input, '   {Enter}')

      expect(mockOnChange).not.toHaveBeenCalled()
    })

    it('should not add value when clicking Add with empty input', async () => {
      const user = userEvent.setup()
      const condition = createCondition([])

      render(<MultiTextInput condition={condition} onChange={mockOnChange} />)

      await user.click(screen.getByRole('button', { name: 'Add' }))

      expect(mockOnChange).not.toHaveBeenCalled()
    })
  })

  describe('Removing Values', () => {
    it('should remove value when × button is clicked', async () => {
      const user = userEvent.setup()
      const condition = createCondition(['Tag1', 'Tag2', 'Tag3'])

      render(<MultiTextInput condition={condition} onChange={mockOnChange} />)

      const removeButtons = screen.getAllByText('×')
      await user.click(removeButtons[1]) // Remove 'Tag2'

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: ['Tag1', 'Tag3'],
        })
      )
    })

    it('should remove first value correctly', async () => {
      const user = userEvent.setup()
      const condition = createCondition(['First', 'Second'])

      render(<MultiTextInput condition={condition} onChange={mockOnChange} />)

      const removeButtons = screen.getAllByText('×')
      await user.click(removeButtons[0])

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: ['Second'],
        })
      )
    })

    it('should remove last value correctly', async () => {
      const user = userEvent.setup()
      const condition = createCondition(['First', 'Second'])

      render(<MultiTextInput condition={condition} onChange={mockOnChange} />)

      const removeButtons = screen.getAllByText('×')
      await user.click(removeButtons[1])

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: ['First'],
        })
      )
    })

    it('should handle removing the only value', async () => {
      const user = userEvent.setup()
      const condition = createCondition(['OnlyTag'])

      render(<MultiTextInput condition={condition} onChange={mockOnChange} />)

      const removeButton = screen.getByText('×')
      await user.click(removeButton)

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: [],
        })
      )
    })
  })

  describe('Preserving Condition Properties', () => {
    it('should preserve condition field and operator when adding', async () => {
      const user = userEvent.setup()
      const condition = createCondition([])

      render(<MultiTextInput condition={condition} onChange={mockOnChange} />)

      const input = screen.getByPlaceholderText('Type and press Enter')
      await user.type(input, 'Test{Enter}')

      expect(mockOnChange).toHaveBeenCalledWith({
        type: 'condition',
        id: 'test-id',
        field: 'genres',
        operator: 'containsAny',
        value: ['Test'],
      })
    })

    it('should preserve condition field and operator when removing', async () => {
      const user = userEvent.setup()
      const condition = createCondition(['Tag1'])

      render(<MultiTextInput condition={condition} onChange={mockOnChange} />)

      await user.click(screen.getByText('×'))

      expect(mockOnChange).toHaveBeenCalledWith({
        type: 'condition',
        id: 'test-id',
        field: 'genres',
        operator: 'containsAny',
        value: [],
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle special characters in values', async () => {
      const user = userEvent.setup()
      const condition = createCondition([])

      render(<MultiTextInput condition={condition} onChange={mockOnChange} />)

      const input = screen.getByPlaceholderText('Type and press Enter')
      await user.type(input, 'Sci-Fi & Fantasy{Enter}')

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: ['Sci-Fi & Fantasy'],
        })
      )
    })

    it('should display special characters correctly', () => {
      const condition = createCondition(['Sci-Fi & Fantasy', "Kids' Shows"])

      render(<MultiTextInput condition={condition} onChange={mockOnChange} />)

      expect(screen.getByText('Sci-Fi & Fantasy')).toBeInTheDocument()
      expect(screen.getByText("Kids' Shows")).toBeInTheDocument()
    })

    it('should handle many values', () => {
      const manyValues = Array.from({ length: 20 }, (_, i) => `Tag${i + 1}`)
      const condition = createCondition(manyValues)

      render(<MultiTextInput condition={condition} onChange={mockOnChange} />)

      expect(screen.getByText('Tag1')).toBeInTheDocument()
      expect(screen.getByText('Tag20')).toBeInTheDocument()

      const removeButtons = screen.getAllByText('×')
      expect(removeButtons).toHaveLength(20)
    })
  })

  describe('Accessibility', () => {
    it('should have proper input placeholder', () => {
      const condition = createCondition([])

      render(<MultiTextInput condition={condition} onChange={mockOnChange} />)

      expect(screen.getByPlaceholderText('Type and press Enter')).toBeInTheDocument()
    })

    it('should have type="button" on Add button', () => {
      const condition = createCondition([])

      render(<MultiTextInput condition={condition} onChange={mockOnChange} />)

      const addButton = screen.getByRole('button', { name: 'Add' })
      expect(addButton).toHaveAttribute('type', 'button')
    })

    it('should have type="button" on remove buttons', () => {
      const condition = createCondition(['Tag1'])

      render(<MultiTextInput condition={condition} onChange={mockOnChange} />)

      const removeButton = screen.getByText('×').closest('button')
      expect(removeButton).toHaveAttribute('type', 'button')
    })
  })
})
