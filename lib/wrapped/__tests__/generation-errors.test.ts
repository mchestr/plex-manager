/**
 * Tests for lib/wrapped/generation-errors.ts (P0.9): the stored error format
 * and the fixed copy members and admins see.
 */

import {
  adminErrorHint,
  memberErrorCopy,
  readStoredError,
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

describe('memberErrorCopy', () => {
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
})
