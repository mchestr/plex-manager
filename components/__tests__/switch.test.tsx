import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Switch } from '@/components/ui/switch'

describe('Switch', () => {
  it('calls onCheckedChange with true when clicking an unchecked switch', async () => {
    const user = userEvent.setup()
    const onCheckedChange = jest.fn()

    render(<Switch checked={false} onCheckedChange={onCheckedChange} label="Toggle feature" />)

    await user.click(screen.getByRole('switch'))

    expect(onCheckedChange).toHaveBeenCalledTimes(1)
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it('calls onCheckedChange with false when clicking a checked switch', async () => {
    const user = userEvent.setup()
    const onCheckedChange = jest.fn()

    render(<Switch checked={true} onCheckedChange={onCheckedChange} label="Toggle feature" />)

    await user.click(screen.getByRole('switch'))

    expect(onCheckedChange).toHaveBeenCalledWith(false)
  })

  it('reflects the checked state via aria-checked', () => {
    const { rerender } = render(
      <Switch checked={true} onCheckedChange={jest.fn()} label="Toggle feature" />
    )

    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')

    rerender(<Switch checked={false} onCheckedChange={jest.fn()} label="Toggle feature" />)

    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  })

  it('does not fire the change handler when disabled', async () => {
    const user = userEvent.setup()
    const onCheckedChange = jest.fn()

    render(
      <Switch checked={false} onCheckedChange={onCheckedChange} disabled label="Toggle feature" />
    )

    const toggle = screen.getByRole('switch')
    expect(toggle).toBeDisabled()

    await user.click(toggle)

    expect(onCheckedChange).not.toHaveBeenCalled()
  })

  it('is toggled via keyboard (Space/Enter) when focused', async () => {
    const user = userEvent.setup()
    const onCheckedChange = jest.fn()

    render(<Switch checked={false} onCheckedChange={onCheckedChange} label="Toggle feature" />)

    const toggle = screen.getByRole('switch')
    toggle.focus()
    expect(toggle).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(onCheckedChange).toHaveBeenCalledWith(true)

    await user.keyboard(' ')
    expect(onCheckedChange).toHaveBeenCalledTimes(2)
  })

  it('exposes an accessible name via label', () => {
    render(<Switch checked={false} onCheckedChange={jest.fn()} label="Enable Stripe" />)

    expect(screen.getByRole('switch', { name: 'Enable Stripe' })).toBeInTheDocument()
  })

  it('is disabled and shows a spinner while loading', async () => {
    const user = userEvent.setup()
    const onCheckedChange = jest.fn()

    render(
      <Switch checked={false} onCheckedChange={onCheckedChange} loading label="Toggle feature" />
    )

    const toggle = screen.getByRole('switch')
    expect(toggle).toBeDisabled()
    expect(toggle).toHaveAttribute('aria-busy', 'true')
    expect(document.querySelector('.animate-spin')).toBeInTheDocument()

    await user.click(toggle)
    expect(onCheckedChange).not.toHaveBeenCalled()
  })

  it('applies the provided data-testid', () => {
    render(
      <Switch
        checked={false}
        onCheckedChange={jest.fn()}
        data-testid="my-switch"
        label="Toggle feature"
      />
    )

    expect(screen.getByTestId('my-switch')).toBeInTheDocument()
  })
})
