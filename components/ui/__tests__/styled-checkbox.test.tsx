import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StyledCheckbox } from '../styled-checkbox'

describe('StyledCheckbox', () => {
  it('keeps a generated id stable across rerenders and links the label to it', () => {
    const { rerender } = render(<StyledCheckbox label="Notify me" data-testid="cb" onChange={() => {}} checked={false} />)

    const input = screen.getByRole('checkbox', { name: 'Notify me' })
    const firstId = input.id
    expect(firstId).not.toBe('')
    expect(screen.getByTestId('cb')).toHaveAttribute('for', firstId)

    rerender(<StyledCheckbox label="Notify me" data-testid="cb" onChange={() => {}} checked />)

    expect(screen.getByRole('checkbox', { name: 'Notify me' }).id).toBe(firstId)
    expect(screen.getByTestId('cb')).toHaveAttribute('for', firstId)
  })

  it('uses the id prop when given', () => {
    render(<StyledCheckbox id="custom-id" label="Opt in" data-testid="cb" />)

    expect(screen.getByRole('checkbox', { name: 'Opt in' })).toHaveAttribute('id', 'custom-id')
    expect(screen.getByTestId('cb')).toHaveAttribute('for', 'custom-id')
  })

  it('toggles when its label is clicked', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<StyledCheckbox label="Opt in" data-testid="cb" onChange={onChange} />)

    await user.click(screen.getByText('Opt in'))

    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
