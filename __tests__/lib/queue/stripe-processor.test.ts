/**
 * @jest-environment node
 */

/**
 * Tests for lib/queue/jobs/stripe.ts - the STRIPE_WEBHOOK job processor.
 *
 * The processor is invoked directly with a fixture `Job`; BullMQ/Redis are not
 * touched. A fake Stripe (`__tests__/helpers/stripe-fakes.ts`) returns event
 * snapshots and live subscriptions, and an in-memory store stands behind the
 * `Subscription` and `StripeEvent` delegates, so the tests follow the row
 * through several events: reordered, resent and failed ones (P4.10).
 */

import type { Job } from 'bullmq'

import {
  processStripeWebhook,
  processAccessGrant,
  getStripeProcessor,
} from '@/lib/queue/jobs/stripe'
import { getStripe } from '@/lib/stripe/client'
import { addJob } from '@/lib/queue/client'
import { logAuditEvent } from '@/lib/security/audit-log'
import { SubscriptionStatus } from '@/lib/generated/prisma/client'
import { JOB_TYPES } from '@/lib/queue/types'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { buildConfig } from '@/__tests__/helpers/factories'
import {
  checkoutSession,
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

jest.mock('@/lib/security/audit-log', () => ({
  AuditEventType: { STRIPE_EVENT_FAILED: 'STRIPE_EVENT_FAILED', SESSIONS_REVOKED: 'SESSIONS_REVOKED' },
  logAuditEvent: jest.fn(),
}))

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}))

/** A fixture Job; `attemptsMade` counts earlier failed attempts, of three. */
function makeJob(eventId: string, attemptsMade = 0): Job {
  return {
    id: eventId,
    data: { eventId },
    attemptsMade,
    opts: { attempts: 3 },
  } as unknown as Job
}

const T0 = 1_760_000_000
const PERIOD_END_EPOCH = 1704067200

let stripe: FakeStripe
let store: StripeStore

function grants() {
  return (addJob as jest.Mock).mock.calls.filter(([type]) => type === JOB_TYPES.PLEX_ACCESS_GRANT)
}

function revokes() {
  return (addJob as jest.Mock).mock.calls.filter(([type]) => type === JOB_TYPES.PLEX_ACCESS_REVOKE)
}

/** Registers an event with the fake Stripe and runs it through the processor. */
async function deliver(event: ReturnType<typeof stripeEvent>, attemptsMade = 0) {
  stripe.events.set(event.id, event)
  return processStripeWebhook(makeJob(event.id, attemptsMade))
}

beforeEach(() => {
  jest.clearAllMocks()
  mockReset(prismaMock)
  stripe = createFakeStripe()
  store = emptyStripeStore()
  installStripeStore(prismaMock, store)
  ;(getStripe as jest.Mock).mockResolvedValue(stripe.client)
  ;(addJob as jest.Mock).mockResolvedValue('job')
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ stripeEnabled: true, stripePriceIds: ['price_1'] }))
})

describe('processStripeWebhook: recording (SEC-40)', () => {
  it('throws when Stripe is not configured', async () => {
    ;(getStripe as jest.Mock).mockResolvedValue(null)
    await expect(processStripeWebhook(makeJob('evt_1'))).rejects.toThrow('Stripe is not configured')
  })

  it('leaves processedAt null on a fresh upsert, and sets it only after the handler succeeds', async () => {
    store.subscriptions.push(subscriptionRow({ status: SubscriptionStatus.ACTIVE }))
    stripe.subscriptions.set('sub_1', stripeSubscription({ status: 'past_due' }))
    let processedDuringHandler: Date | null | undefined
    ;(stripe.client.subscriptions.retrieve as jest.Mock).mockImplementationOnce(async () => {
      processedDuringHandler = store.events.get('evt_upd')?.processedAt
      return stripe.subscriptions.get('sub_1')
    })

    await deliver(stripeEvent('evt_upd', 'customer.subscription.updated', { id: 'sub_1' }, T0))

    expect(store.events.has('evt_upd')).toBe(true)
    expect(processedDuringHandler).toBeNull()
    expect(store.events.get('evt_upd')).toMatchObject({ attempts: 1, lastError: null, processedAt: expect.any(Date) })
  })

  it('a failing handler leaves processedAt null and stores a code, not the message', async () => {
    store.subscriptions.push(subscriptionRow())
    stripe.failSubscriptionReads(new Error('connect ECONNREFUSED 10.0.0.5:443'))

    await expect(
      deliver(stripeEvent('evt_fail', 'customer.subscription.updated', { id: 'sub_1' }, T0))
    ).rejects.toThrow('ECONNREFUSED')

    const record = store.events.get('evt_fail')
    expect(record?.processedAt).toBeNull()
    expect(record?.lastError).toBe('HANDLER_FAILED')
    // Not the last attempt yet: no failure audit.
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it('stores a Stripe error type as the code', async () => {
    store.subscriptions.push(subscriptionRow())
    stripe.failSubscriptionReads(Object.assign(new Error('Stripe is down'), { type: 'StripeConnectionError' }))

    await expect(deliver(stripeEvent('evt_s', 'customer.subscription.updated', { id: 'sub_1' }, T0))).rejects.toThrow()

    expect(store.events.get('evt_s')?.lastError).toBe('StripeConnectionError')
  })

  it('audits STRIPE_EVENT_FAILED after the last attempt', async () => {
    store.subscriptions.push(subscriptionRow())
    stripe.failSubscriptionReads(new Error('boom'))

    await expect(
      deliver(stripeEvent('evt_last', 'customer.subscription.updated', { id: 'sub_1' }, T0), 2)
    ).rejects.toThrow('boom')

    expect(logAuditEvent).toHaveBeenCalledWith('STRIPE_EVENT_FAILED', 'system', {
      eventId: 'evt_last',
      code: 'HANDLER_FAILED',
    })
  })

  it('a retry after a failure applies the event and clears lastError', async () => {
    store.subscriptions.push(subscriptionRow({ status: SubscriptionStatus.ACTIVE }))
    stripe.subscriptions.set('sub_1', stripeSubscription({ status: 'unpaid' }))
    const event = stripeEvent('evt_retry', 'customer.subscription.updated', { id: 'sub_1' }, T0)
    stripe.failSubscriptionReads(new Error('boom'))
    await expect(deliver(event)).rejects.toThrow()

    stripe.failSubscriptionReads(null)
    await deliver(event, 1)

    expect(store.events.get('evt_retry')).toMatchObject({ attempts: 2, lastError: null, processedAt: expect.any(Date) })
    expect(store.subscriptions[0].status).toBe(SubscriptionStatus.UNPAID)
    expect(revokes()).toHaveLength(1)
  })

  it('records an unhandled event type as processed, with no subscription write', async () => {
    const result = await deliver(stripeEvent('evt_unhandled', 'customer.updated', {}, T0))

    expect(result.handled).toBe(false)
    expect(store.events.get('evt_unhandled')?.processedAt).toEqual(expect.any(Date))
    expect(prismaMock.subscription.updateMany).not.toHaveBeenCalled()
  })

  it('the same event twice produces one grant', async () => {
    stripe.subscriptions.set('sub_1', stripeSubscription())
    const event = stripeEvent('evt_checkout', 'checkout.session.completed', checkoutSession(), T0)

    await deliver(event)
    await deliver(event)

    expect(grants()).toHaveLength(1)
    expect(store.events.get('evt_checkout')?.attempts).toBe(2)
  })
})

describe('processStripeWebhook: checkout (SEC-41)', () => {
  beforeEach(() => {
    stripe.subscriptions.set('sub_1', stripeSubscription({ periodEnd: PERIOD_END_EPOCH }))
  })

  it('creates an ACTIVE row from the live subscription and enqueues the grant', async () => {
    const result = await deliver(stripeEvent('evt_checkout', 'checkout.session.completed', checkoutSession(), T0))

    expect(stripe.client.subscriptions.retrieve).toHaveBeenCalledWith('sub_1')
    expect(store.subscriptions).toEqual([
      expect.objectContaining({
        userId: 'user-1',
        status: SubscriptionStatus.ACTIVE,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        priceId: 'price_1',
        currentPeriodEnd: new Date(PERIOD_END_EPOCH * 1000),
        stripeEventAt: new Date(T0 * 1000),
      }),
    ])
    expect(addJob).toHaveBeenCalledWith(
      JOB_TYPES.PLEX_ACCESS_GRANT,
      { userId: 'user-1' },
      { jobId: `${JOB_TYPES.PLEX_ACCESS_GRANT}:user-1:evt_checkout` }
    )
    expect(result.handled).toBe(true)
  })

  it('reactivates a CANCELED row and grants again', async () => {
    store.subscriptions.push(
      subscriptionRow({ status: SubscriptionStatus.CANCELED, stripeSubscriptionId: 'sub_old', stripeEventAt: new Date((T0 - 100) * 1000) })
    )

    await deliver(stripeEvent('evt_resub', 'checkout.session.completed', checkoutSession(), T0))

    expect(store.subscriptions[0]).toMatchObject({ status: SubscriptionStatus.ACTIVE, stripeSubscriptionId: 'sub_1', canceledAt: null })
    expect(grants()).toHaveLength(1)
  })

  it('handles async_payment_succeeded the same way, and async_payment_failed as a no-op', async () => {
    await deliver(stripeEvent('evt_async_fail', 'checkout.session.async_payment_failed', checkoutSession({ payment_status: 'unpaid' }), T0))
    expect(store.subscriptions).toHaveLength(0)

    await deliver(stripeEvent('evt_async_ok', 'checkout.session.async_payment_succeeded', checkoutSession(), T0 + 1))
    expect(store.subscriptions[0]?.status).toBe(SubscriptionStatus.ACTIVE)
    expect(grants()).toHaveLength(1)
  })

  it.each([
    ['payment mode', checkoutSession({ mode: 'payment' })],
    ['an unpaid session', checkoutSession({ payment_status: 'unpaid' })],
    ['no client_reference_id', checkoutSession({ client_reference_id: null })],
  ])('ignores %s: no row, no grant', async (_label, session) => {
    await deliver(stripeEvent('evt_bad', 'checkout.session.completed', session, T0))

    expect(store.subscriptions).toHaveLength(0)
    expect(addJob).not.toHaveBeenCalled()
    expect(store.events.get('evt_bad')?.processedAt).toEqual(expect.any(Date))
  })

  it('ignores a subscription whose metadata names another user', async () => {
    stripe.subscriptions.set('sub_1', stripeSubscription({ appUserId: 'someone-else' }))

    await deliver(stripeEvent('evt_meta', 'checkout.session.completed', checkoutSession(), T0))

    expect(store.subscriptions).toHaveLength(0)
    expect(addJob).not.toHaveBeenCalled()
  })

  it('ignores a price that is not in Config.stripePriceIds', async () => {
    stripe.subscriptions.set('sub_1', stripeSubscription({ priceId: 'price_foreign' }))

    await deliver(stripeEvent('evt_price', 'checkout.session.completed', checkoutSession(), T0))

    expect(store.subscriptions).toHaveLength(0)
    expect(addJob).not.toHaveBeenCalled()
  })

  it('records the subscription but skips the grant enqueue when Stripe is disabled', async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ stripeEnabled: false, stripePriceIds: ['price_1'] }))

    await deliver(stripeEvent('evt_off', 'checkout.session.completed', checkoutSession(), T0))

    expect(store.subscriptions[0]?.status).toBe(SubscriptionStatus.ACTIVE)
    expect(addJob).not.toHaveBeenCalled()
  })
})

describe('processStripeWebhook: newest state only (SEC-37, BP-14)', () => {
  it('writes the live status, period end and cancelAtPeriodEnd on customer.subscription.updated', async () => {
    store.subscriptions.push(subscriptionRow())
    stripe.subscriptions.set('sub_1', stripeSubscription({ cancelAtPeriodEnd: true, periodEnd: PERIOD_END_EPOCH }))

    await deliver(stripeEvent('evt_upd', 'customer.subscription.updated', { id: 'sub_1', status: 'past_due' }, T0))

    // The event's snapshot said past_due; the live subscription is active.
    expect(store.subscriptions[0]).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date(PERIOD_END_EPOCH * 1000),
      stripeEventAt: new Date(T0 * 1000),
    })
    // ACTIVE to ACTIVE is no transition: no grant, and a pending cancellation keeps access.
    expect(addJob).not.toHaveBeenCalled()
  })

  it('a deleted followed by a delayed updated(active) leaves the row CANCELED, with no grant', async () => {
    store.subscriptions.push(subscriptionRow())
    stripe.subscriptions.set('sub_1', stripeSubscription({ status: 'canceled', canceledAt: T0 }))

    await deliver(stripeEvent('evt_deleted', 'customer.subscription.deleted', { id: 'sub_1' }, T0 + 60))
    expect(store.subscriptions[0]).toMatchObject({ status: SubscriptionStatus.CANCELED, canceledAt: new Date(T0 * 1000) })
    expect(revokes()).toHaveLength(1)

    // The older update arrives late; even if a read raced to "active", it is stale.
    stripe.subscriptions.set('sub_1', stripeSubscription({ status: 'active' }))
    await deliver(stripeEvent('evt_late', 'customer.subscription.updated', { id: 'sub_1', status: 'active' }, T0))

    expect(store.subscriptions[0].status).toBe(SubscriptionStatus.CANCELED)
    expect(grants()).toHaveLength(0)
    expect(store.events.get('evt_late')?.processedAt).toEqual(expect.any(Date))
  })

  it('a resent updated(active) after deleted reads the live CANCELED state', async () => {
    store.subscriptions.push(subscriptionRow())
    stripe.subscriptions.set('sub_1', stripeSubscription({ status: 'canceled' }))

    await deliver(stripeEvent('evt_deleted', 'customer.subscription.deleted', { id: 'sub_1' }, T0))
    await deliver(stripeEvent('evt_updated', 'customer.subscription.updated', { id: 'sub_1', status: 'active' }, T0 + 5))

    expect(store.subscriptions[0].status).toBe(SubscriptionStatus.CANCELED)
    expect(grants()).toHaveLength(0)
  })

  it('a payment_failed after deleted leaves the row CANCELED', async () => {
    store.subscriptions.push(subscriptionRow())
    stripe.subscriptions.set('sub_1', stripeSubscription({ status: 'canceled' }))

    await deliver(stripeEvent('evt_deleted', 'customer.subscription.deleted', { id: 'sub_1' }, T0 + 60))
    await deliver(stripeEvent('evt_failed', 'invoice.payment_failed', { id: 'in_1', subscription: 'sub_1' }, T0))
    expect(store.subscriptions[0].status).toBe(SubscriptionStatus.CANCELED)

    // A newer dunning event reads the live, still-canceled subscription too.
    await deliver(stripeEvent('evt_failed_2', 'invoice.payment_failed', { id: 'in_2', subscription: 'sub_1' }, T0 + 120))
    expect(store.subscriptions[0].status).toBe(SubscriptionStatus.CANCELED)
  })

  it('marks PAST_DUE on invoice.payment_failed during dunning, keeping access', async () => {
    store.subscriptions.push(subscriptionRow())
    stripe.subscriptions.set('sub_1', stripeSubscription({ status: 'past_due' }))

    await deliver(
      stripeEvent('evt_failed', 'invoice.payment_failed', { id: 'in_1', parent: { subscription_details: { subscription: 'sub_1' } } }, T0)
    )

    expect(store.subscriptions[0].status).toBe(SubscriptionStatus.PAST_DUE)
    expect(addJob).not.toHaveBeenCalled()
  })

  it('skips payment_failed handling when no subscription id is present', async () => {
    await deliver(stripeEvent('evt_failed2', 'invoice.payment_failed', { id: 'in_2' }, T0))

    expect(prismaMock.subscription.updateMany).not.toHaveBeenCalled()
  })

  it('re-grants on a recovery from UNPAID, but not on PAST_DUE to ACTIVE', async () => {
    store.subscriptions.push(subscriptionRow({ status: SubscriptionStatus.UNPAID }))
    stripe.subscriptions.set('sub_1', stripeSubscription({ status: 'active' }))

    await deliver(stripeEvent('evt_recovered', 'customer.subscription.updated', { id: 'sub_1' }, T0))
    expect(addJob).toHaveBeenCalledWith(
      JOB_TYPES.PLEX_ACCESS_GRANT,
      { userId: 'user-1' },
      { jobId: `${JOB_TYPES.PLEX_ACCESS_GRANT}:user-1:evt_recovered` }
    )

    store.subscriptions[0].status = SubscriptionStatus.PAST_DUE
    await deliver(stripeEvent('evt_paid', 'customer.subscription.updated', { id: 'sub_1' }, T0 + 1))
    expect(grants()).toHaveLength(1)
  })

  it('skips an event for a subscription with no local row', async () => {
    stripe.subscriptions.set('sub_unknown', stripeSubscription({ id: 'sub_unknown', status: 'canceled' }))

    await deliver(stripeEvent('evt_orphan', 'customer.subscription.deleted', { id: 'sub_unknown' }, T0))

    expect(addJob).not.toHaveBeenCalled()
    expect(store.events.get('evt_orphan')?.processedAt).toEqual(expect.any(Date))
  })
})

describe('getStripeProcessor', () => {
  it('returns the processor for STRIPE_WEBHOOK', () => {
    expect(getStripeProcessor(JOB_TYPES.STRIPE_WEBHOOK)).toBe(processStripeWebhook)
  })

  it('returns the processor for PLEX_ACCESS_GRANT', () => {
    expect(getStripeProcessor(JOB_TYPES.PLEX_ACCESS_GRANT)).toBe(
      processAccessGrant
    )
  })

  it('returns null for non-Stripe job types', () => {
    expect(getStripeProcessor(JOB_TYPES.WATCHLIST_SYNC_USER)).toBeNull()
    expect(getStripeProcessor('unknown:type')).toBeNull()
  })
})
