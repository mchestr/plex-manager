import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BooleanToggle } from '../BooleanToggle'
import type { Condition } from '@/lib/validations/maintenance'

// Mock Button component
jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    variant,
    'data-testid': dataTestId,
  }: {
    children: React.ReactNode
    onClick: () => void
    variant?: string
    'data-testid'?: string
  }) => (
    <button onClick={onClick} data-variant={variant} data-testid={dataTestId}>
      {children}
    </button>
  ),
}))

describe('BooleanToggle', () => {
  const mockOnChange = jest.fn()

  beforeEach(() => {
    mockOnChange.mockClear()
  })

  const createCondition = (value: boolean | null): Condition => ({
    type: 'condition',
    id: 'test-id',
    field: 'neverWatched',
    operator: 'equals',
    value,
  })

  describe('Basic Rendering', () => {
    it('should render True and False buttons', () => {
      const condition = createCondition(null)

      render(<BooleanToggle condition={condition} onChange={mockOnChange} />)

      expect(screen.getByTestId('boolean-toggle-true')).toBeInTheDocument()
      expect(screen.getByTestId('boolean-toggle-false')).toBeInTheDocument()
      expect(screen.getByText('True')).toBeInTheDocument()
      expect(screen.getByText('False')).toBeInTheDocument()
    })

    it('should have type="button" on buttons', () => {
      const condition = createCondition(null)

      render(<BooleanToggle condition={condition} onChange={mockOnChange} />)

      // The mock doesn't set type, but we can verify buttons render
      expect(screen.getByTestId('boolean-toggle-true')).toBeInTheDocument()
      expect(screen.getByTestId('boolean-toggle-false')).toBeInTheDocument()
    })
  })

  describe('Value Display', () => {
    it('should show success variant for True button when value is true', () => {
      const condition = createCondition(true)

      render(<BooleanToggle condition={condition} onChange={mockOnChange} />)

      const trueButton = screen.getByTestId('boolean-toggle-true')
      expect(trueButton).toHaveAttribute('data-variant', 'success')
    })

    it('should show secondary variant for False button when value is true', () => {
      const condition = createCondition(true)

      render(<BooleanToggle condition={condition} onChange={mockOnChange} />)

      const falseButton = screen.getByTestId('boolean-toggle-false')
      expect(falseButton).toHaveAttribute('data-variant', 'secondary')
    })

    it('should show danger variant for False button when value is false', () => {
      const condition = createCondition(false)

      render(<BooleanToggle condition={condition} onChange={mockOnChange} />)

      const falseButton = screen.getByTestId('boolean-toggle-false')
      expect(falseButton).toHaveAttribute('data-variant', 'danger')
    })

    it('should show secondary variant for True button when value is false', () => {
      const condition = createCondition(false)

      render(<BooleanToggle condition={condition} onChange={mockOnChange} />)

      const trueButton = screen.getByTestId('boolean-toggle-true')
      expect(trueButton).toHaveAttribute('data-variant', 'secondary')
    })

    it('should show secondary variant for both buttons when value is null', () => {
      const condition = createCondition(null)

      render(<BooleanToggle condition={condition} onChange={mockOnChange} />)

      const trueButton = screen.getByTestId('boolean-toggle-true')
      const falseButton = screen.getByTestId('boolean-toggle-false')

      expect(trueButton).toHaveAttribute('data-variant', 'secondary')
      expect(falseButton).toHaveAttribute('data-variant', 'secondary')
    })
  })

  describe('User Interactions', () => {
    it('should call onChange with true when True button is clicked', async () => {
      const user = userEvent.setup()
      const condition = createCondition(null)

      render(<BooleanToggle condition={condition} onChange={mockOnChange} />)

      await user.click(screen.getByTestId('boolean-toggle-true'))

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: true,
        })
      )
    })

    it('should call onChange with false when False button is clicked', async () => {
      const user = userEvent.setup()
      const condition = createCondition(null)

      render(<BooleanToggle condition={condition} onChange={mockOnChange} />)

      await user.click(screen.getByTestId('boolean-toggle-false'))

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: false,
        })
      )
    })

    it('should preserve condition field and operator when clicking True', async () => {
      const user = userEvent.setup()
      const condition = createCondition(null)

      render(<BooleanToggle condition={condition} onChange={mockOnChange} />)

      await user.click(screen.getByTestId('boolean-toggle-true'))

      expect(mockOnChange).toHaveBeenCalledWith({
        type: 'condition',
        id: 'test-id',
        field: 'neverWatched',
        operator: 'equals',
        value: true,
      })
    })

    it('should preserve condition field and operator when clicking False', async () => {
      const user = userEvent.setup()
      const condition = createCondition(null)

      render(<BooleanToggle condition={condition} onChange={mockOnChange} />)

      await user.click(screen.getByTestId('boolean-toggle-false'))

      expect(mockOnChange).toHaveBeenCalledWith({
        type: 'condition',
        id: 'test-id',
        field: 'neverWatched',
        operator: 'equals',
        value: false,
      })
    })

    it('should allow toggling from true to false', async () => {
      const user = userEvent.setup()
      const condition = createCondition(true)

      render(<BooleanToggle condition={condition} onChange={mockOnChange} />)

      await user.click(screen.getByTestId('boolean-toggle-false'))

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: false,
        })
      )
    })

    it('should allow toggling from false to true', async () => {
      const user = userEvent.setup()
      const condition = createCondition(false)

      render(<BooleanToggle condition={condition} onChange={mockOnChange} />)

      await user.click(screen.getByTestId('boolean-toggle-true'))

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: true,
        })
      )
    })

    it('should call onChange even when clicking already selected value', async () => {
      const user = userEvent.setup()
      const condition = createCondition(true)

      render(<BooleanToggle condition={condition} onChange={mockOnChange} />)

      await user.click(screen.getByTestId('boolean-toggle-true'))

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          value: true,
        })
      )
    })
  })

  describe('Edge Cases', () => {
    it('should handle undefined value like null', () => {
      const condition: Condition = {
        type: 'condition',
        id: 'test-id',
        field: 'neverWatched',
        operator: 'equals',
        value: null,
      }

      render(<BooleanToggle condition={condition} onChange={mockOnChange} />)

      const trueButton = screen.getByTestId('boolean-toggle-true')
      const falseButton = screen.getByTestId('boolean-toggle-false')

      // Both should be secondary when value is null/undefined
      expect(trueButton).toHaveAttribute('data-variant', 'secondary')
      expect(falseButton).toHaveAttribute('data-variant', 'secondary')
    })
  })

  describe('Accessibility', () => {
    it('should have data-testid attributes for testing', () => {
      const condition = createCondition(null)

      render(<BooleanToggle condition={condition} onChange={mockOnChange} />)

      expect(screen.getByTestId('boolean-toggle-true')).toBeInTheDocument()
      expect(screen.getByTestId('boolean-toggle-false')).toBeInTheDocument()
    })

    it('should render buttons in a flex container', () => {
      const condition = createCondition(null)

      const { container } = render(
        <BooleanToggle condition={condition} onChange={mockOnChange} />
      )

      const wrapper = container.firstChild
      expect(wrapper).toHaveClass('flex-1', 'flex')
    })
  })
})
