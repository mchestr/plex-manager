import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MultiSelectInput } from '../MultiSelectInput'
import type { Condition } from '@/lib/validations/maintenance'

describe('MultiSelectInput', () => {
  const mockOnChange = jest.fn()

  const defaultOptions = [
    { value: 'action', label: 'Action' },
    { value: 'comedy', label: 'Comedy' },
    { value: 'drama', label: 'Drama' },
    { value: 'horror', label: 'Horror' },
  ]

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
    it('should render all options as checkboxes', () => {
      const condition = createCondition([])

      render(
        <MultiSelectInput
          condition={condition}
          onChange={mockOnChange}
          options={defaultOptions}
        />
      )

      const checkboxes = screen.getAllByRole('checkbox')
      expect(checkboxes).toHaveLength(4)
    })

    it('should display option labels', () => {
      const condition = createCondition([])

      render(
        <MultiSelectInput
          condition={condition}
          onChange={mockOnChange}
          options={defaultOptions}
        />
      )

      expect(screen.getByText('Action')).toBeInTheDocument()
      expect(screen.getByText('Comedy')).toBeInTheDocument()
      expect(screen.getByText('Drama')).toBeInTheDocument()
      expect(screen.getByText('Horror')).toBeInTheDocument()
    })

    it('should render checkboxes in a 2-column grid', () => {
      const condition = createCondition([])

      const { container } = render(
        <MultiSelectInput
          condition={condition}
          onChange={mockOnChange}
          options={defaultOptions}
        />
      )

      const grid = container.querySelector('.grid-cols-2')
      expect(grid).toBeInTheDocument()
    })
  })

  describe('Value Display', () => {
    it('should check boxes for selected values', () => {
      const condition = createCondition(['action', 'drama'])

      render(
        <MultiSelectInput
          condition={condition}
          onChange={mockOnChange}
          options={defaultOptions}
        />
      )

      const checkboxes = screen.getAllByRole('checkbox')
      expect(checkboxes[0]).toBeChecked() // action
      expect(checkboxes[1]).not.toBeChecked() // comedy
      expect(checkboxes[2]).toBeChecked() // drama
      expect(checkboxes[3]).not.toBeChecked() // horror
    })

    it('should handle empty array', () => {
      const condition = createCondition([])

      render(
        <MultiSelectInput
          condition={condition}
          onChange={mockOnChange}
          options={defaultOptions}
        />
      )

      const checkboxes = screen.getAllByRole('checkbox')
      checkboxes.forEach((checkbox) => {
        expect(checkbox).not.toBeChecked()
      })
    })

    it('should handle null value as empty array', () => {
      const condition = createCondition(null)

      render(
        <MultiSelectInput
          condition={condition}
          onChange={mockOnChange}
          options={defaultOptions}
        />
      )

      const checkboxes = screen.getAllByRole('checkbox')
      checkboxes.forEach((checkbox) => {
        expect(checkbox).not.toBeChecked()
      })
    })

    it('should handle all values selected', () => {
      const condition = createCondition(['action', 'comedy', 'drama', 'horror'])

      render(
        <MultiSelectInput
          condition={condition}
          onChange={mockOnChange}
          options={defaultOptions}
        />
      )

      const checkboxes = screen.getAllByRole('checkbox')
      checkboxes.forEach((checkbox) => {
        expect(checkbox).toBeChecked()
      })
    })
  })

  describe('User Interactions - Selecting', () => {
    it('should add value when unchecked option is clicked', async () => {
      const user = userEvent.setup()
      const condition = createCondition([])

      render(
        <MultiSelectInput
          condition={condition}
          onChange={mockOnChange}
          options={defaultOptions}
        />
      )

      const actionCheckbox = screen.getAllByRole('checkbox')[0]
      await user.click(actionCheckbox)

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: ['action'],
        })
      )
    })

    it('should append value to existing selections', async () => {
      const user = userEvent.setup()
      const condition = createCondition(['action'])

      render(
        <MultiSelectInput
          condition={condition}
          onChange={mockOnChange}
          options={defaultOptions}
        />
      )

      const comedyCheckbox = screen.getAllByRole('checkbox')[1]
      await user.click(comedyCheckbox)

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: ['action', 'comedy'],
        })
      )
    })

    it('should allow selecting multiple values', async () => {
      const user = userEvent.setup()
      const condition = createCondition(['action', 'comedy'])

      render(
        <MultiSelectInput
          condition={condition}
          onChange={mockOnChange}
          options={defaultOptions}
        />
      )

      const dramaCheckbox = screen.getAllByRole('checkbox')[2]
      await user.click(dramaCheckbox)

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: ['action', 'comedy', 'drama'],
        })
      )
    })
  })

  describe('User Interactions - Deselecting', () => {
    it('should remove value when checked option is clicked', async () => {
      const user = userEvent.setup()
      const condition = createCondition(['action', 'comedy'])

      render(
        <MultiSelectInput
          condition={condition}
          onChange={mockOnChange}
          options={defaultOptions}
        />
      )

      const actionCheckbox = screen.getAllByRole('checkbox')[0]
      await user.click(actionCheckbox)

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: ['comedy'],
        })
      )
    })

    it('should handle removing the only selected value', async () => {
      const user = userEvent.setup()
      const condition = createCondition(['action'])

      render(
        <MultiSelectInput
          condition={condition}
          onChange={mockOnChange}
          options={defaultOptions}
        />
      )

      const actionCheckbox = screen.getAllByRole('checkbox')[0]
      await user.click(actionCheckbox)

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: [],
        })
      )
    })

    it('should handle removing from middle of selected values', async () => {
      const user = userEvent.setup()
      const condition = createCondition(['action', 'comedy', 'drama'])

      render(
        <MultiSelectInput
          condition={condition}
          onChange={mockOnChange}
          options={defaultOptions}
        />
      )

      const comedyCheckbox = screen.getAllByRole('checkbox')[1]
      await user.click(comedyCheckbox)

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: ['action', 'drama'],
        })
      )
    })
  })

  describe('Preserving Condition Properties', () => {
    it('should preserve condition field and operator when selecting', async () => {
      const user = userEvent.setup()
      const condition = createCondition([])

      render(
        <MultiSelectInput
          condition={condition}
          onChange={mockOnChange}
          options={defaultOptions}
        />
      )

      await user.click(screen.getAllByRole('checkbox')[0])

      expect(mockOnChange).toHaveBeenCalledWith({
        type: 'condition',
        id: 'test-id',
        field: 'genres',
        operator: 'containsAny',
        value: ['action'],
      })
    })

    it('should preserve condition field and operator when deselecting', async () => {
      const user = userEvent.setup()
      const condition = createCondition(['action'])

      render(
        <MultiSelectInput
          condition={condition}
          onChange={mockOnChange}
          options={defaultOptions}
        />
      )

      await user.click(screen.getAllByRole('checkbox')[0])

      expect(mockOnChange).toHaveBeenCalledWith({
        type: 'condition',
        id: 'test-id',
        field: 'genres',
        operator: 'containsAny',
        value: [],
      })
    })
  })

  describe('Different Option Sets', () => {
    it('should work with resolution options', () => {
      const resolutionOptions = [
        { value: '4k', label: '4K UHD' },
        { value: '1080p', label: 'Full HD' },
        { value: '720p', label: 'HD' },
        { value: '480p', label: 'SD' },
      ]
      const condition = createCondition(['4k', '1080p'])

      render(
        <MultiSelectInput
          condition={condition}
          onChange={mockOnChange}
          options={resolutionOptions}
        />
      )

      expect(screen.getByText('4K UHD')).toBeInTheDocument()
      expect(screen.getByText('Full HD')).toBeInTheDocument()

      const checkboxes = screen.getAllByRole('checkbox')
      expect(checkboxes[0]).toBeChecked() // 4k
      expect(checkboxes[1]).toBeChecked() // 1080p
      expect(checkboxes[2]).not.toBeChecked() // 720p
    })

    it('should work with single option', () => {
      const singleOption = [{ value: 'only', label: 'Only Option' }]
      const condition = createCondition([])

      render(
        <MultiSelectInput
          condition={condition}
          onChange={mockOnChange}
          options={singleOption}
        />
      )

      expect(screen.getByText('Only Option')).toBeInTheDocument()
      expect(screen.getAllByRole('checkbox')).toHaveLength(1)
    })

    it('should work with many options', () => {
      const manyOptions = Array.from({ length: 10 }, (_, i) => ({
        value: `option${i + 1}`,
        label: `Option ${i + 1}`,
      }))
      const condition = createCondition(['option1', 'option5', 'option10'])

      render(
        <MultiSelectInput
          condition={condition}
          onChange={mockOnChange}
          options={manyOptions}
        />
      )

      expect(screen.getByText('Option 1')).toBeInTheDocument()
      expect(screen.getByText('Option 10')).toBeInTheDocument()
      expect(screen.getAllByRole('checkbox')).toHaveLength(10)
    })
  })

  describe('Edge Cases', () => {
    it('should handle options with special characters in labels', () => {
      const specialOptions = [
        { value: 'sci-fi', label: 'Sci-Fi & Fantasy' },
        { value: 'kids', label: "Kids' Shows" },
        { value: 'documentary', label: 'Documentary/Non-Fiction' },
      ]
      const condition = createCondition(['sci-fi'])

      render(
        <MultiSelectInput
          condition={condition}
          onChange={mockOnChange}
          options={specialOptions}
        />
      )

      expect(screen.getByText('Sci-Fi & Fantasy')).toBeInTheDocument()
      expect(screen.getByText("Kids' Shows")).toBeInTheDocument()
      expect(screen.getByText('Documentary/Non-Fiction')).toBeInTheDocument()
    })

    it('should handle empty options array', () => {
      const condition = createCondition([])

      const { container } = render(
        <MultiSelectInput condition={condition} onChange={mockOnChange} options={[]} />
      )

      expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
      // Container should still render
      expect(container.firstChild).toBeInTheDocument()
    })

    it('should handle value not in options', () => {
      const condition = createCondition(['unknown'])

      render(
        <MultiSelectInput
          condition={condition}
          onChange={mockOnChange}
          options={defaultOptions}
        />
      )

      // All checkboxes should be unchecked since 'unknown' is not in options
      const checkboxes = screen.getAllByRole('checkbox')
      checkboxes.forEach((checkbox) => {
        expect(checkbox).not.toBeChecked()
      })
    })
  })

  describe('Accessibility', () => {
    it('should associate labels with checkboxes', () => {
      const condition = createCondition([])

      render(
        <MultiSelectInput
          condition={condition}
          onChange={mockOnChange}
          options={defaultOptions}
        />
      )

      // Click on label text should toggle checkbox
      const actionLabel = screen.getByText('Action')
      expect(actionLabel.closest('label')).toBeInTheDocument()
    })

    it('should have clickable labels', async () => {
      const user = userEvent.setup()
      const condition = createCondition([])

      render(
        <MultiSelectInput
          condition={condition}
          onChange={mockOnChange}
          options={defaultOptions}
        />
      )

      // Clicking the label should trigger onChange
      const actionLabel = screen.getByText('Action')
      await user.click(actionLabel)

      expect(mockOnChange).toHaveBeenCalled()
    })

    it('should have proper styling classes on labels', () => {
      const condition = createCondition([])

      render(
        <MultiSelectInput
          condition={condition}
          onChange={mockOnChange}
          options={defaultOptions}
        />
      )

      const label = screen.getByText('Action').closest('label')
      expect(label).toHaveClass('cursor-pointer')
    })
  })
})
