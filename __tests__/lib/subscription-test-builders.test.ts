/**
 * Smoke tests for the subscription test builders in `__tests__/utils/test-builders.ts`.
 *
 * These assert the default shapes and override behavior so downstream TDD tasks
 * can rely on coherent fixtures.
 */

import {
  makeAdminUserWithSubscription,
  makePrismaSubscription,
  makeStripeEvent,
} from '../utils/test-builders'

describe('makePrismaSubscription', () => {
  it('returns a coherent active subscription by default', () => {
    const sub = makePrismaSubscription()
    expect(sub.status).toBe('ACTIVE')
    expect(sub.cancelAtPeriodEnd).toBe(false)
    expect(typeof sub.stripeCustomerId).toBe('string')
    expect(typeof sub.stripeSubscriptionId).toBe('string')
    expect(sub.currentPeriodEnd).toBeInstanceOf(Date)
    expect(sub.canceledAt).toBeNull()
  })

  it('applies overrides while keeping other defaults', () => {
    const sub = makePrismaSubscription({
      status: 'PAST_DUE',
      cancelAtPeriodEnd: true,
    })
    expect(sub.status).toBe('PAST_DUE')
    expect(sub.cancelAtPeriodEnd).toBe(true)
    // Untouched defaults remain
    expect(sub.stripeCustomerId).toBe('cus_test123')
    expect(sub.userId).toBe('user-1')
  })
})

describe('makeStripeEvent', () => {
  it('returns an event with id, type, and data.object', () => {
    const event = makeStripeEvent('customer.subscription.deleted')
    expect(event.id).toBe('evt_test123')
    expect(event.type).toBe('customer.subscription.deleted')
    expect(event.data).toBeDefined()
    expect(event.data.object).toEqual({})
  })

  it('merges a data.object override', () => {
    const event = makeStripeEvent('customer.subscription.updated', {
      data: { object: { id: 'sub_123', status: 'past_due' } },
    })
    expect(event.type).toBe('customer.subscription.updated')
    expect(event.data.object).toEqual({ id: 'sub_123', status: 'past_due' })
  })
})

describe('makeAdminUserWithSubscription', () => {
  it('includes subscription/exempt fields with sensible defaults', () => {
    const user = makeAdminUserWithSubscription()
    expect(user.subscriptionStatus).toBe('ACTIVE')
    expect(user.currentPeriodEnd).toBeInstanceOf(Date)
    expect(user.cancelAtPeriodEnd).toBe(false)
    expect(user.isExempt).toBe(false)
    expect(user.exemptReason).toBeNull()
    expect(user.stripeCustomerId).toBe('cus_test123')
    // Base admin-user stats are still present
    expect(user.id).toBe('user-1')
  })

  it('applies subscription overrides', () => {
    const user = makeAdminUserWithSubscription({
      subscriptionStatus: 'CANCELED',
      isExempt: true,
      exemptReason: 'grandfathered',
      stripeCustomerId: 'cus_override',
    })
    expect(user.subscriptionStatus).toBe('CANCELED')
    expect(user.isExempt).toBe(true)
    expect(user.exemptReason).toBe('grandfathered')
    expect(user.stripeCustomerId).toBe('cus_override')
  })
})
