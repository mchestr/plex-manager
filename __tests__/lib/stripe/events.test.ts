/**
 * Tests for lib/stripe/events.ts - status mapping and version-safe period-end
 * reader.
 */

import { getCurrentPeriodEnd, mapStripeStatus } from '@/lib/stripe/events'
import { SubscriptionStatus } from '@/lib/generated/prisma/client'

describe('mapStripeStatus', () => {
  it('maps active and trialing to ACTIVE', () => {
    expect(mapStripeStatus('active')).toBe(SubscriptionStatus.ACTIVE)
    expect(mapStripeStatus('trialing')).toBe(SubscriptionStatus.ACTIVE)
  })

  it('maps past_due to PAST_DUE', () => {
    expect(mapStripeStatus('past_due')).toBe(SubscriptionStatus.PAST_DUE)
  })

  it('maps canceled to CANCELED', () => {
    expect(mapStripeStatus('canceled')).toBe(SubscriptionStatus.CANCELED)
  })

  it('maps incomplete and incomplete_expired to INCOMPLETE', () => {
    expect(mapStripeStatus('incomplete')).toBe(SubscriptionStatus.INCOMPLETE)
    expect(mapStripeStatus('incomplete_expired')).toBe(
      SubscriptionStatus.INCOMPLETE
    )
  })

  it('maps unpaid to UNPAID', () => {
    expect(mapStripeStatus('unpaid')).toBe(SubscriptionStatus.UNPAID)
  })

  it('maps an unknown status to the INCOMPLETE safe default without throwing', () => {
    expect(() => mapStripeStatus('something_unexpected')).not.toThrow()
    expect(mapStripeStatus('something_unexpected')).toBe(
      SubscriptionStatus.INCOMPLETE
    )
    expect(mapStripeStatus('')).toBe(SubscriptionStatus.INCOMPLETE)
  })
})

describe('getCurrentPeriodEnd', () => {
  // 2024-01-01T00:00:00Z in epoch seconds.
  const EPOCH_SECONDS = 1704067200
  const EXPECTED = new Date(EPOCH_SECONDS * 1000)

  it('reads a top-level current_period_end', () => {
    const result = getCurrentPeriodEnd({ current_period_end: EPOCH_SECONDS } as never)
    expect(result).toEqual(EXPECTED)
  })

  it('falls back to the first item-level current_period_end', () => {
    const result = getCurrentPeriodEnd({
      items: { data: [{ current_period_end: EPOCH_SECONDS }] },
    } as never)
    expect(result).toEqual(EXPECTED)
  })

  it('prefers the top-level value over the item-level value when both are present', () => {
    const result = getCurrentPeriodEnd({
      current_period_end: EPOCH_SECONDS,
      items: { data: [{ current_period_end: EPOCH_SECONDS + 86400 }] },
    } as never)
    expect(result).toEqual(EXPECTED)
  })

  it('returns null when the value is absent everywhere (no throw)', () => {
    expect(getCurrentPeriodEnd({} as never)).toBeNull()
    expect(getCurrentPeriodEnd({ items: { data: [] } } as never)).toBeNull()
    expect(
      getCurrentPeriodEnd({ current_period_end: null, items: null } as never)
    ).toBeNull()
  })

  it('ignores non-numeric period-end values', () => {
    expect(
      getCurrentPeriodEnd({ current_period_end: 'not-a-number' } as never)
    ).toBeNull()
  })
})
