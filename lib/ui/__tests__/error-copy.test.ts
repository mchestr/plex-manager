/**
 * lib/ui/error-copy.ts (P3.8, SEC-20): every code has member copy, and
 * anything else gets the generic copy without echoing the input.
 */

import { errorCopy } from '../error-copy'
import { ErrorCode } from '@/lib/security/error-handler'

const GENERIC_TITLE = 'Something went wrong on our side'

const ACTION_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'VALIDATION',
  'NOT_FOUND',
  'RATE_LIMITED',
  'NOT_ENTITLED',
  'CONFLICT',
  'UPSTREAM_UNAVAILABLE',
  'INVITE_INVALID',
  'INVITE_WRONG_SERVICE',
  'INTERNAL',
]
const REWIND_CODES = [
  'TAUTULLI_USER_NOT_FOUND',
  'GENERATION_FAILED',
  'TIMEOUT',
  'UPSTREAM_ERROR',
  'LLM_FAILED',
  'NOT_CONFIGURED',
  'WORKER_LOST',
  'JOB_LOST',
]
const ALL_CODES = [...Object.values(ErrorCode), ...ACTION_CODES, ...REWIND_CODES]

describe('errorCopy', () => {
  it.each(ALL_CODES)('has member and admin copy for %s', (code) => {
    for (const audience of ['member', 'admin'] as const) {
      const copy = errorCopy(code, { audience })
      expect(copy.title).not.toBe('')
      expect(copy.description).toMatch(/\.$/)
    }
  })

  it('gives specific copy to the codes that are not internal errors', () => {
    const specific = ALL_CODES.filter((code) => !['INTERNAL', 'INTERNAL_ERROR'].includes(code))
    for (const code of specific) {
      expect(errorCopy(code, { audience: 'member' }).title).not.toBe(GENERIC_TITLE)
    }
  })

  it('gives admins more to act on where a code has admin copy', () => {
    const member = errorCopy('UPSTREAM_UNAVAILABLE', { audience: 'member' })
    const admin = errorCopy('UPSTREAM_UNAVAILABLE', { audience: 'admin' })
    expect(admin.description).not.toBe(member.description)
    expect(admin.description).toContain('Settings')
  })

  it('keeps the stored Rewind copy unchanged', () => {
    expect(errorCopy('TAUTULLI_USER_NOT_FOUND', { audience: 'member' }).description).toBe(
      "We couldn't find your account in Tautulli yet. Ask the server admin to refresh Tautulli's user list."
    )
  })

  it.each([
    ["Can't reach database server at db:5432"],
    ['ECONNREFUSED 10.0.0.4:32400'],
    ['abc123digest'],
    ['toString'],
    ['__proto__'],
    ['constructor'],
    [''],
  ])('returns the generic copy for %j and never echoes it', (input) => {
    for (const audience of ['member', 'admin'] as const) {
      const copy = errorCopy(input, { audience })
      expect(copy.title).toBe(GENERIC_TITLE)
      if (input) expect(JSON.stringify(copy)).not.toContain(input)
    }
  })

  it.each([[undefined], [null], [42], [{ code: 'TIMEOUT' }], [new Error('TIMEOUT')]])(
    'returns the generic copy for the non-string %p',
    (input) => {
      expect(errorCopy(input, { audience: 'member' }).title).toBe(GENERIC_TITLE)
    }
  )
})
