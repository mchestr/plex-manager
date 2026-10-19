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

// Define error classes locally to avoid importing from lib/admin
// which would require mocking next-auth
class UnauthorizedAdminError extends Error {
  constructor(message: string = "Admin access required") {
    super(message)
    this.name = "UnauthorizedAdminError"
  }
}

class UnauthenticatedError extends Error {
  constructor(message: string = "Authentication required") {
    super(message)
    this.name = "UnauthenticatedError"
  }
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

  it('should render UnauthenticatedError for UnauthenticatedError', () => {
    const error = new UnauthenticatedError('UNAUTHENTICATED')

    render(<AdminError error={error} reset={mockReset} />)

    expect(screen.getByTestId('unauthenticated-error')).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
  })

  it('should render UnauthenticatedError for error with UNAUTHENTICATED message', () => {
    const error = new Error('UNAUTHENTICATED')

    render(<AdminError error={error} reset={mockReset} />)

    expect(screen.getByTestId('unauthenticated-error')).toBeInTheDocument()
  })

  it('should render UnauthorizedError for UnauthorizedAdminError', () => {
    const error = new UnauthorizedAdminError('UNAUTHORIZED')

    render(<AdminError error={error} reset={mockReset} />)

    expect(screen.getByTestId('unauthorized-error')).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
  })

  it('should render UnauthorizedError for error with UNAUTHORIZED message', () => {
    const error = new Error('UNAUTHORIZED')

    render(<AdminError error={error} reset={mockReset} />)

    expect(screen.getByTestId('unauthorized-error')).toBeInTheDocument()
  })

  it('should render UnauthorizedError for error with FORBIDDEN message', () => {
    const error = new Error('FORBIDDEN')

    render(<AdminError error={error} reset={mockReset} />)

    expect(screen.getByTestId('unauthorized-error')).toBeInTheDocument()
  })

  it('should render UnauthorizedError for error containing "Admin access required"', () => {
    const error = new Error('Admin access required')

    render(<AdminError error={error} reset={mockReset} />)

    expect(screen.getByTestId('unauthorized-error')).toBeInTheDocument()
  })

  it('should render UnauthorizedError for error containing "not authorized"', () => {
    const error = new Error('User is not authorized')

    render(<AdminError error={error} reset={mockReset} />)

    expect(screen.getByTestId('unauthorized-error')).toBeInTheDocument()
  })

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

