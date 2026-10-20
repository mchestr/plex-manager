/**
 * @jest-environment node
 *
 * The `@example` blocks of the modules directly under `lib/`.
 */

import { authErrorKind } from '@/lib/auth-errors'
import { monogramFor, rewindName, serverName } from '@/lib/brand'

jest.mock('@/lib/settings/app-settings', () => ({
  getAppSettings: jest.fn(async () => ({ timeZone: 'UTC', locale: 'en-US', serverName: 'Northfield Plex' })),
}))

describe('JSDoc Documentation Examples', () => {
  it('authErrorKind reads the digest, never the message', () => {
    expect(authErrorKind(Object.assign(new Error('hidden'), { digest: 'PM_FORBIDDEN' }))).toBe('forbidden')
    expect(authErrorKind(new Error('UNAUTHENTICATED'))).toBeNull()
  })

  it('brand', async () => {
    await expect(serverName()).resolves.toBe('Northfield Plex')
    await expect(rewindName(2026)).resolves.toBe('Northfield Plex Rewind 2026')
    expect(monogramFor('émile')).toBe('É')
    expect(monogramFor('東京サーバー')).toBeNull()
  })
})
