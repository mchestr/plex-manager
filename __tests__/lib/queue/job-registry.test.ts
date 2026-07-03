/**
 * Tests for lib/queue/types.ts + lib/queue/jobs/index.ts - Stripe job type
 * registration and processor dispatch resolution.
 */

import {
  getJobProcessor,
  getRegisteredJobTypes,
  isRegisteredJobType,
} from '@/lib/queue/jobs'
import {
  processStripeWebhook,
  processPlexAccessGrant,
  processPlexAccessRevoke,
} from '@/lib/queue/jobs/stripe'
import { JOB_TYPES } from '@/lib/queue/types'

// The Stripe processor module imports the queue client (for enqueuing grants);
// stub it so dispatch tests don't touch Redis.
jest.mock('@/lib/queue/client', () => ({
  addJob: jest.fn(),
}))

// Avoid pulling in the real watchlist service graph during dispatch tests.
jest.mock('@/lib/queue/jobs/watchlist-sync', () => ({
  getWatchlistProcessor: jest.fn(() => null),
}))

jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}))

describe('JOB_TYPES registration', () => {
  it('registers the Stripe and Plex access job types', () => {
    expect(JOB_TYPES.STRIPE_WEBHOOK).toBe('stripe:webhook')
    expect(JOB_TYPES.PLEX_ACCESS_GRANT).toBe('plex:access:grant')
    expect(JOB_TYPES.PLEX_ACCESS_REVOKE).toBe('plex:access:revoke')
  })

  it('includes the new types in the registered job types list', () => {
    const registered = getRegisteredJobTypes()
    expect(registered).toContain(JOB_TYPES.STRIPE_WEBHOOK)
    expect(registered).toContain(JOB_TYPES.PLEX_ACCESS_GRANT)
    expect(registered).toContain(JOB_TYPES.PLEX_ACCESS_REVOKE)
  })

  it('recognizes the new types as registered', () => {
    expect(isRegisteredJobType(JOB_TYPES.STRIPE_WEBHOOK)).toBe(true)
    expect(isRegisteredJobType(JOB_TYPES.PLEX_ACCESS_GRANT)).toBe(true)
    expect(isRegisteredJobType('not:a:job')).toBe(false)
  })
})

describe('getJobProcessor dispatch', () => {
  it('resolves the Stripe processor for STRIPE_WEBHOOK', () => {
    expect(getJobProcessor(JOB_TYPES.STRIPE_WEBHOOK)).toBe(processStripeWebhook)
  })

  it('resolves the grant processor for PLEX_ACCESS_GRANT', () => {
    expect(getJobProcessor(JOB_TYPES.PLEX_ACCESS_GRANT)).toBe(
      processPlexAccessGrant
    )
  })

  it('returns null for unknown job types', () => {
    expect(getJobProcessor('unknown:type')).toBeNull()
  })

  it('resolves the revoke processor for PLEX_ACCESS_REVOKE', () => {
    expect(getJobProcessor(JOB_TYPES.PLEX_ACCESS_REVOKE)).toBe(
      processPlexAccessRevoke
    )
  })
})
