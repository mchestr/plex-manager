/**
 * @jest-environment node
 */

/**
 * A revoked session ends at the route level (P4.7, SEC-10): when the JWT
 * callback throws SessionRevokedError, next-auth's session route answers `{}`
 * and clears the session cookie, so neither the client nor getServerSession
 * sees a half-built session.
 */

import { GET } from '@/app/api/auth/[...nextauth]/route'
import { encode, type JWT } from 'next-auth/jwt'
import { NextRequest } from 'next/server'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

const COOKIE = 'next-auth.session-token'
let currentCookies: { name: string; value: string }[] = []

jest.mock('next/headers', () => ({
  headers: jest.fn(async () => new Headers({ host: 'localhost:3000' })),
  cookies: jest.fn(async () => ({ getAll: () => currentCookies })),
}))

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

jest.mock('@/lib/jellyfin-auth', () => ({
  authenticateJellyfin: jest.fn(),
}))

jest.mock('@/lib/connections/plex', () => ({
  checkUserServerAccess: jest.fn(),
  getPlexUserInfo: jest.fn(),
}))

jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const env = process.env as Record<string, string | undefined>
const originalNextAuthUrl = env.NEXTAUTH_URL

async function getSession(token: JWT) {
  const secret = env.NEXTAUTH_SECRET
  if (!secret) {
    throw new Error('jest.setup.js sets NEXTAUTH_SECRET')
  }
  currentCookies = [{ name: COOKIE, value: await encode({ token, secret }) }]
  const request = new NextRequest('http://localhost:3000/api/auth/session')
  const response = await GET(request, { params: Promise.resolve({ nextauth: ['session'] }) })
  return { body: (await response.json()) as Record<string, unknown>, setCookie: response.headers.get('set-cookie') ?? '' }
}

const token: JWT = { sub: 'user-1', name: 'Member', email: 'member@example.com', isAdmin: false, checkedAt: 0, sv: 1 }

describe('GET /api/auth/session with a revoked session', () => {
  beforeAll(() => {
    env.NEXTAUTH_URL = 'http://localhost:3000'
  })

  afterAll(() => {
    env.NEXTAUTH_URL = originalNextAuthUrl
  })

  it('answers {} and clears the cookie when the version moved on', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isAdmin: false, sessionVersion: 2, disabledAt: null } as never)

    const { body, setCookie } = await getSession(token)

    expect(body).toEqual({})
    expect(setCookie).toContain(`${COOKIE}=;`)
    expect(setCookie).toMatch(/Max-Age=0/i)
  })

  it('answers {} when the user row is gone', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)

    const { body } = await getSession(token)

    expect(body).toEqual({})
  })

  it('still returns the session while the version matches', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isAdmin: false, sessionVersion: 1, disabledAt: null } as never)

    const { body } = await getSession(token)

    expect(body).toMatchObject({ user: { id: 'user-1', name: 'Member' } })
  })
})
