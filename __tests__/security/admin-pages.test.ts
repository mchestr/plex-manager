/**
 * Security tests for admin pages: a page or loader that checks next to its
 * data calls `assertAdmin()`, whose errors carry the digests the error
 * boundaries render as the sign-in and Unauthorized screens (BP-27, P11.5).
 */

import { getServerSession } from 'next-auth'

import { assertAdmin } from '@/lib/admin'
import { authErrorKind } from '@/lib/auth-errors'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

const session = jest.mocked(getServerSession)

beforeEach(() => jest.clearAllMocks())

describe('assertAdmin', () => {
  it('returns the session for an admin', async () => {
    const admin = { user: { id: 'admin-user-id', isAdmin: true }, expires: '' }
    session.mockResolvedValue(admin)

    await expect(assertAdmin()).resolves.toEqual(admin)
  })

  it('throws an error the boundaries read as forbidden for a member', async () => {
    session.mockResolvedValue({ user: { id: 'regular-user-id', isAdmin: false }, expires: '' })

    const error = await assertAdmin().catch((thrown: Error & { digest?: string }) => thrown)

    expect(error).toBeInstanceOf(Error)
    expect(authErrorKind(error as Error & { digest?: string })).toBe('forbidden')
  })

  it('throws an error the boundaries read as unauthenticated without a session', async () => {
    session.mockResolvedValue(null)

    const error = await assertAdmin().catch((thrown: Error & { digest?: string }) => thrown)

    expect(authErrorKind(error as Error & { digest?: string })).toBe('unauthenticated')
  })
})
