/**
 * Tests for lib/wrapped/generation-errors.ts (P0.9): the stored error format
 * and the fixed copy members and admins see, and (P0.12) the refusal codes.
 */

import {
  adminErrorHint,
  isGenerationRefusal,
  memberErrorCopy,
  readGenerationError,
  readStoredError,
  refusalCopy,
  toStoredError,
} from '../generation-errors'

const LEGACY_ROSTER_ERROR =
  'User not found in Tautulli. Plex User ID: 1, Email: me@example.com. Available users: alice (alice@example.com), bob (bob@example.com)'

describe('toStoredError', () => {
  it('writes the code as JSON', () => {
    expect(toStoredError('TAUTULLI_USER_NOT_FOUND')).toBe('{"code":"TAUTULLI_USER_NOT_FOUND"}')
    expect(toStoredError('GENERATION_FAILED')).toBe('{"code":"GENERATION_FAILED"}')
  })
})

describe('readStoredError', () => {
  it('reads a stored code back', () => {
    expect(readStoredError(toStoredError('TAUTULLI_USER_NOT_FOUND'))).toBe('TAUTULLI_USER_NOT_FOUND')
    expect(readStoredError('{"code":"GENERATION_FAILED"}')).toBe('GENERATION_FAILED')
  })

  it('reads legacy free text as GENERATION_FAILED', () => {
    expect(readStoredError(LEGACY_ROSTER_ERROR)).toBe('GENERATION_FAILED')
    expect(readStoredError('No active Tautulli server configured')).toBe('GENERATION_FAILED')
  })

  it('reads an empty value as GENERATION_FAILED', () => {
    expect(readStoredError(null)).toBe('GENERATION_FAILED')
    expect(readStoredError(undefined)).toBe('GENERATION_FAILED')
    expect(readStoredError('')).toBe('GENERATION_FAILED')
  })

  it('reads JSON that is not a known code as GENERATION_FAILED', () => {
    expect(readStoredError('{"code":"SOMETHING_ELSE"}')).toBe('GENERATION_FAILED')
    expect(readStoredError('["TAUTULLI_USER_NOT_FOUND"]')).toBe('GENERATION_FAILED')
    expect(readStoredError('42')).toBe('GENERATION_FAILED')
    expect(readStoredError('null')).toBe('GENERATION_FAILED')
  })
})

describe('readGenerationError (P2.17)', () => {
  it('reads a RewindGeneration error back as its code', () => {
    expect(readGenerationError({ code: 'TIMEOUT' })).toBe('TIMEOUT')
    expect(readGenerationError({ code: 'WORKER_LOST', requeuedAs: 'gen-2' })).toBe('WORKER_LOST')
  })

  it('reads a skip reason, null or anything else as GENERATION_FAILED', () => {
    expect(readGenerationError({ code: 'LOCKED' })).toBe('GENERATION_FAILED')
    expect(readGenerationError(null)).toBe('GENERATION_FAILED')
    expect(readGenerationError('TIMEOUT')).toBe('GENERATION_FAILED')
  })
})

describe('memberErrorCopy', () => {
  it.each(['TIMEOUT', 'UPSTREAM_ERROR', 'LLM_FAILED', 'NOT_CONFIGURED', 'WORKER_LOST', 'JOB_LOST'] as const)(
    'has fixed copy for the job code %s',
    (code) => {
      expect(memberErrorCopy(code)).toMatch(/\.$/)
    }
  )

  it('returns the fixed copy for a missing Tautulli account', () => {
    expect(memberErrorCopy('TAUTULLI_USER_NOT_FOUND')).toBe(
      "We couldn't find your account in Tautulli yet. Ask the server admin to refresh Tautulli's user list."
    )
  })

  it('never echoes stored text for legacy rows', () => {
    const copy = memberErrorCopy(readStoredError(LEGACY_ROSTER_ERROR))
    expect(copy).not.toContain('alice')
    expect(copy).not.toContain('@example.com')
    expect(copy).toBe('Something went wrong while generating your Wrapped. Please try again.')
  })
})

describe('adminErrorHint', () => {
  it('names the Plex user for a missing Tautulli account', () => {
    expect(adminErrorHint('TAUTULLI_USER_NOT_FOUND', '12345')).toBe(
      "Plex user 12345 is not in Tautulli's user list. Refresh users in Tautulli."
    )
  })

  it('has no hint for a generic failure', () => {
    expect(adminErrorHint('GENERATION_FAILED', '12345')).toBeNull()
  })

  it('explains an ineligible member by whether they have a Plex identity (P0.17)', () => {
    expect(adminErrorHint('REWIND_NOT_ELIGIBLE', '12345')).toBe(
      "Plex user 12345 is not in Tautulli's user list. Refresh users in Tautulli, then try again in 10 minutes."
    )
    expect(adminErrorHint('REWIND_NOT_ELIGIBLE', null)).toBe(
      'This member has no linked Plex account, so there is no watch history for a Rewind.'
    )
  })
})

describe('refusal codes (P0.12)', () => {
  it('tells refusals apart from stored failure codes', () => {
    for (const code of ['ALREADY_GENERATING', 'RATE_LIMITED', 'NOT_ENTITLED', 'REWIND_NOT_ELIGIBLE']) {
      expect(isGenerationRefusal(code)).toBe(true)
    }
    for (const code of ['TAUTULLI_USER_NOT_FOUND', 'GENERATION_FAILED', undefined]) {
      expect(isGenerationRefusal(code)).toBe(false)
    }
  })

  it('never reads a refusal back as a stored code', () => {
    expect(readStoredError('{"code":"ALREADY_GENERATING"}')).toBe('GENERATION_FAILED')
  })

  it('matches the documented examples', () => {
    expect(refusalCopy('ALREADY_GENERATING')).toBe('Your Rewind is already being made.')
    expect(refusalCopy('RATE_LIMITED', 540)).toBe('You can try again in 9 minutes.')
    expect(refusalCopy('RATE_LIMITED', 7200)).toBe('You can try again in 2 hours.')
    expect(refusalCopy('REWIND_NOT_ELIGIBLE')).toBe('Rewind needs Plex watch history. Jellyfin support is planned.')
  })

  it('rounds the wait up and never says zero', () => {
    expect(refusalCopy('RATE_LIMITED', 1)).toBe('You can try again in 1 minute.')
    expect(refusalCopy('RATE_LIMITED', 600)).toBe('You can try again in 10 minutes.')
    expect(refusalCopy('RATE_LIMITED', 601)).toBe('You can try again in 11 minutes.')
    expect(refusalCopy('RATE_LIMITED', 3540)).toBe('You can try again in 59 minutes.')
    expect(refusalCopy('RATE_LIMITED', 3600)).toBe('You can try again in 1 hour.')
    expect(refusalCopy('RATE_LIMITED', 86_399)).toBe('You can try again in 24 hours.')
  })

  it('explains a missing entitlement without naming the member', () => {
    expect(refusalCopy('NOT_ENTITLED')).toBe(
      'Rewind is part of an active membership. Renew your subscription to make yours.'
    )
  })
})
