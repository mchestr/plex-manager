import { render, screen } from '@testing-library/react'

import { Alert } from '@/components/ui/alert'

describe('Alert', () => {
  it('renders the message and title', () => {
    render(
      <Alert tone="info" title="Heads up">
        Something happened.
      </Alert>
    )

    expect(screen.getByText('Heads up')).toBeInTheDocument()
    expect(screen.getByText('Something happened.')).toBeInTheDocument()
  })

  it('applies tone-specific styling', () => {
    const { rerender } = render(
      <Alert tone="danger" data-testid="alert">
        Danger
      </Alert>
    )
    expect(screen.getByTestId('alert')).toHaveClass('border-red-500/40')

    rerender(
      <Alert tone="success" data-testid="alert">
        Success
      </Alert>
    )
    expect(screen.getByTestId('alert')).toHaveClass('border-green-500/40')

    rerender(
      <Alert tone="warning" data-testid="alert">
        Warning
      </Alert>
    )
    expect(screen.getByTestId('alert')).toHaveClass('border-amber-500/40')

    rerender(
      <Alert tone="info" data-testid="alert">
        Info
      </Alert>
    )
    expect(screen.getByTestId('alert')).toHaveClass('border-cyan-500/40')
  })

  it('uses role="alert" for assertive tones (warning/danger)', () => {
    const { rerender } = render(<Alert tone="warning">Warning</Alert>)
    expect(screen.getByRole('alert')).toBeInTheDocument()

    rerender(<Alert tone="danger">Danger</Alert>)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('uses role="status" for polite tones (info/success)', () => {
    const { rerender } = render(<Alert tone="info">Info</Alert>)
    expect(screen.getByRole('status')).toBeInTheDocument()

    rerender(<Alert tone="success">Success</Alert>)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('allows overriding the role', () => {
    render(
      <Alert tone="warning" role="status" data-testid="alert">
        Custom role
      </Alert>
    )
    expect(screen.getByTestId('alert')).toHaveAttribute('role', 'status')
  })

  it('renders the action slot', () => {
    render(
      <Alert tone="danger" action={<button type="button">Fix it</button>}>
        Payment failed
      </Alert>
    )
    expect(screen.getByRole('button', { name: 'Fix it' })).toBeInTheDocument()
  })

  it('renders a default icon and hides it from screen readers', () => {
    const { container } = render(<Alert tone="info">Info</Alert>)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders no icon when icon={null}', () => {
    const { container } = render(
      <Alert tone="info" icon={null}>
        No icon
      </Alert>
    )
    expect(container.querySelector('svg')).not.toBeInTheDocument()
  })
})
