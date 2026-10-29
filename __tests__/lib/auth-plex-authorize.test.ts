/**
 * @jest-environment node
 */

/**
 * The Plex provider's `authorize` reads the PIN from the browser's signed
 * `pm-plex-pin` cookie and the token from plex.tv itself (P4.8, SEC-11).
 * plex.tv, the invite redemption and the database are mocked; the last case
 * runs the real next-auth route to prove the cookie header reaches `authorize`.
 */

import { mockReset } from 'jest-mock-extended'
import { NextRequest } from 'next/server'

import { POST } from '@/app/api/auth/[...nextauth]/route'
import { buildUser } from '@/__tests__/helpers/factories'
import { getPlexAuthorize, plexPinRequest, readyPin, TEST_PLEX_CLIENT_ID } from '@/__tests__/helpers/plex-sign-in'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { checkUserServerAccess, getPlexUserInfo } from '@/lib/connections/plex'
import { waitForInvitedAccess } from '@/lib/connections/plex-access-wait'
import { readPin } from '@/lib/connections/plex-pin'
import { redeemPlexInvite } from '@/lib/invites/plex-redemption'
import { signValue } from '@/lib/security/signed-cookie'

const CSRF_TOKEN = 'csrf-token-for-tests'
let mockRequestHeaders = new Headers()

jest.mock('next/headers', () => ({
  headers: jest.fn(async () => mockRequestHeaders),
  cookies: jest.fn(async () => ({
    getAll: () => {
      const hash = require('node:crypto')
        .createHash('sha256')
        .update(`csrf-token-for-tests${process.env.NEXTAUTH_SECRET}`)
        .digest('hex')
      return [{ name: 'next-auth.csrf-token', value: `csrf-token-for-tests|${hash}` }]
    },
  })),
}))
jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/connections/plex-pin', () => ({ readPin: jest.fn() }))
jest.mock('@/lib/connections/plex', () => ({ checkUserServerAccess: jest.fn(), getPlexUserInfo: jest.fn() }))
jest.mock('@/lib/connections/plex-access-wait', () => ({ waitForInvitedAccess: jest.fn() }))
jest.mock('@/lib/invites/plex-redemption', () => ({ redeemPlexInvite: jest.fn() }))
jest.mock('@/lib/access', () => ({ getAccessLevel: jest.fn(async () => 'full') }))
jest.mock('@/lib/security/audit-log', () => ({
  ...jest.requireActual('@/lib/security/audit-log'),
  logAuditEvent: jest.fn(),
}))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const mockReadPin = jest.mocked(readPin)
const mockGetPlexUserInfo = jest.mocked(getPlexUserInfo)
const mockCheckUserServerAccess = jest.mocked(checkUserServerAccess)
const mockWaitForInvitedAccess = jest.mocked(waitForInvitedAccess)
const mockRedeemPlexInvite = jest.mocked(redeemPlexInvite)

const PLEX_TOKEN = 'token-from-plex-tv'
const PLEX_USER = { id: 'plex-member', username: 'member', email: 'member@example.com' }
const PLEX_SERVER = {
  id: 'server-1',
  name: 'Plex',
  url: 'https://plex.example.com:32400',
  publicUrl: null,
  token: 'server-token',
  adminPlexUserId: 'plex-owner',
  machineIdentifier: 'this-server-machine-id',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}
const MEMBER_ROW = buildUser({ id: 'member-row', plexUserId: PLEX_USER.id })

const authorize = getPlexAuthorize()

beforeEach(() => {
  jest.clearAllMocks()
  mockReset(prismaMock)
  mockReadPin.mockResolvedValue(readyPin(PLEX_TOKEN))
  mockGetPlexUserInfo.mockResolvedValue({ success: true, data: PLEX_USER })
  mockCheckUserServerAccess.mockResolvedValue({ status: 'granted' })
  mockWaitForInvitedAccess.mockResolvedValue({ status: 'granted' })
  mockRedeemPlexInvite.mockResolvedValue({ success: true, data: null })
  prismaMock.plexServer.findFirst.mockResolvedValue(PLEX_SERVER)
  prismaMock.user.findUnique.mockResolvedValue(MEMBER_ROW)
  prismaMock.user.update.mockResolvedValue(MEMBER_ROW)
})

describe('Plex authorize reads the PIN cookie', () => {
  it('refuses a request without the cookie', async () => {
    await expect(authorize(undefined, { headers: {} })).rejects.toThrow('plex_pin_expired')
    expect(mockReadPin).not.toHaveBeenCalled()
    expect(mockGetPlexUserInfo).not.toHaveBeenCalled()
  })

  it('refuses a cookie signed for another purpose', async () => {
    const forged = signValue({ pinId: 42, code: 'abcd1234', clientId: TEST_PLEX_CLIENT_ID }, 'discord-oauth', 900)

    await expect(authorize(undefined, { headers: { cookie: `pm-plex-pin=${forged}` } })).rejects.toThrow(
      'plex_pin_expired'
    )
    expect(mockReadPin).not.toHaveBeenCalled()
  })

  it.each([
    [{ status: 'expired' } as const, 'plex_pin_expired'],
  ])('refuses a PIN that is %p', async (status, code) => {
    mockReadPin.mockResolvedValue(status)

    await expect(authorize(undefined, plexPinRequest())).rejects.toThrow(code)
    expect(mockReadPin).toHaveBeenCalledTimes(1)
    expect(mockGetPlexUserInfo).not.toHaveBeenCalled()
  })

  describe('a PIN plex.tv does not report as ready at once', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it.each([
      [{ status: 'waiting' } as const, 'plex_pin_expired'],
      [{ status: 'unavailable' } as const, 'sign_in_failed'],
    ])('is read again, and refused when still %p', async (status, code) => {
      mockReadPin.mockResolvedValue(status)

      const refused = expect(authorize(undefined, plexPinRequest())).rejects.toThrow(code)
      await jest.runAllTimersAsync()
      await refused
      expect(mockReadPin.mock.calls.length).toBeGreaterThan(1)
      expect(mockGetPlexUserInfo).not.toHaveBeenCalled()
    })

    it('signs in when a later read is ready', async () => {
      mockReadPin.mockResolvedValueOnce({ status: 'unavailable' }).mockResolvedValueOnce({ status: 'waiting' })

      const result = authorize(undefined, plexPinRequest())
      await jest.runAllTimersAsync()

      await expect(result).resolves.toMatchObject({ id: 'member-row' })
      expect(mockReadPin).toHaveBeenCalledTimes(3)
    })
  })

  it('signs in with a ready PIN, using the token plex.tv issued for it', async () => {
    const result = await authorize(undefined, plexPinRequest({ pinId: 77, code: 'zzzz9999' }))

    expect(result).toMatchObject({ id: 'member-row' })
    expect(mockReadPin).toHaveBeenCalledWith(77, 'zzzz9999', TEST_PLEX_CLIENT_ID)
    expect(mockGetPlexUserInfo).toHaveBeenCalledWith(PLEX_TOKEN)
    expect(mockCheckUserServerAccess).toHaveBeenCalledTimes(1)
    expect(mockRedeemPlexInvite).not.toHaveBeenCalled()
  })

  it('ignores a token sent in the credentials', async () => {
    await authorize({ authToken: 'attacker-token' }, plexPinRequest())

    expect(mockGetPlexUserInfo).toHaveBeenCalledWith(PLEX_TOKEN)
    expect(mockGetPlexUserInfo).not.toHaveBeenCalledWith('attacker-token')

    await expect(authorize({ authToken: 'attacker-token' }, { headers: {} })).rejects.toThrow('plex_pin_expired')
  })

  it('refuses a disabled member', async () => {
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ ...MEMBER_ROW, disabledAt: new Date() }))

    await expect(authorize(undefined, plexPinRequest())).resolves.toBeNull()
  })

  it('throws access_denied for a member without access (Stripe off)', async () => {
    mockCheckUserServerAccess.mockResolvedValue({ status: 'denied' })
    prismaMock.config.findUnique.mockResolvedValue(null)

    await expect(authorize(undefined, plexPinRequest())).rejects.toThrow('access_denied')
  })
})

describe('Plex authorize redeems the invite in the cookie', () => {
  it('redeems it exactly once, then waits for the share to propagate', async () => {
    const result = await authorize(undefined, plexPinRequest({ inviteCode: 'FRIENDS1' }))

    expect(result).toMatchObject({ id: 'member-row' })
    expect(mockRedeemPlexInvite).toHaveBeenCalledTimes(1)
    expect(mockRedeemPlexInvite).toHaveBeenCalledWith('FRIENDS1', PLEX_TOKEN)
    expect(mockWaitForInvitedAccess).toHaveBeenCalledTimes(1)
    expect(mockCheckUserServerAccess).not.toHaveBeenCalled()
  })

  it.each(['INVITE_INVALID', 'INVITE_WRONG_SERVICE'] as const)('throws invite_invalid for %s', async (code) => {
    mockRedeemPlexInvite.mockResolvedValue({ success: false, code, error: 'This invite is for Jellyfin' })

    await expect(authorize(undefined, plexPinRequest({ inviteCode: 'JELLY123' }))).rejects.toThrow('invite_invalid')
    expect(mockGetPlexUserInfo).not.toHaveBeenCalled()
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('refuses a disabled account the redemption turned away, as a disabled sign-in does', async () => {
    mockRedeemPlexInvite.mockResolvedValue({ success: false, code: 'FORBIDDEN', error: 'This account is disabled.' })

    await expect(authorize(undefined, plexPinRequest({ inviteCode: 'FRIENDS1' }))).resolves.toBeNull()
    expect(mockGetPlexUserInfo).not.toHaveBeenCalled()
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('throws sign_in_failed when Plex was unavailable during the redemption', async () => {
    mockRedeemPlexInvite.mockResolvedValue({ success: false, code: 'UPSTREAM_UNAVAILABLE', error: 'x' })

    await expect(authorize(undefined, plexPinRequest({ inviteCode: 'FRIENDS1' }))).rejects.toThrow('sign_in_failed')
  })

  it('throws invite_already_member when an affiliate invite refuses an account that has or had access', async () => {
    mockRedeemPlexInvite.mockResolvedValue({
      success: false,
      code: 'INVITE_ALREADY_MEMBER',
      error: "You're already a member. Sign in instead.",
    })

    await expect(authorize(undefined, plexPinRequest({ inviteCode: 'AFFCODE1' }))).rejects.toThrow('invite_already_member')
    expect(mockGetPlexUserInfo).not.toHaveBeenCalled()
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })
})

describe('the next-auth route passes the cookie header to authorize', () => {
  const env = process.env as Record<string, string | undefined>
  const originalUrl = env.NEXTAUTH_URL

  beforeAll(() => {
    env.NEXTAUTH_URL = 'http://localhost:3000'
  })

  afterAll(() => {
    env.NEXTAUTH_URL = originalUrl
  })

  async function callback(cookie: string | undefined) {
    const requestHeaders: Record<string, string> = {
      'content-type': 'application/x-www-form-urlencoded',
      host: 'localhost:3000',
      'x-forwarded-for': `198.51.100.${Math.floor(Math.random() * 200) + 1}`,
      ...(cookie ? { cookie } : {}),
    }
    mockRequestHeaders = new Headers(requestHeaders)
    const request = new NextRequest('http://localhost:3000/api/auth/callback/plex', {
      method: 'POST',
      headers: requestHeaders,
      body: new URLSearchParams({ csrfToken: CSRF_TOKEN, json: 'true', authToken: 'attacker-token' }).toString(),
    })
    const response = await POST(request, { params: Promise.resolve({ nextauth: ['callback', 'plex'] }) })
    const body = (await response.json()) as { url: string }
    return { status: response.status, error: new URL(body.url).searchParams.get('error'), response }
  }

  it('signs in the browser holding the cookie and sets the session cookie', async () => {
    const { status, error, response } = await callback(plexPinRequest().headers.cookie)

    expect(status).toBe(200)
    expect(error).toBeNull()
    expect(response.headers.get('set-cookie')).toContain('next-auth.session-token=')
    expect(mockGetPlexUserInfo).toHaveBeenCalledWith(PLEX_TOKEN)
  })

  it('refuses another browser, whatever it posts', async () => {
    const { status, error } = await callback(undefined)

    expect(status).toBe(401)
    expect(error).toBe('plex_pin_expired')
    expect(mockGetPlexUserInfo).not.toHaveBeenCalled()
  })
})
