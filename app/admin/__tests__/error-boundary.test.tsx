/**
 * Tests for admin error boundary
 * Tests that the error boundary properly handles unauthorized errors
 */

import { render, screen } from '@testing-library/react'
import AdminError from '@/app/admin/error'

// Mock the error components
jest.mock('@/components/admin/shared/unauthorized-error', () => ({
  UnauthorizedError: () => <div data-testid="unauthorized-error">Unauthorized Error Component</div>,
}))

jest.mock('@/components/admin/shared/unauthenticated-error', () => ({
  UnauthenticatedError: () => <div data-testid="unauthenticated-error">Unauthenticated Error Component</div>,
}))

/** What the browser receives in production: a generic message and the digest. */
function productionError(digest?: string): Error & { digest?: string } {
  return Object.assign(new Error('An error occurred in the Server Components render.'), digest ? { digest } : {})
}

describe('AdminError Boundary', () => {
  const mockReset = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    // Suppress console.error in tests
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('renders UnauthenticatedError for the PM_UNAUTHENTICATED digest', () => {
    render(<AdminError error={productionError('PM_UNAUTHENTICATED')} reset={mockReset} />)

    expect(screen.getByTestId('unauthenticated-error')).toBeInTheDocument()
  })

  it('renders UnauthorizedError for the PM_FORBIDDEN digest', () => {
    render(<AdminError error={productionError('PM_FORBIDDEN')} reset={mockReset} />)

    expect(screen.getByTestId('unauthorized-error')).toBeInTheDocument()
  })

  it.each(['UNAUTHENTICATED', 'UNAUTHORIZED', 'FORBIDDEN', 'Admin access required'])(
    'ignores the message %s without a digest',
    (message) => {
      render(<AdminError error={new Error(message)} reset={mockReset} />)

      expect(screen.queryByTestId('unauthorized-error')).not.toBeInTheDocument()
      expect(screen.queryByTestId('unauthenticated-error')).not.toBeInTheDocument()
      expect(screen.getByText('500')).toBeInTheDocument()
    }
  )

  it('should render generic error page for other errors', () => {
    const error = new Error('Something broke')

    render(<AdminError error={error} reset={mockReset} />)

    expect(screen.queryByTestId('unauthorized-error')).not.toBeInTheDocument()
    expect(screen.queryByTestId('unauthenticated-error')).not.toBeInTheDocument()
    expect(screen.getByText('500')).toBeInTheDocument()
  })

  it('should display Rex mascot for generic errors', () => {
    const error = new Error('Something broke')
    const { container } = render(<AdminError error={error} reset={mockReset} />)

    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('viewBox', '0 0 200 200')
  })

  it('should log error to console', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('Test error')

    render(<AdminError error={error} reset={mockReset} />)

    expect(consoleSpy).toHaveBeenCalledWith('Admin page error:', error)

    consoleSpy.mockRestore()
  })

  it('should handle error with digest property', () => {
    const error = new Error('Test error') as Error & { digest?: string }
    error.digest = 'test-digest-123'

    render(<AdminError error={error} reset={mockReset} />)

    expect(screen.getByText('500')).toBeInTheDocument()
  })
})

