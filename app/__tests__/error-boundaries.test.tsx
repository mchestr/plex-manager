/**
 * The root error boundary tells the auth errors apart by digest alone, as a
 * production build delivers them (BP-27), and draws them as StatusScreens
 * (P10.17). No boundary under app/ reads `error.message` (SEC-20).
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

import { render, screen, within } from '@testing-library/react'

import RootError from '@/app/error'
import { getServerSession } from 'next-auth'

import { assertAdmin } from '@/lib/admin'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

/** A generic message with the digest, as React's production Flight client delivers it. */
function productionError(digest?: string): Error & { digest?: string } {
  return Object.assign(new Error('An error occurred in the Server Components render.'), digest ? { digest } : {})
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  jest.restoreAllMocks()
})

describe('app/error.tsx', () => {
  it('renders the unauthorized page as a StatusScreen for the PM_FORBIDDEN digest', () => {
    render(<RootError error={productionError('PM_FORBIDDEN')} reset={jest.fn()} />)

    const page = screen.getByTestId('unauthorized-error-page')
    expect(within(page).getByTestId('status-screen')).toBeInTheDocument()
    expect(within(page).getByRole('heading', { level: 1, name: 'Admins only' })).toBeInTheDocument()
    expect(within(page).getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/')
  })

  it('renders the unauthenticated page for the PM_UNAUTHENTICATED digest', () => {
    render(<RootError error={productionError('PM_UNAUTHENTICATED')} reset={jest.fn()} />)

    const page = screen.getByTestId('unauthenticated-error-page')
    expect(within(page).getByRole('heading', { level: 1, name: 'Sign in to continue' })).toBeInTheDocument()
    expect(within(page).getByRole('link', { name: 'Continue with Plex' })).toHaveAttribute('href', '/?callbackUrl=/admin')
  })

  it('renders the generic StatusScreen with the digest for any other digest', () => {
    render(<RootError error={productionError('12345')} reset={jest.fn()} />)

    expect(screen.queryByTestId('unauthorized-error-page')).not.toBeInTheDocument()
    expect(screen.queryByTestId('unauthenticated-error-page')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Something went wrong on our side' })).toBeInTheDocument()
    expect(screen.getByTestId('status-screen-code')).toHaveTextContent('12345')
    expect(screen.getByRole('link', { name: 'Go to home' })).toHaveAttribute('href', '/')
  })

  it('calls reset from Try again and never shows the message', () => {
    const reset = jest.fn()
    const { container } = render(
      <RootError error={Object.assign(new Error("Can't reach database server at db:5432"), { digest: 'abc' })} reset={reset} />
    )

    screen.getByRole('button', { name: 'Try again' }).click()
    expect(reset).toHaveBeenCalledTimes(1)
    expect(container).not.toHaveTextContent('db:5432')
  })

  it('reads the forbidden digest assertAdmin() throws', async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: 'member-1', isAdmin: false }, expires: '' })
    const error = await assertAdmin().catch((thrown: Error) => thrown)
    render(<RootError error={error as Error} reset={jest.fn()} />)
    expect(screen.getByTestId('unauthorized-error-page')).toBeInTheDocument()
  })

  it('reads the unauthenticated digest assertAdmin() throws', async () => {
    jest.mocked(getServerSession).mockResolvedValue(null)
    const error = await assertAdmin().catch((thrown: Error) => thrown)
    render(<RootError error={error as Error} reset={jest.fn()} />)
    expect(screen.getByTestId('unauthenticated-error-page')).toBeInTheDocument()
  })
})

const BOUNDARY_FILES = new Set(['error.tsx', 'global-error.tsx', 'not-found.tsx'])

function boundaries(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return entry === '__tests__' ? [] : boundaries(full)
    return BOUNDARY_FILES.has(entry) ? [full] : []
  })
}

describe('SEC-20 source scan', () => {
  const files = boundaries(path.join(process.cwd(), 'app'))

  it('finds the boundaries', () => {
    expect(files.length).toBeGreaterThanOrEqual(10)
    expect(files.map((file) => path.relative(process.cwd(), file))).toEqual(
      expect.arrayContaining(['app/error.tsx', 'app/global-error.tsx', 'app/not-found.tsx', 'app/admin/error.tsx'])
    )
  })

  it.each(files.map((file) => [path.relative(process.cwd(), file), file]))('%s never reads error.message', (_name, file) => {
    expect(readFileSync(file, 'utf8')).not.toMatch(/\berror\s*\??\.\s*message\b/)
  })
})
