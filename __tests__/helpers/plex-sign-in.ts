/**
 * Calls the Plex provider's `authorize` the way next-auth does after P4.8: no
 * credentials, and the browser's signed `pm-plex-pin` cookie in the request
 * headers. Test files mock `@/lib/connections/plex-pin` and make `readPin`
 * return the PIN's status, for example with {@link readyPin}.
 */

import { authOptions } from '@/lib/auth'
import { readPin, type PlexPinStatus } from '@/lib/connections/plex-pin'
import { pinCookie, type PlexPinCookie } from '@/lib/plex-pin-cookie'

export const TEST_PLEX_CLIENT_ID = '6f1c2a7e-3b4d-4c5e-8f90-1a2b3c4d5e6f'

type PlexAuthorize = (
  credentials: Record<string, string> | undefined,
  req: { headers: Record<string, string> }
) => Promise<unknown>

/** The headers of a sign-in request from the browser that started PIN `pin`. */
export function plexPinRequest(pin: Partial<PlexPinCookie> = {}): { headers: Record<string, string> } {
  const cookie = pinCookie({ pinId: 42, code: 'abcd1234', clientId: TEST_PLEX_CLIENT_ID, ...pin })
  return { headers: { cookie: `other=1; ${cookie.name}=${cookie.value}` } }
}

/** What `readPin` returns once plex.tv has issued `authToken`. */
export function readyPin(authToken: string): PlexPinStatus {
  return { status: 'ready', authToken }
}

/**
 * Runs the Plex `authorize` for a browser whose PIN plex.tv has authorised
 * with `authToken`. The calling test file must mock `@/lib/connections/plex-pin`.
 */
export function signInWithPlexToken(authToken: string): Promise<unknown> {
  jest.mocked(readPin).mockResolvedValue(readyPin(authToken))
  return getPlexAuthorize()(undefined, plexPinRequest())
}

/** The Plex provider's own `authorize` (next-auth keeps it at `options.authorize`). */
export function getPlexAuthorize(): PlexAuthorize {
  const provider = authOptions.providers.find(
    (p) => (p as { options?: { name?: string } }).options?.name === 'Plex'
  ) as { options?: { authorize?: unknown } } | undefined
  const authorize = provider?.options?.authorize
  if (typeof authorize !== 'function') {
    throw new Error('Plex authorize function not found on authOptions')
  }
  return authorize as PlexAuthorize
}
