/**
 * @jest-environment node
 */

/**
 * Pins the plex.tv auth URL built by `createPlexAuthUrl` in lib/plex-auth.ts.
 * The expected strings in the "matches the qs" cases were captured from the
 * `qs.stringify` implementation before `qs` was replaced with
 * `URLSearchParams`, so any change in encoding (for example `+` instead of
 * `%20` for spaces) fails here.
 *
 * The URL is byte-identical to the qs output except for two characters, which
 * can only come from an operator-chosen PLEX_CLIENT_IDENTIFIER or base URL:
 * `URLSearchParams` writes `~` as `%7E` (qs left it as is) and leaves `*` as
 * is (qs wrote `%2A`). Both forms decode to the same characters; the last
 * encoding case pins that known difference.
 */

import { createPlexAuthUrl } from '@/lib/plex-auth'

jest.mock('@/lib/security/rate-limit', () => ({
  consume: jest.fn(),
  actionClientIp: jest.fn(),
}))

jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const AUTH_PREFIX = 'https://app.plex.tv/auth#?'

describe('createPlexAuthUrl', () => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL
  const originalClientId = process.env.PLEX_CLIENT_IDENTIFIER

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://plex.example.com'
    process.env.PLEX_CLIENT_IDENTIFIER = 'test-client-id'
  })

  afterAll(() => {
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
    process.env.PLEX_CLIENT_IDENTIFIER = originalClientId
  })

  it('matches the qs-encoded URL for a PIN with an invite code', async () => {
    await expect(createPlexAuthUrl(123, 'ABCD', 'INVITE1')).resolves.toBe(
      'https://app.plex.tv/auth#?clientID=test-client-id&code=ABCD' +
        '&forwardUrl=https%3A%2F%2Fplex.example.com%2Fauth%2Fcallback%2Fplex%3FplexPinId%3D123%26inviteCode%3DINVITE1' +
        '&context%5Bdevice%5D%5Bproduct%5D=Plex%20Manager'
    )
  })

  it('matches the qs-encoded URL for a PIN without an invite code', async () => {
    await expect(createPlexAuthUrl(123, 'ABCD')).resolves.toBe(
      'https://app.plex.tv/auth#?clientID=test-client-id&code=ABCD' +
        '&forwardUrl=https%3A%2F%2Fplex.example.com%2Fauth%2Fcallback%2Fplex%3FplexPinId%3D123' +
        '&context%5Bdevice%5D%5Bproduct%5D=Plex%20Manager'
    )
  })

  it('matches the qs encoding for a client identifier and base path with reserved characters', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://plex.example.com/manager'
    process.env.PLEX_CLIENT_IDENTIFIER = 'Plex Manager #1 (prod)/ü+&='

    await expect(createPlexAuthUrl(123, 'ABCD', 'INVITE1')).resolves.toBe(
      'https://app.plex.tv/auth#?clientID=Plex%20Manager%20%231%20%28prod%29%2F%C3%BC%2B%26%3D&code=ABCD' +
        '&forwardUrl=https%3A%2F%2Fplex.example.com%2Fmanager%2Fauth%2Fcallback%2Fplex%3FplexPinId%3D123%26inviteCode%3DINVITE1' +
        '&context%5Bdevice%5D%5Bproduct%5D=Plex%20Manager'
    )
  })

  it('encodes ~ as %7E and leaves * as is, unlike qs, with the same decoded values', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://plex.example.com/~admin'
    process.env.PLEX_CLIENT_IDENTIFIER = 'plex~manager*1'

    // qs wrote clientID=plex~manager%2A1 and ...example.com%2F~admin%2F...
    const url = await createPlexAuthUrl(123, 'ABCD')
    expect(url).toBe(
      'https://app.plex.tv/auth#?clientID=plex%7Emanager*1&code=ABCD' +
        '&forwardUrl=https%3A%2F%2Fplex.example.com%2F%7Eadmin%2Fauth%2Fcallback%2Fplex%3FplexPinId%3D123' +
        '&context%5Bdevice%5D%5Bproduct%5D=Plex%20Manager'
    )

    const params = new URLSearchParams(url.slice(AUTH_PREFIX.length))
    expect(params.get('clientID')).toBe('plex~manager*1')
    expect(params.get('forwardUrl')).toBe('https://plex.example.com/~admin/auth/callback/plex?plexPinId=123')
  })

  it('decodes back to the original parameters with decodeURIComponent', async () => {
    const url = await createPlexAuthUrl(123, 'ABCD', 'INVITE1')

    expect(url.startsWith(AUTH_PREFIX)).toBe(true)
    const params = Object.fromEntries(
      url
        .slice(AUTH_PREFIX.length)
        .split('&')
        .map((pair) => pair.split('=').map(decodeURIComponent))
    )
    expect(params).toEqual({
      clientID: 'test-client-id',
      code: 'ABCD',
      forwardUrl: 'https://plex.example.com/auth/callback/plex?plexPinId=123&inviteCode=INVITE1',
      'context[device][product]': 'Plex Manager',
    })
  })

  it('encodes an & in the invite code, so it cannot add a parameter to the callback (P4.3)', async () => {
    const url = await createPlexAuthUrl(123, 'ABCD', 'X&plexPinId=999')

    const forwardUrl = new URL(new URLSearchParams(url.slice(AUTH_PREFIX.length)).get('forwardUrl') ?? '')
    expect(forwardUrl.searchParams.getAll('plexPinId')).toEqual(['123'])
    expect(forwardUrl.searchParams.get('inviteCode')).toBe('X&plexPinId=999')
  })
})
