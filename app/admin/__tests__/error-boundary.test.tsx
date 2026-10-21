/**
 * The admin boundary, inside the shell (P10.17): the gate's denials by
 * digest, else an ErrorState whose Try again calls reset and a link to Users.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import AdminError from '@/app/admin/error'

/** What the browser receives in production: a generic message and the digest. */
function productionError(digest?: string): Error & { digest?: string } {
  return Object.assign(new Error('An error occurred in the Server Components render.'), digest ? { digest } : {})
}

describe('AdminError Boundary', () => {
  const mockReset = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('renders the sign-in StatusScreen for the PM_UNAUTHENTICATED digest', () => {
    render(<AdminError error={productionError('PM_UNAUTHENTICATED')} reset={mockReset} />)

    expect(screen.getByTestId('unauthenticated-error-page')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in to continue' })).toBeInTheDocument()
  })

  it('renders the admins-only StatusScreen for the PM_FORBIDDEN digest', () => {
    render(<AdminError error={productionError('PM_FORBIDDEN')} reset={mockReset} />)

    expect(screen.getByTestId('unauthorized-error-page')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Admins only' })).toBeInTheDocument()
  })

  it.each(['UNAUTHENTICATED', 'UNAUTHORIZED', 'FORBIDDEN', 'Admin access required'])(
    'ignores the message %s without a digest',
    (message) => {
      render(<AdminError error={new Error(message)} reset={mockReset} />)

      expect(screen.queryByTestId('unauthorized-error-page')).not.toBeInTheDocument()
      expect(screen.queryByTestId('unauthenticated-error-page')).not.toBeInTheDocument()
      expect(screen.getByTestId('error-state')).toBeInTheDocument()
    }
  )

  it('renders an ErrorState whose Try again calls reset', async () => {
    const user = userEvent.setup()
    render(<AdminError error={new Error('Something broke')} reset={mockReset} />)

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(mockReset).toHaveBeenCalledTimes(1)
  })

  it('links back to Users', () => {
    render(<AdminError error={new Error('Something broke')} reset={mockReset} />)

    expect(screen.getByRole('link', { name: 'Back to users' })).toHaveAttribute('href', '/admin/users')
  })

  it('shows the digest and never the message', () => {
    const { container } = render(
      <AdminError error={Object.assign(new Error('token=abc rejected'), { digest: 'test-digest-123' })} reset={mockReset} />
    )

    expect(screen.getByTestId('error-state-digest')).toHaveTextContent('test-digest-123')
    expect(container).not.toHaveTextContent('token=abc')
  })
})
