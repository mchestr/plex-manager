import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SelectInput } from '../SelectInput'
import type { Condition } from '@/lib/validations/maintenance'

// Mock StyledDropdown component
jest.mock('@/components/ui/styled-dropdown', () => ({
  StyledDropdown: ({
    value,
    onChange,
    options,
    placeholder,
  }: {
    value: string
    onChange: (value: string) => void
    options: Array<{ value: string; label: string }>
    placeholder?: string
  }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      data-testid="select-input"
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}))

describe('SelectInput', () => {
  const mockOnChange = jest.fn()

  const defaultOptions = [
    { value: '1080p', label: '1080p' },
    { value: '720p', label: '720p' },
    { value: '480p', label: '480p' },
  ]

  beforeEach(() => {
    mockOnChange.mockClear()
  })

  const createCondition = (value: string | null): Condition => ({
    type: 'condition',
    id: 'test-id',
    field: 'resolution',
    operator: 'equals',
    value,
  })

  describe('Basic Rendering', () => {
    it('should render a select dropdown', () => {
      const condition = createCondition(null)

      render(
        <SelectInput
          condition={condition}
          onChange={mockOnChange}
          options={defaultOptions}
        />
      )

      expect(screen.getByTestId('select-input')).toBeInTheDocument()
    })

    it('should render all provided options', () => {
      const condition = createCondition(null)

      render(
        <SelectInput
          condition={condition}
          onChange={mockOnChange}
          options={defaultOptions}
        />
      )

      expect(screen.getByText('1080p')).toBeInTheDocument()
      expect(screen.getByText('720p')).toBeInTheDocument()
      expect(screen.getByText('480p')).toBeInTheDocument()
    })

    it('should display placeholder text', () => {
      const condition = createCondition(null)

      render(
        <SelectInput
          condition={condition}
          onChange={mockOnChange}
          options={defaultOptions}
        />
      )

      expect(screen.getByText('Select...')).toBeInTheDocument()
    })
  })

  describe('Value Display', () => {
    it('should display current value', () => {
      const condition = createCondition('720p')

      render(
        <SelectInput
          condition={condition}
          onChange={mockOnChange}
          options={defaultOptions}
        />
      )

      const select = screen.getByTestId('select-input')
      expect(select).toHaveValue('720p')
    })

    it('should handle empty string value', () => {
      const condition = createCondition('')

      render(
        <SelectInput
          condition={condition}
          onChange={mockOnChange}
          options={defaultOptions}
        />
      )

      const select = screen.getByTestId('select-input')
      expect(select).toHaveValue('')
    })

    it('should handle null value as empty string', () => {
      const condition = createCondition(null)

      render(
        <SelectInput
          condition={condition}
          onChange={mockOnChange}
          options={defaultOptions}
        />
      )

      const select = screen.getByTestId('select-input')
      expect(select).toHaveValue('')
    })
  })

  describe('User Interactions', () => {
    it('should call onChange when value changes', async () => {
      const user = userEvent.setup()
      const condition = createCondition('')

      render(
        <SelectInput
          condition={condition}
          onChange={mockOnChange}
          options={defaultOptions}
        />
      )

      const select = screen.getByTestId('select-input')
      await user.selectOptions(select, '1080p')

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: '1080p',
        })
      )
    })

    it('should preserve condition field and operator when changing value', async () => {
      const user = userEvent.setup()
      const condition = createCondition('')

      render(
        <SelectInput
          condition={condition}
          onChange={mockOnChange}
          options={defaultOptions}
        />
      )

      const select = screen.getByTestId('select-input')
      await user.selectOptions(select, '720p')

      expect(mockOnChange).toHaveBeenCalledWith({
        type: 'condition',
        id: 'test-id',
        field: 'resolution',
        operator: 'equals',
        value: '720p',
      })
    })

    it('should allow changing from one value to another', async () => {
      const user = userEvent.setup()
      const condition = createCondition('1080p')

      render(
        <SelectInput
          condition={condition}
          onChange={mockOnChange}
          options={defaultOptions}
        />
      )

      const select = screen.getByTestId('select-input')
      await user.selectOptions(select, '480p')

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: '480p',
        })
      )
    })
  })

  describe('Different Option Sets', () => {
    it('should work with quality options', () => {
      const qualityOptions = [
        { value: 'SD', label: 'SD (480p)' },
        { value: 'HD', label: 'HD (720p)' },
        { value: 'FHD', label: 'Full HD (1080p)' },
        { value: 'UHD', label: '4K UHD' },
      ]
      const condition = createCondition('HD')

      render(
        <SelectInput
          condition={condition}
          onChange={mockOnChange}
          options={qualityOptions}
        />
      )

      expect(screen.getByText('SD (480p)')).toBeInTheDocument()
      expect(screen.getByText('HD (720p)')).toBeInTheDocument()
      expect(screen.getByText('Full HD (1080p)')).toBeInTheDocument()
      expect(screen.getByText('4K UHD')).toBeInTheDocument()
    })

    it('should work with single option', () => {
      const singleOption = [{ value: 'only', label: 'Only Option' }]
      const condition = createCondition(null)

      render(
        <SelectInput
          condition={condition}
          onChange={mockOnChange}
          options={singleOption}
        />
      )

      expect(screen.getByText('Only Option')).toBeInTheDocument()
    })

    it('should work with many options', () => {
      const manyOptions = Array.from({ length: 10 }, (_, i) => ({
        value: `option${i + 1}`,
        label: `Option ${i + 1}`,
      }))
      const condition = createCondition(null)

      render(
        <SelectInput
          condition={condition}
          onChange={mockOnChange}
          options={manyOptions}
        />
      )

      expect(screen.getByText('Option 1')).toBeInTheDocument()
      expect(screen.getByText('Option 10')).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('should handle options with special characters in labels', () => {
      const specialOptions = [
        { value: 'hevc', label: 'H.265/HEVC' },
        { value: 'avc', label: 'H.264/AVC' },
        { value: 'av1', label: 'AV1 (AOMedia)' },
      ]
      const condition = createCondition(null)

      render(
        <SelectInput
          condition={condition}
          onChange={mockOnChange}
          options={specialOptions}
        />
      )

      expect(screen.getByText('H.265/HEVC')).toBeInTheDocument()
      expect(screen.getByText('H.264/AVC')).toBeInTheDocument()
      expect(screen.getByText('AV1 (AOMedia)')).toBeInTheDocument()
    })

    it('should handle options where value differs from label', () => {
      const diffOptions = [
        { value: 'en', label: 'English' },
        { value: 'es', label: 'Spanish' },
        { value: 'fr', label: 'French' },
      ]
      const condition = createCondition('es')

      render(
        <SelectInput
          condition={condition}
          onChange={mockOnChange}
          options={diffOptions}
        />
      )

      const select = screen.getByTestId('select-input')
      expect(select).toHaveValue('es')
      expect(screen.getByText('Spanish')).toBeInTheDocument()
    })

    it('should handle empty options array', () => {
      const condition = createCondition(null)

      render(
        <SelectInput condition={condition} onChange={mockOnChange} options={[]} />
      )

      const select = screen.getByTestId('select-input')
      expect(select).toBeInTheDocument()
      // Only placeholder should be present
      expect(screen.getByText('Select...')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should wrap in flex container', () => {
      const condition = createCondition(null)

      const { container } = render(
        <SelectInput
          condition={condition}
          onChange={mockOnChange}
          options={defaultOptions}
        />
      )

      const wrapper = container.firstChild
      expect(wrapper).toHaveClass('flex-1')
    })
  })
})
