/**
 * @jest-environment node
 */

/**
 * Disabled-state regression tests for the Stripe webhook processor
 * (`lib/queue/jobs/stripe.ts`).
 *
 * These lock down FR-29 for the REVOKE path specifically: while
 * `Config.stripeEnabled` is `false`, the webhook still records subscription
 * status but must enqueue NO Plex side effects. The existing
 * `stripe-processor.test.ts` covers the GRANT-skip case; this file covers the
 * `customer.subscription.deleted` and live-`unpaid` revoke-skip cases, which
 * are the destructive side and therefore the highest-value disabled-state guard.
 */

import type { Job } from 'bullmq'

import { processStripeWebhook } from '@/lib/queue/jobs/stripe'
import { getStripe } from '@/lib/stripe/client'
import { addJob } from '@/lib/queue/client'
import { setJellyfinAccountDisabled } from '@/lib/connections/jellyfin-users'
import { SubscriptionStatus } from '@/lib/generated/prisma/client'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { buildConfig } from '@/__tests__/helpers/factories'
import {
  createFakeStripe,
  emptyStripeStore,
  installStripeStore,
  stripeEvent,
  stripeSubscription,
  subscriptionRow,
  type FakeStripe,
  type StripeStore,
} from '@/__tests__/helpers/stripe-fakes'

jest.mock('@/lib/stripe/client', () => ({
  getStripe: jest.fn(),
}))

jest.mock('@/lib/queue/client', () => ({
  addJob: jest.fn(),
}))

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

jest.mock('@/lib/connections/jellyfin-users', () => ({
  ...jest.requireActual('@/lib/connections/jellyfin-users'),
  setJellyfinAccountDisabled: jest.fn(),
}))

jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}))

function makeJob(eventId: string): Job {
  return {
    id: 'job-disabled',
    data: { eventId },
    attemptsMade: 0,
    opts: { attempts: 3 },
  } as unknown as Job
}

let stripe: FakeStripe
let store: StripeStore

async function deliver(event: ReturnType<typeof stripeEvent>) {
  stripe.events.set(event.id, event)
  return processStripeWebhook(makeJob(event.id))
}

describe('Stripe webhook processor — disabled-state (FR-29) revoke safety', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockReset(prismaMock)
    stripe = createFakeStripe()
    store = emptyStripeStore([subscriptionRow({ status: SubscriptionStatus.ACTIVE })])
    installStripeStore(prismaMock, store)
    ;(getStripe as jest.Mock).mockResolvedValue(stripe.client)
    // Stripe is DISABLED for every test in this suite.
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ stripeEnabled: false }))
  })

  it('records CANCELED but enqueues NO revoke on customer.subscription.deleted when disabled', async () => {
    stripe.subscriptions.set('sub_1', stripeSubscription({ status: 'canceled' }))

    await deliver(stripeEvent('evt_deleted_disabled', 'customer.subscription.deleted', { id: 'sub_1' }, 1_760_000_000))

    // Status is still recorded (webhook keeps the DB in sync)...
    expect(store.subscriptions[0]).toMatchObject({
      status: SubscriptionStatus.CANCELED,
      canceledAt: expect.any(Date),
    })
    // ...but NO Plex revoke is enqueued.
    expect(addJob).not.toHaveBeenCalled()
  })

  it('records UNPAID but enqueues NO revoke on customer.subscription.updated when disabled', async () => {
    stripe.subscriptions.set('sub_1', stripeSubscription({ status: 'unpaid' }))

    await deliver(stripeEvent('evt_unpaid_disabled', 'customer.subscription.updated', { id: 'sub_1' }, 1_760_000_000))

    expect(store.subscriptions[0].status).toBe(SubscriptionStatus.UNPAID)
    expect(addJob).not.toHaveBeenCalled()
  })

  it('neither disables nor enables a Jellyfin member while disabled (P11.11)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', plexUserId: null, jellyfinUserId: 'jf-1' } as never)
    stripe.subscriptions.set('sub_1', stripeSubscription({ status: 'canceled' }))
    await deliver(stripeEvent('evt_jf_deleted', 'customer.subscription.deleted', { id: 'sub_1' }, 1_760_000_000))

    stripe.subscriptions.set('sub_1', stripeSubscription({ status: 'active' }))
    await deliver(stripeEvent('evt_jf_active', 'customer.subscription.updated', { id: 'sub_1' }, 1_760_000_100))

    expect(store.subscriptions[0].status).toBe(SubscriptionStatus.ACTIVE)
    expect(addJob).not.toHaveBeenCalled()
    expect(setJellyfinAccountDisabled).not.toHaveBeenCalled()
  })

  it('still records the event as processed while disabled', async () => {
    stripe.subscriptions.set('sub_1', stripeSubscription({ status: 'canceled' }))

    await deliver(stripeEvent('evt_deleted_disabled_2', 'customer.subscription.deleted', { id: 'sub_1' }, 1_760_000_000))

    expect(store.events.get('evt_deleted_disabled_2')).toMatchObject({
      type: 'customer.subscription.deleted',
      processedAt: expect.any(Date),
    })
  })
})
