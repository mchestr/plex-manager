/**
 * Tests for lib/queue/jobs/stripe.ts - the STRIPE_WEBHOOK job processor.
 *
 * Establishes the BullMQ processor-as-plain-function test pattern: the
 * processor is invoked directly with a fixture `Job`, and BullMQ/Redis are not
 * touched. `stripe.events.retrieve` and Prisma are mocked; each event type's DB
 * mutation is asserted and the absence of Plex effects is verified.
 */

import type { Job } from 'bullmq'

import {
  processStripeWebhook,
  processPlexAccessGrant,
  getStripeProcessor,
} from '@/lib/queue/jobs/stripe'
import { getStripe } from '@/lib/stripe/client'
import { prisma } from '@/lib/prisma'
import { addJob } from '@/lib/queue/client'
import { SubscriptionStatus } from '@/lib/generated/prisma/client'
import { JOB_TYPES } from '@/lib/queue/types'

jest.mock('@/lib/stripe/client', () => ({
  getStripe: jest.fn(),
}))

jest.mock('@/lib/queue/client', () => ({
  addJob: jest.fn(),
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    subscription: {
      upsert: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    },
    stripeEvent: {
      upsert: jest.fn(),
    },
    config: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}))

const mockEventsRetrieve = jest.fn()
const mockSubscriptionsRetrieve = jest.fn()

const mockStripe = {
  events: { retrieve: mockEventsRetrieve },
  subscriptions: { retrieve: mockSubscriptionsRetrieve },
}

/** Build a minimal fixture Job for the processor. */
function makeJob(eventId: string): Job {
  return {
    id: 'job-1',
    data: { eventId },
    attemptsMade: 0,
  } as unknown as Job
}

// 2024-01-01T00:00:00Z in epoch seconds.
const PERIOD_END_EPOCH = 1704067200
const PERIOD_END_DATE = new Date(PERIOD_END_EPOCH * 1000)

describe('processStripeWebhook', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getStripe as jest.Mock).mockResolvedValue(mockStripe)
    ;(prisma.stripeEvent.upsert as jest.Mock).mockResolvedValue({})
    ;(prisma.subscription.upsert as jest.Mock).mockResolvedValue({})
    ;(prisma.subscription.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
    ;(prisma.subscription.findFirst as jest.Mock).mockResolvedValue({ userId: 'user-1' })
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({ stripeEnabled: true })
    ;(addJob as jest.Mock).mockResolvedValue('job-grant')
  })

  it('throws when Stripe is not configured', async () => {
    ;(getStripe as jest.Mock).mockResolvedValue(null)
    await expect(processStripeWebhook(makeJob('evt_1'))).rejects.toThrow(
      'Stripe is not configured'
    )
  })

  it('records the event for idempotency and performs no Plex effects', async () => {
    mockEventsRetrieve.mockResolvedValue({
      id: 'evt_unhandled',
      type: 'customer.updated',
      data: { object: {} },
    })

    const result = await processStripeWebhook(makeJob('evt_unhandled'))

    expect(prisma.stripeEvent.upsert).toHaveBeenCalledWith({
      where: { id: 'evt_unhandled' },
      create: { id: 'evt_unhandled', type: 'customer.updated' },
      update: {},
    })
    // Unhandled event type is ignored gracefully.
    expect(result.handled).toBe(false)
    expect(prisma.subscription.upsert).not.toHaveBeenCalled()
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled()
    // No Plex grant/revoke enqueue is wired in this task.
  })

  it('activates a subscription on checkout.session.completed', async () => {
    mockEventsRetrieve.mockResolvedValue({
      id: 'evt_checkout',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_1',
          client_reference_id: 'user-123',
          customer: 'cus_1',
          subscription: 'sub_1',
        },
      },
    })
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_1',
      current_period_end: PERIOD_END_EPOCH,
      items: { data: [{ price: { id: 'price_1' } }] },
    })

    const result = await processStripeWebhook(makeJob('evt_checkout'))

    expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith('sub_1')
    expect(prisma.subscription.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-123' },
      create: {
        userId: 'user-123',
        status: SubscriptionStatus.ACTIVE,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        priceId: 'price_1',
        currentPeriodEnd: PERIOD_END_DATE,
      },
      update: {
        status: SubscriptionStatus.ACTIVE,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        priceId: 'price_1',
        currentPeriodEnd: PERIOD_END_DATE,
        cancelAtPeriodEnd: false,
        canceledAt: null,
      },
    })
    // Stripe is enabled: a Plex access grant is enqueued with a jobId keyed by
    // user AND event id — redelivery of the same event dedupes, but a later
    // grant (e.g. resubscribe) gets a distinct job.
    expect(addJob).toHaveBeenCalledWith(
      JOB_TYPES.PLEX_ACCESS_GRANT,
      { userId: 'user-123' },
      { jobId: `${JOB_TYPES.PLEX_ACCESS_GRANT}:user-123:evt_checkout` }
    )
    expect(result.handled).toBe(true)
  })

  it('records the subscription but skips the grant enqueue when Stripe is disabled', async () => {
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({ stripeEnabled: false })
    mockEventsRetrieve.mockResolvedValue({
      id: 'evt_checkout_disabled',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_d',
          client_reference_id: 'user-disabled',
          customer: 'cus_d',
          subscription: null,
        },
      },
    })

    const result = await processStripeWebhook(makeJob('evt_checkout_disabled'))

    // Status is still recorded...
    expect(prisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-disabled' } })
    )
    // ...but no Plex grant job is enqueued (FR-29).
    expect(addJob).not.toHaveBeenCalled()
    expect(result.handled).toBe(true)
  })

  it('enqueues the grant with an event-keyed jobId so retried events dedupe', async () => {
    mockEventsRetrieve.mockResolvedValue({
      id: 'evt_checkout_retry',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_r',
          client_reference_id: 'user-retry',
          customer: 'cus_r',
          subscription: null,
        },
      },
    })

    await processStripeWebhook(makeJob('evt_checkout_retry'))
    await processStripeWebhook(makeJob('evt_checkout_retry'))

    // Both deliveries carry the same event id, so the jobId is identical and
    // BullMQ collapses them into a single grant.
    expect(addJob).toHaveBeenCalledTimes(2)
    expect(addJob).toHaveBeenNthCalledWith(
      1,
      JOB_TYPES.PLEX_ACCESS_GRANT,
      { userId: 'user-retry' },
      { jobId: `${JOB_TYPES.PLEX_ACCESS_GRANT}:user-retry:evt_checkout_retry` }
    )
    expect(addJob).toHaveBeenNthCalledWith(
      2,
      JOB_TYPES.PLEX_ACCESS_GRANT,
      { userId: 'user-retry' },
      { jobId: `${JOB_TYPES.PLEX_ACCESS_GRANT}:user-retry:evt_checkout_retry` }
    )
  })

  it('resolves the app user from metadata.appUserId when client_reference_id is absent', async () => {
    mockEventsRetrieve.mockResolvedValue({
      id: 'evt_checkout2',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_2',
          client_reference_id: null,
          metadata: { appUserId: 'user-meta' },
          customer: 'cus_2',
          subscription: null,
        },
      },
    })

    await processStripeWebhook(makeJob('evt_checkout2'))

    expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled()
    expect(prisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-meta' },
      })
    )
  })

  it('skips upsert when no app user id can be resolved', async () => {
    mockEventsRetrieve.mockResolvedValue({
      id: 'evt_checkout3',
      type: 'checkout.session.completed',
      data: {
        object: { id: 'cs_3', client_reference_id: null, customer: 'cus_3' },
      },
    })

    const result = await processStripeWebhook(makeJob('evt_checkout3'))

    expect(prisma.subscription.upsert).not.toHaveBeenCalled()
    expect(result.handled).toBe(true)
  })

  it('syncs status, period, and cancelAtPeriodEnd on customer.subscription.updated', async () => {
    mockEventsRetrieve.mockResolvedValue({
      id: 'evt_updated',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          status: 'active',
          cancel_at_period_end: true,
          current_period_end: PERIOD_END_EPOCH,
        },
      },
    })

    await processStripeWebhook(makeJob('evt_updated'))

    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { stripeSubscriptionId: 'sub_1' },
      data: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: PERIOD_END_DATE,
        cancelAtPeriodEnd: true,
      },
    })
  })

  it('marks the subscription CANCELED on customer.subscription.deleted', async () => {
    mockEventsRetrieve.mockResolvedValue({
      id: 'evt_deleted',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1' } },
    })

    await processStripeWebhook(makeJob('evt_deleted'))

    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { stripeSubscriptionId: 'sub_1' },
      data: {
        status: SubscriptionStatus.CANCELED,
        canceledAt: expect.any(Date),
      },
    })
  })

  it('marks the subscription PAST_DUE on invoice.payment_failed', async () => {
    mockEventsRetrieve.mockResolvedValue({
      id: 'evt_failed',
      type: 'invoice.payment_failed',
      data: { object: { id: 'in_1', subscription: 'sub_1' } },
    })

    await processStripeWebhook(makeJob('evt_failed'))

    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { stripeSubscriptionId: 'sub_1' },
      data: { status: SubscriptionStatus.PAST_DUE },
    })
  })

  it('skips payment_failed handling when no subscription id is present', async () => {
    mockEventsRetrieve.mockResolvedValue({
      id: 'evt_failed2',
      type: 'invoice.payment_failed',
      data: { object: { id: 'in_2' } },
    })

    await processStripeWebhook(makeJob('evt_failed2'))

    expect(prisma.subscription.updateMany).not.toHaveBeenCalled()
  })
})

describe('getStripeProcessor', () => {
  it('returns the processor for STRIPE_WEBHOOK', () => {
    expect(getStripeProcessor(JOB_TYPES.STRIPE_WEBHOOK)).toBe(processStripeWebhook)
  })

  it('returns the processor for PLEX_ACCESS_GRANT', () => {
    expect(getStripeProcessor(JOB_TYPES.PLEX_ACCESS_GRANT)).toBe(
      processPlexAccessGrant
    )
  })

  it('returns null for non-Stripe job types', () => {
    expect(getStripeProcessor(JOB_TYPES.WATCHLIST_SYNC_USER)).toBeNull()
    expect(getStripeProcessor('unknown:type')).toBeNull()
  })
})
