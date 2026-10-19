/**
 * The `@example` blocks of the modules directly under `lib/`.
 */

import { authErrorKind } from '@/lib/auth-errors'

describe('JSDoc Documentation Examples', () => {
  it('authErrorKind reads the digest, never the message', () => {
    expect(authErrorKind(Object.assign(new Error('hidden'), { digest: 'PM_FORBIDDEN' }))).toBe('forbidden')
    expect(authErrorKind(new Error('UNAUTHENTICATED'))).toBeNull()
  })
})
