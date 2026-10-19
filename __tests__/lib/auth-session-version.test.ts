/**
 * @jest-environment node
 */

/**
 * The JWT callback in lib/auth.ts ends a session (SEC-10) when the user row is
 * gone, the user is disabled, or the token's `sv` no longer matches
 * `User.sessionVersion`, by throwing SessionRevokedError. A token issued
 * before P4.7 has no `sv` and counts as version 0, and a database error keeps
 * the token.
 */

import type { JWT } from 'next-auth/jwt'
import type { User } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { SessionRevokedError } from '@/lib/session-revocation'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

jest.mock('@/lib/connections/plex', () => ({
  checkUserServerAccess: jest.fn(),
  getPlexUserInfo: jest.fn(),
}))

jest.mock('@/lib/jellyfin-auth', () => ({
  authenticateJellyfin: jest.fn(),
}))

const mockError = jest.fn()
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    error: (...args: unknown[]) => mockError(...args),
    warn: jest.fn(),
  }),
}))

type JwtParams = { token: JWT; user?: User; trigger?: 'signIn' | 'signUp' | 'update' }

function jwt(params: JwtParams): Promise<JWT> {
  const callback = authOptions.callbacks?.jwt
  if (!callback) {
    throw new Error('authOptions.callbacks.jwt is missing')
  }
  return Promise.resolve(callback(params as Parameters<typeof callback>[0]))
}

/** A token whose last recheck is old enough that the next request rechecks. */
function staleToken(overrides: Partial<JWT> = {}): JWT {
  return { sub: 'user-1', name: 'Member', isAdmin: false, checkedAt: 0, sv: 2, ...overrides }
}

function givenRow(row: { isAdmin?: boolean; sessionVersion?: number; disabledAt?: Date | null } | null) {
  prismaMock.user.findUnique.mockResolvedValue(
    row === null ? null : ({ isAdmin: false, sessionVersion: 2, disabledAt: null, ...row } as never)
  )
}

describe('JWT callback session version (P4.7)', () => {
  it('stores the sign-in sessionVersion as sv', async () => {
    const token = await jwt({
      token: {} as JWT,
      user: { id: 'user-1', name: 'Member', isAdmin: false, sessionVersion: 4 },
    })

    expect(token).toMatchObject({ sub: 'user-1', sv: 4, isAdmin: false })
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })

  it('reads isAdmin, sessionVersion and disabledAt on a recheck', async () => {
    givenRow({})

    await jwt({ token: staleToken() })

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { isAdmin: true, sessionVersion: true, disabledAt: true },
    })
  })

  it('ends the session on a version mismatch', async () => {
    givenRow({ sessionVersion: 3 })

    await expect(jwt({ token: staleToken() })).rejects.toBeInstanceOf(SessionRevokedError)
  })

  it('ends the session when the user row is gone', async () => {
    givenRow(null)

    await expect(jwt({ token: staleToken() })).rejects.toBeInstanceOf(SessionRevokedError)
  })

  it('ends the session of a disabled user', async () => {
    givenRow({ disabledAt: new Date() })

    await expect(jwt({ token: staleToken() })).rejects.toBeInstanceOf(SessionRevokedError)
  })

  it('keeps a session whose version matches, and refreshes isAdmin', async () => {
    givenRow({ isAdmin: true })

    const token = await jwt({ token: staleToken() })

    expect(token.isAdmin).toBe(true)
    expect(token.sv).toBe(2)
    expect(token.checkedAt).toBeGreaterThan(0)
  })

  it('treats a legacy token without sv as version 0', async () => {
    givenRow({ sessionVersion: 0 })

    const token = await jwt({ token: staleToken({ sv: undefined }) })

    expect(token.sub).toBe('user-1')
  })

  it('ends a legacy session once its user has been revoked', async () => {
    givenRow({ sessionVersion: 1 })

    await expect(jwt({ token: staleToken({ sv: undefined }) })).rejects.toBeInstanceOf(SessionRevokedError)
  })

  it('keeps the token when the database read fails', async () => {
    prismaMock.user.findUnique.mockRejectedValue(new Error('connection terminated'))
    const token = staleToken()

    await expect(jwt({ token })).resolves.toEqual(token)
  })

  it('does not recheck a fresh token', async () => {
    const token = staleToken({ checkedAt: Date.now() })

    await expect(jwt({ token })).resolves.toBe(token)
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })

  it('rechecks a fresh token on trigger "update"', async () => {
    givenRow({ sessionVersion: 3 })

    await expect(jwt({ token: staleToken({ checkedAt: Date.now() }), trigger: 'update' })).rejects.toBeInstanceOf(
      SessionRevokedError
    )
  })
})

describe('next-auth error logger', () => {
  beforeEach(() => mockError.mockClear())

  it('stays quiet about a revoked session, which the jwt callback logged', () => {
    authOptions.logger?.error?.('JWT_SESSION_ERROR', new SessionRevokedError('version-mismatch'))

    expect(mockError).not.toHaveBeenCalled()
  })

  it('logs every other next-auth error', () => {
    const error = new Error('JWT invalid')
    authOptions.logger?.error?.('JWT_SESSION_ERROR', error)

    expect(mockError).toHaveBeenCalledWith('next-auth.JWT_SESSION_ERROR', error)
  })
})
