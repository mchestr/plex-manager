/**
 * Disabled-state regression tests for the Stripe webhook processor
 * (`lib/queue/jobs/stripe.ts`).
 *
 * These lock down FR-29 for the REVOKE path specifically: while
 * `Config.stripeEnabled` is `false`, the webhook still records subscription
 * status but must enqueue NO Plex side effects. The existing
 * `stripe-processor.test.ts` covers the GRANT-skip case; this file covers the
 * `customer.subscription.deleted` and mapped-`UNPAID` revoke-skip cases, which
 * are the destructive side and therefore the highest-value disabled-state guard.
 *
 * This is a cross-cutting hardening pass (Step 12) — it exercises the real
 * processor without editing any feature file.
 */

import type { Job } from 'bullmq'

import { processStripeWebhook } from '@/lib/queue/jobs/stripe'
import { getStripe } from '@/lib/stripe/client'
import { prisma } from '@/lib/prisma'
import { addJob } from '@/lib/queue/client'
import { SubscriptionStatus } from '@/lib/generated/prisma/client'

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

const mockStripe = {
  events: { retrieve: mockEventsRetrieve },
  subscriptions: { retrieve: jest.fn() },
}

function makeJob(eventId: string): Job {
  return {
    id: 'job-disabled',
    data: { eventId },
    attemptsMade: 0,
  } as unknown as Job
}

describe('Stripe webhook processor — disabled-state (FR-29) revoke safety', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getStripe as jest.Mock).mockResolvedValue(mockStripe)
    ;(prisma.stripeEvent.upsert as jest.Mock).mockResolvedValue({})
    ;(prisma.subscription.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
    // Stripe is DISABLED for every test in this suite.
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({ stripeEnabled: false })
    // If the code (incorrectly) reached the revoke-enqueue lookup, this would
    // resolve a user — so a passing test proves the lookup was never reached.
    ;(prisma.subscription.findFirst as jest.Mock).mockResolvedValue({ userId: 'user-1' })
  })

  it('records CANCELED but enqueues NO revoke on customer.subscription.deleted when disabled', async () => {
    mockEventsRetrieve.mockResolvedValue({
      id: 'evt_deleted_disabled',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1' } },
    })

    await processStripeWebhook(makeJob('evt_deleted_disabled'))

    // Status is still recorded (webhook keeps the DB in sync)...
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { stripeSubscriptionId: 'sub_1' },
      data: {
        status: SubscriptionStatus.CANCELED,
        canceledAt: expect.any(Date),
      },
    })
    // ...but NO Plex revoke is enqueued and the user is never even looked up.
    expect(addJob).not.toHaveBeenCalled()
    expect(prisma.subscription.findFirst).not.toHaveBeenCalled()
  })

  it('records UNPAID but enqueues NO revoke on customer.subscription.updated when disabled', async () => {
    mockEventsRetrieve.mockResolvedValue({
      id: 'evt_unpaid_disabled',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          status: 'unpaid',
          cancel_at_period_end: false,
        },
      },
    })

    await processStripeWebhook(makeJob('evt_unpaid_disabled'))

    expect(prisma.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeSubscriptionId: 'sub_1' },
        data: expect.objectContaining({ status: SubscriptionStatus.UNPAID }),
      })
    )
    expect(addJob).not.toHaveBeenCalled()
    expect(prisma.subscription.findFirst).not.toHaveBeenCalled()
  })

  it('still records the event for idempotency while disabled', async () => {
    mockEventsRetrieve.mockResolvedValue({
      id: 'evt_deleted_disabled_2',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_2' } },
    })

    await processStripeWebhook(makeJob('evt_deleted_disabled_2'))

    expect(prisma.stripeEvent.upsert).toHaveBeenCalledWith({
      where: { id: 'evt_deleted_disabled_2' },
      create: { id: 'evt_deleted_disabled_2', type: 'customer.subscription.deleted' },
      update: {},
    })
  })
})
