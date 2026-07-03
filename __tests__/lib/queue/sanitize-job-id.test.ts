/**
 * Tests for lib/queue/client.ts sanitizeJobId - guards against the BullMQ
 * "Custom Id cannot contain :" error.
 *
 * BullMQ uses `:` as its Redis key delimiter and rejects any custom job id that
 * contains one (unless it splits into exactly 3 segments). Our job-type
 * constants are themselves colon-delimited (e.g. `plex:access:grant`), so ids
 * built by interpolating a job type must be sanitized before reaching BullMQ.
 */

import { sanitizeJobId } from '@/lib/queue/job-id'
import { JOB_TYPES } from '@/lib/queue/types'

describe('sanitizeJobId', () => {
  it('replaces every colon with a hyphen', () => {
    expect(sanitizeJobId('plex:access:grant:user-123:evt_abc')).toBe(
      'plex-access-grant-user-123-evt_abc'
    )
  })

  it('produces ids free of BullMQ colon delimiters', () => {
    const ids = [
      `${JOB_TYPES.PLEX_ACCESS_GRANT}:user-123:evt_checkout`,
      `${JOB_TYPES.PLEX_ACCESS_REVOKE}:user-456:evt_deleted`,
      `${JOB_TYPES.WATCHLIST_SYNC_USER}:1720000000000`,
    ]

    for (const id of ids) {
      expect(sanitizeJobId(id)).not.toContain(':')
    }
  })

  it('is stable: the same input always maps to the same id (dedupe holds)', () => {
    const raw = `${JOB_TYPES.PLEX_ACCESS_GRANT}:user-123:evt_checkout`
    expect(sanitizeJobId(raw)).toBe(sanitizeJobId(raw))
  })

  it('leaves colon-free ids unchanged (Stripe event ids)', () => {
    expect(sanitizeJobId('evt_1abcDEF')).toBe('evt_1abcDEF')
  })
})
