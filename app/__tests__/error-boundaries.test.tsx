/**
 * The root error boundary tells the auth errors apart by digest alone, as a
 * production build delivers them (BP-27).
 */

import { render, screen } from '@testing-library/react'

import RootError from '@/app/error'
import { UnauthenticatedError, UnauthorizedAdminError } from '@/lib/admin'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

/** A generic message with the digest, as React's production Flight client delivers it. */
function productionError(digest?: string): Error & { digest?: string } {
  return Object.assign(new Error('An error occurred in the Server Components render.'), digest ? { digest } : {})
}

describe('app/error.tsx', () => {
  it('renders the unauthorized page for a generic message with the PM_FORBIDDEN digest', () => {
    render(<RootError error={productionError('PM_FORBIDDEN')} reset={jest.fn()} />)

    expect(screen.getByTestId('unauthorized-error-page')).toBeInTheDocument()
  })

  it('renders the unauthenticated page for the PM_UNAUTHENTICATED digest', () => {
    render(<RootError error={productionError('PM_UNAUTHENTICATED')} reset={jest.fn()} />)

    expect(screen.getByTestId('unauthenticated-error-page')).toBeInTheDocument()
  })

  it('renders the generic error for any other digest', () => {
    render(<RootError error={productionError('12345')} reset={jest.fn()} />)

    expect(screen.queryByTestId('unauthorized-error-page')).not.toBeInTheDocument()
    expect(screen.queryByTestId('unauthenticated-error-page')).not.toBeInTheDocument()
  })

  it('reads the forbidden digest requireAdmin() throws', () => {
    render(<RootError error={new UnauthorizedAdminError()} reset={jest.fn()} />)
    expect(screen.getByTestId('unauthorized-error-page')).toBeInTheDocument()
  })

  it('reads the unauthenticated digest requireAdmin() throws', () => {
    render(<RootError error={new UnauthenticatedError()} reset={jest.fn()} />)
    expect(screen.getByTestId('unauthenticated-error-page')).toBeInTheDocument()
  })
})
