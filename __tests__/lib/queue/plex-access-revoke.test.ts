/**
 * Tests for the PLEX_ACCESS_REVOKE job (`processPlexAccessRevoke` and the
 * `evaluateRevokeGuard` predicate in lib/queue/jobs/stripe.ts) plus the webhook
 * wiring that enqueues revoke on deletion/unpaid.
 *
 * The safety guards are the highest-value tests in the whole feature: automatic
 * removal must NEVER unshare an admin, an exempt user, a non-Stripe-managed
 * user, or a PAST_DUE subscriber. Every protected case is asserted explicitly.
 *
 * The processor is invoked directly with a fixture `Job`; BullMQ/Redis are not
 * touched. The Plex unshare helper and Prisma are mocked.
 */

import type { Job } from 'bullmq'

import {
  processPlexAccessRevoke,
  evaluateRevokeGuard,
  processStripeWebhook,
  getStripeProcessor,
} from '@/lib/queue/jobs/stripe'
import { prisma } from '@/lib/prisma'
import { unshareUserFromPlexServer } from '@/lib/connections/plex-invitations'
import { getStripe } from '@/lib/stripe/client'
import { addJob } from '@/lib/queue/client'
import { SubscriptionStatus } from '@/lib/generated/prisma/client'
import { JOB_TYPES } from '@/lib/queue/types'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    plexServer: {
      findFirst: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    subscription: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    stripeEvent: {
      upsert: jest.fn(),
    },
    config: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('@/lib/connections/plex-invitations', () => ({
  inviteUserToPlexServer: jest.fn(),
  acceptPlexInvite: jest.fn(),
  unshareUserFromPlexServer: jest.fn(),
}))

jest.mock('@/lib/stripe/client', () => ({
  getStripe: jest.fn(),
}))

jest.mock('@/lib/queue/client', () => ({
  addJob: jest.fn(),
}))

jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}))

const PLEX_SERVER = {
  id: 'ps_1',
  url: 'https://plex.example.com:32400',
  token: 'server-token',
}

/** Build a minimal fixture Job for the revoke processor. */
function makeRevokeJob(userId: string): Job {
  return {
    id: 'job-revoke-1',
    data: { userId },
    attemptsMade: 0,
  } as unknown as Job
}

/**
 * Build a `prisma.user.findUnique` result with sensible eligible-for-removal
 * defaults, overridable per test.
 */
function makeUser(overrides: {
  isAdmin?: boolean
  isExempt?: boolean
  plexUserId?: string | null
  stripeSubscriptionId?: string | null
  status?: SubscriptionStatus
} = {}) {
  return {
    id: 'user-1',
    isAdmin: overrides.isAdmin ?? false,
    isExempt: overrides.isExempt ?? false,
    // Preserve an explicit `null` (as with `stripeSubscriptionId` below): the
    // "no linked Plex account" test relies on `plexUserId` actually being null,
    // so `?? 'plex-user-1'` would wrongly override it.
    plexUserId:
      overrides.plexUserId === undefined ? 'plex-user-1' : overrides.plexUserId,
    subscription: {
      stripeSubscriptionId:
        overrides.stripeSubscriptionId === undefined
          ? 'sub_1'
          : overrides.stripeSubscriptionId,
      status: overrides.status ?? SubscriptionStatus.CANCELED,
    },
  }
}

describe('evaluateRevokeGuard', () => {
  const eligible = {
    isAdmin: false,
    isExempt: false,
    stripeSubscriptionId: 'sub_1',
    status: SubscriptionStatus.CANCELED,
  }

  it('protects admins', () => {
    expect(evaluateRevokeGuard({ ...eligible, isAdmin: true })).toBe(
      'user is an admin'
    )
  })

  it('protects exempt users', () => {
    expect(evaluateRevokeGuard({ ...eligible, isExempt: true })).toBe(
      'user is exempt'
    )
  })

  it('protects non-Stripe-managed users', () => {
    expect(
      evaluateRevokeGuard({ ...eligible, stripeSubscriptionId: null })
    ).toBe('user is not Stripe-managed')
  })

  it('protects past-due subscribers', () => {
    expect(
      evaluateRevokeGuard({ ...eligible, status: SubscriptionStatus.PAST_DUE })
    ).toBe('subscription is past due')
  })

  it('prioritizes the admin guard over other protections', () => {
    // An admin who is also non-managed and past-due still reports the admin
    // reason: the highest-priority protection wins.
    expect(
      evaluateRevokeGuard({
        isAdmin: true,
        isExempt: true,
        stripeSubscriptionId: null,
        status: SubscriptionStatus.PAST_DUE,
      })
    ).toBe('user is an admin')
  })

  it('returns null for an eligible user', () => {
    expect(evaluateRevokeGuard(eligible)).toBeNull()
    expect(
      evaluateRevokeGuard({ ...eligible, status: SubscriptionStatus.UNPAID })
    ).toBeNull()
  })
})

describe('processPlexAccessRevoke', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(PLEX_SERVER)
    ;(prisma.subscription.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
    ;(unshareUserFromPlexServer as jest.Mock).mockResolvedValue({ success: true })
  })

  it('NEVER unshares an admin (skips with success)', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({ isAdmin: true })
    )

    const result = await processPlexAccessRevoke(makeRevokeJob('user-1'))

    expect(unshareUserFromPlexServer).not.toHaveBeenCalled()
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled()
    expect(result).toEqual({ userId: 'user-1', revoked: false })
  })

  it('NEVER unshares an exempt user (skips with success)', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({ isExempt: true })
    )

    const result = await processPlexAccessRevoke(makeRevokeJob('user-1'))

    expect(unshareUserFromPlexServer).not.toHaveBeenCalled()
    expect(result).toEqual({ userId: 'user-1', revoked: false })
  })

  it('NEVER unshares a non-Stripe-managed user (skips with success)', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({ stripeSubscriptionId: null })
    )

    const result = await processPlexAccessRevoke(makeRevokeJob('user-1'))

    expect(unshareUserFromPlexServer).not.toHaveBeenCalled()
    expect(result).toEqual({ userId: 'user-1', revoked: false })
  })

  it('NEVER unshares a PAST_DUE subscriber (skips with success)', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({ status: SubscriptionStatus.PAST_DUE })
    )

    const result = await processPlexAccessRevoke(makeRevokeJob('user-1'))

    expect(unshareUserFromPlexServer).not.toHaveBeenCalled()
    expect(result).toEqual({ userId: 'user-1', revoked: false })
  })

  it('does not even load the Plex server when a guard trips', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({ isAdmin: true })
    )

    await processPlexAccessRevoke(makeRevokeJob('user-1'))

    // Guards are evaluated first; no server lookup / no Plex call.
    expect(prisma.plexServer.findFirst).not.toHaveBeenCalled()
  })

  it('unshares an eligible (canceled, managed, non-exempt, non-admin) user', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({ plexUserId: 'plex-99' })
    )

    const result = await processPlexAccessRevoke(makeRevokeJob('user-1'))

    expect(unshareUserFromPlexServer).toHaveBeenCalledWith(
      { url: PLEX_SERVER.url, token: PLEX_SERVER.token },
      'plex-99'
    )
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { plexInviteStatus: 'revoked' },
    })
    expect(result).toEqual({ userId: 'user-1', revoked: true })
  })

  it('unshares an eligible UNPAID subscriber', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({ status: SubscriptionStatus.UNPAID })
    )

    const result = await processPlexAccessRevoke(makeRevokeJob('user-1'))

    expect(unshareUserFromPlexServer).toHaveBeenCalled()
    expect(result.revoked).toBe(true)
  })

  it('is idempotent when the user has no linked Plex account', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({ plexUserId: null })
    )

    const result = await processPlexAccessRevoke(makeRevokeJob('user-1'))

    expect(unshareUserFromPlexServer).not.toHaveBeenCalled()
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled()
    expect(result).toEqual({ userId: 'user-1', revoked: false })
  })

  it('succeeds without side effects when the user is not found', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(null)

    const result = await processPlexAccessRevoke(makeRevokeJob('missing'))

    expect(unshareUserFromPlexServer).not.toHaveBeenCalled()
    expect(result).toEqual({ userId: 'missing', revoked: false })
  })

  it('throws (to trigger retry) when the unshare fails transiently', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser())
    ;(unshareUserFromPlexServer as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Plex API unavailable',
    })

    await expect(
      processPlexAccessRevoke(makeRevokeJob('user-1'))
    ).rejects.toThrow('Plex API unavailable')
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled()
  })

  it('throws when no active Plex server is configured', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser())
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(null)

    await expect(
      processPlexAccessRevoke(makeRevokeJob('user-1'))
    ).rejects.toThrow('No active Plex server configured')
    expect(unshareUserFromPlexServer).not.toHaveBeenCalled()
  })
})

describe('getStripeProcessor (revoke)', () => {
  it('returns the processor for PLEX_ACCESS_REVOKE', () => {
    expect(getStripeProcessor(JOB_TYPES.PLEX_ACCESS_REVOKE)).toBe(
      processPlexAccessRevoke
    )
  })
})

// =============================================================================
// Webhook wiring: enqueue revoke on deletion/unpaid (respecting stripeEnabled)
// =============================================================================

const mockEventsRetrieve = jest.fn()

const mockStripe = {
  events: { retrieve: mockEventsRetrieve },
  subscriptions: { retrieve: jest.fn() },
}

function makeWebhookJob(eventId: string): Job {
  return {
    id: 'job-webhook-1',
    data: { eventId },
    attemptsMade: 0,
  } as unknown as Job
}

describe('processStripeWebhook revoke enqueue', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getStripe as jest.Mock).mockResolvedValue(mockStripe)
    ;(prisma.stripeEvent.upsert as jest.Mock).mockResolvedValue({})
    ;(prisma.subscription.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
    ;(prisma.subscription.findFirst as jest.Mock).mockResolvedValue({
      userId: 'user-1',
    })
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({
      stripeEnabled: true,
    })
    ;(addJob as jest.Mock).mockResolvedValue('job-revoke')
  })

  it('enqueues revoke on customer.subscription.deleted when enabled', async () => {
    mockEventsRetrieve.mockResolvedValue({
      id: 'evt_deleted',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1' } },
    })

    await processStripeWebhook(makeWebhookJob('evt_deleted'))

    // Status recorded CANCELED...
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { stripeSubscriptionId: 'sub_1' },
      data: {
        status: SubscriptionStatus.CANCELED,
        canceledAt: expect.any(Date),
      },
    })
    // ...and a revoke job is enqueued, keyed by user AND event id.
    expect(addJob).toHaveBeenCalledWith(
      JOB_TYPES.PLEX_ACCESS_REVOKE,
      { userId: 'user-1' },
      { jobId: `${JOB_TYPES.PLEX_ACCESS_REVOKE}:user-1:evt_deleted` }
    )
  })

  it('enqueues revoke on customer.subscription.updated with unpaid status', async () => {
    mockEventsRetrieve.mockResolvedValue({
      id: 'evt_unpaid',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          status: 'unpaid',
          cancel_at_period_end: false,
          current_period_end: 1704067200,
        },
      },
    })

    await processStripeWebhook(makeWebhookJob('evt_unpaid'))

    expect(addJob).toHaveBeenCalledWith(
      JOB_TYPES.PLEX_ACCESS_REVOKE,
      { userId: 'user-1' },
      { jobId: `${JOB_TYPES.PLEX_ACCESS_REVOKE}:user-1:evt_unpaid` }
    )
  })

  it('does NOT enqueue revoke on cancel_at_period_end updates (access retained)', async () => {
    mockEventsRetrieve.mockResolvedValue({
      id: 'evt_cape',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          status: 'active',
          cancel_at_period_end: true,
          current_period_end: 1704067200,
        },
      },
    })

    await processStripeWebhook(makeWebhookJob('evt_cape'))

    expect(addJob).not.toHaveBeenCalled()
  })

  it('does NOT enqueue revoke on past_due transitions (access retained)', async () => {
    mockEventsRetrieve.mockResolvedValue({
      id: 'evt_pastdue',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          status: 'past_due',
          cancel_at_period_end: false,
          current_period_end: 1704067200,
        },
      },
    })

    await processStripeWebhook(makeWebhookJob('evt_pastdue'))

    expect(addJob).not.toHaveBeenCalled()
  })

  it('does NOT enqueue revoke on invoice.payment_failed (maps to PAST_DUE)', async () => {
    mockEventsRetrieve.mockResolvedValue({
      id: 'evt_failed',
      type: 'invoice.payment_failed',
      data: { object: { id: 'in_1', subscription: 'sub_1' } },
    })

    await processStripeWebhook(makeWebhookJob('evt_failed'))

    expect(addJob).not.toHaveBeenCalled()
  })

  it('re-grants access when a subscription recovers to active (dunning)', async () => {
    mockEventsRetrieve.mockResolvedValue({
      id: 'evt_recovered',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          status: 'active',
          cancel_at_period_end: false,
          current_period_end: 1704067200,
        },
      },
    })

    await processStripeWebhook(makeWebhookJob('evt_recovered'))

    // No new checkout.session.completed fires on dunning recovery, so the update
    // handler re-enqueues the grant (idempotent) to restore access.
    expect(addJob).toHaveBeenCalledWith(
      JOB_TYPES.PLEX_ACCESS_GRANT,
      { userId: 'user-1' },
      { jobId: `${JOB_TYPES.PLEX_ACCESS_GRANT}:user-1:evt_recovered` }
    )
  })

  it('records status but skips revoke enqueue when Stripe is disabled', async () => {
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({
      stripeEnabled: false,
    })
    mockEventsRetrieve.mockResolvedValue({
      id: 'evt_deleted_disabled',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1' } },
    })

    await processStripeWebhook(makeWebhookJob('evt_deleted_disabled'))

    // Status still recorded...
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { stripeSubscriptionId: 'sub_1' } })
    )
    // ...but no revoke enqueued (FR-29).
    expect(addJob).not.toHaveBeenCalled()
  })

  it('skips revoke enqueue when no local subscription matches', async () => {
    ;(prisma.subscription.findFirst as jest.Mock).mockResolvedValue(null)
    mockEventsRetrieve.mockResolvedValue({
      id: 'evt_deleted_orphan',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_unknown' } },
    })

    await processStripeWebhook(makeWebhookJob('evt_deleted_orphan'))

    expect(addJob).not.toHaveBeenCalled()
  })

  it('enqueues revoke with an event-keyed jobId so retried deletions dedupe', async () => {
    mockEventsRetrieve.mockResolvedValue({
      id: 'evt_deleted_retry',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1' } },
    })

    await processStripeWebhook(makeWebhookJob('evt_deleted_retry'))
    await processStripeWebhook(makeWebhookJob('evt_deleted_retry'))

    // Same event id both times → identical jobId → BullMQ dedupes.
    expect(addJob).toHaveBeenCalledTimes(2)
    expect(addJob).toHaveBeenNthCalledWith(
      1,
      JOB_TYPES.PLEX_ACCESS_REVOKE,
      { userId: 'user-1' },
      { jobId: `${JOB_TYPES.PLEX_ACCESS_REVOKE}:user-1:evt_deleted_retry` }
    )
    expect(addJob).toHaveBeenNthCalledWith(
      2,
      JOB_TYPES.PLEX_ACCESS_REVOKE,
      { userId: 'user-1' },
      { jobId: `${JOB_TYPES.PLEX_ACCESS_REVOKE}:user-1:evt_deleted_retry` }
    )
  })
})
