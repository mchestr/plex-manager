import { ErrorState } from '@/components/ui/error-state'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const GENERIC_TITLE = 'Something went wrong on our side'
const GENERIC_DESCRIPTION = 'Please try again. If it keeps happening, let the server admin know.'

function withDigest(message: string, digest: string): Error & { digest?: string } {
  return Object.assign(new Error(message), { digest })
}

describe('ErrorState', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('copy', () => {
    it('renders the generic copy by default', () => {
      render(<ErrorState />)

      expect(screen.getByRole('heading', { name: GENERIC_TITLE })).toBeInTheDocument()
      expect(screen.getByText(GENERIC_DESCRIPTION)).toBeInTheDocument()
    })

    it('renders a custom title and message', () => {
      render(<ErrorState title="Setup Error" message="Custom error message" />)

      expect(screen.getByRole('heading', { name: 'Setup Error' })).toBeInTheDocument()
      expect(screen.getByText('Custom error message')).toBeInTheDocument()
    })

    it('falls back to the generic description for an empty message', () => {
      render(<ErrorState message="" />)

      expect(screen.getByText(GENERIC_DESCRIPTION)).toBeInTheDocument()
    })

    it('renders an empty title when the caller passes one', () => {
      render(<ErrorState title="" />)

      expect(screen.queryByText(GENERIC_TITLE)).not.toBeInTheDocument()
    })
  })

  describe('never renders the error message (SEC-20)', () => {
    it("hides Error('Can't reach database server at db:5432')", () => {
      const { container } = render(<ErrorState error={new Error("Can't reach database server at db:5432")} />)

      expect(container).not.toHaveTextContent('db:5432')
      expect(container).not.toHaveTextContent("Can't reach database server")
      expect(screen.getByText(GENERIC_DESCRIPTION)).toBeInTheDocument()
    })

    it('hides the message even with a title and no message from the caller', () => {
      const { container } = render(<ErrorState title="Sign In Error" error={new Error('token=abc123 rejected')} />)

      expect(container).not.toHaveTextContent('token=abc123')
    })

    it('prefers the caller message and still hides the error message', () => {
      const { container } = render(<ErrorState error={new Error('Error message')} message="Custom message" />)

      expect(screen.getByText('Custom message')).toBeInTheDocument()
      expect(container).not.toHaveTextContent('Error message')
    })

    it('handles an error without a message property', () => {
      render(<ErrorState error={{} as Error} />)

      expect(screen.getByText(GENERIC_DESCRIPTION)).toBeInTheDocument()
    })
  })

  describe('digest', () => {
    it("shows abc123 and never the message of Error('Can't reach database server at db:5432')", () => {
      const { container } = render(
        <ErrorState error={withDigest("Can't reach database server at db:5432", 'abc123')} />
      )

      expect(screen.getByText('abc123')).toHaveClass('font-mono')
      expect(container).not.toHaveTextContent('db:5432')
      expect(screen.getByRole('heading', { name: GENERIC_TITLE })).toBeInTheDocument()
    })

    it('renders as a Card with a secondary action beside Try again', () => {
      render(<ErrorState reset={jest.fn()} secondaryAction={<a href="/admin/users">Back to users</a>} />)

      expect(screen.getByTestId('error-state')).toHaveAttribute('data-slot', 'card')
      expect(screen.getByRole('link', { name: 'Back to users' })).toBeInTheDocument()
    })

    it('shows the digest in mono', () => {
      render(<ErrorState error={withDigest('secret detail', '2349871')} />)

      const digest = screen.getByTestId('error-state-digest')
      expect(digest).toHaveTextContent('Reference 2349871')
      expect(screen.getByText('2349871')).toHaveClass('font-mono')
      expect(document.body).not.toHaveTextContent('secret detail')
    })

    it('uses the copy for a digest that is a known code', () => {
      render(<ErrorState error={withDigest('x', 'FORBIDDEN')} />)

      expect(screen.getByRole('heading', { name: "You don't have access" })).toBeInTheDocument()
    })

    it('shows no digest line without a digest', () => {
      render(<ErrorState error={new Error('x')} />)

      expect(screen.queryByTestId('error-state-digest')).not.toBeInTheDocument()
    })
  })

  describe('logging', () => {
    it('logs the error and its digest through the logger (console in the browser)', () => {
      const error = new Error('Test error')
      render(<ErrorState error={error} />)

      expect(console.error).toHaveBeenCalledWith('[error-boundary]', 'Route Error', expect.objectContaining({ err: expect.objectContaining({ message: 'Test error' }) }))
    })

    it('does not log without an error', () => {
      render(<ErrorState />)

      expect(console.error).not.toHaveBeenCalled()
    })
  })

  describe('reset', () => {
    it('renders a Button that calls reset', async () => {
      const user = userEvent.setup()
      const reset = jest.fn()
      render(<ErrorState reset={reset} />)

      const button = screen.getByRole('button', { name: 'Try again' })
      expect(button).toHaveAttribute('data-testid', 'error-state-retry')
      expect(button).not.toHaveClass('bg-amber-500')
      await user.click(button)

      expect(reset).toHaveBeenCalledTimes(1)
    })

    it('renders no button without reset', () => {
      render(<ErrorState />)

      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
  })

  it('applies a custom className', () => {
    render(<ErrorState className="custom-class" />)

    expect(screen.getByTestId('error-state')).toHaveClass('custom-class')
  })

  it('hides the decorative icon from assistive technology', () => {
    const { container } = render(<ErrorState />)

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
