/**
 * Tests for lib/stripe/prices.ts - offered-prices fetcher with caching and
 * resilience.
 */

import {
  clearOfferedPricesCache,
  getOfferedPrices,
  getPlanName,
  getPlanPrice,
} from '@/lib/stripe/prices'
import { cacheLife, cacheTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe/client'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

// The 'use cache' directive is inert under Jest; the tag and life calls are checked.
jest.mock('next/cache', () => ({ cacheLife: jest.fn(), cacheTag: jest.fn() }))

jest.mock('@/lib/stripe/client', () => ({
  getStripe: jest.fn(),
}))

jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}))

const mockFindUnique = prisma.config.findUnique as jest.Mock
const mockGetStripe = getStripe as jest.Mock

/** Builds a Stripe-price-like object as returned by `prices.retrieve`. */
function makeStripePrice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'price_123',
    unit_amount: 500,
    currency: 'usd',
    recurring: { interval: 'month' },
    product: { name: 'Plex Access', deleted: false },
    ...overrides,
  }
}

function makeStripeMock() {
  return {
    prices: {
      retrieve: jest.fn(),
    },
  }
}

describe('getOfferedPrices', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    clearOfferedPricesCache()
  })

  it('resolves configured price IDs into display details', async () => {
    mockFindUnique.mockResolvedValue({
      stripeEnabled: true,
      stripePriceIds: ['price_month', 'price_year'],
    })
    const stripe = makeStripeMock()
    stripe.prices.retrieve
      .mockResolvedValueOnce(
        makeStripePrice({ id: 'price_month', unit_amount: 500 })
      )
      .mockResolvedValueOnce(
        makeStripePrice({
          id: 'price_year',
          unit_amount: 5000,
          recurring: { interval: 'year' },
          product: { name: 'Plex Access Annual', deleted: false },
        })
      )
    mockGetStripe.mockResolvedValue(stripe)

    const result = await getOfferedPrices()

    expect(result).toEqual([
      {
        priceId: 'price_month',
        amount: 500,
        currency: 'usd',
        interval: 'month',
        productName: 'Plex Access',
        features: [],
        recommended: false,
      },
      {
        priceId: 'price_year',
        amount: 5000,
        currency: 'usd',
        interval: 'year',
        productName: 'Plex Access Annual',
        features: [],
        recommended: false,
      },
    ])
    expect(stripe.prices.retrieve).toHaveBeenCalledWith('price_month', {
      expand: ['product'],
    })
  })

  it('skips a price ID that no longer resolves and returns the rest', async () => {
    mockFindUnique.mockResolvedValue({
      stripeEnabled: true,
      stripePriceIds: ['price_bad', 'price_good'],
    })
    const stripe = makeStripeMock()
    stripe.prices.retrieve
      .mockRejectedValueOnce(new Error('No such price: price_bad'))
      .mockResolvedValueOnce(makeStripePrice({ id: 'price_good' }))
    mockGetStripe.mockResolvedValue(stripe)

    const result = await getOfferedPrices()

    expect(result).toHaveLength(1)
    expect(result[0].priceId).toBe('price_good')
  })

  it('returns an empty array when Stripe is unconfigured/disabled', async () => {
    mockGetStripe.mockResolvedValue(null)

    const result = await getOfferedPrices()

    expect(result).toEqual([])
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  it('returns an empty array when Stripe is disabled even if prices are configured', async () => {
    // Guards the purchase path: an admin toggling Stripe OFF must make /subscribe
    // and startCheckout inert even though a key + price IDs remain configured.
    mockFindUnique.mockResolvedValue({
      stripeEnabled: false,
      stripePriceIds: ['price_month'],
    })
    const stripe = makeStripeMock()
    mockGetStripe.mockResolvedValue(stripe)

    const result = await getOfferedPrices()

    expect(result).toEqual([])
    expect(stripe.prices.retrieve).not.toHaveBeenCalled()
  })

  it('returns an empty array when no price IDs are configured', async () => {
    mockFindUnique.mockResolvedValue({ stripeEnabled: true, stripePriceIds: null })
    const stripe = makeStripeMock()
    mockGetStripe.mockResolvedValue(stripe)

    const result = await getOfferedPrices()

    expect(result).toEqual([])
    expect(stripe.prices.retrieve).not.toHaveBeenCalled()
  })

  it('serves a second call within the cache window without re-querying Stripe', async () => {
    mockFindUnique.mockResolvedValue({ stripeEnabled: true, stripePriceIds: ['price_month'] })
    const stripe = makeStripeMock()
    stripe.prices.retrieve.mockResolvedValue(
      makeStripePrice({ id: 'price_month' })
    )
    mockGetStripe.mockResolvedValue(stripe)

    const first = await getOfferedPrices()
    const second = await getOfferedPrices()

    expect(first).toEqual(second)
    expect(stripe.prices.retrieve).toHaveBeenCalledTimes(1)
  })

  it('coerces missing amount/interval to null and a string product to the name', async () => {
    mockFindUnique.mockResolvedValue({ stripeEnabled: true, stripePriceIds: ['price_custom'] })
    const stripe = makeStripeMock()
    stripe.prices.retrieve.mockResolvedValue(
      makeStripePrice({
        id: 'price_custom',
        unit_amount: null,
        recurring: null,
        product: 'prod_expanded_string',
      })
    )
    mockGetStripe.mockResolvedValue(stripe)

    const result = await getOfferedPrices()

    expect(result[0]).toEqual({
      priceId: 'price_custom',
      amount: null,
      currency: 'usd',
      interval: null,
      productName: 'prod_expanded_string',
      features: [],
      recommended: false,
    })
  })

  // P10.28: the plan cards' benefits and their one primary
  it("reads features from the product's marketing_features, capped at three", async () => {
    mockFindUnique.mockResolvedValue({ stripeEnabled: true, stripePriceIds: ['price_123'] })
    const stripe = makeStripeMock()
    stripe.prices.retrieve.mockResolvedValueOnce(
      makeStripePrice({
        product: {
          name: 'Supporter',
          deleted: false,
          marketing_features: [{ name: 'Every library' }, { name: ' ' }, {}, { name: '4K streams' }, { name: 'Rewind' }, { name: 'Fourth' }],
        },
      })
    )
    mockGetStripe.mockResolvedValue(stripe)

    const [price] = await getOfferedPrices()

    expect(price.features).toEqual(['Every library', '4K streams', 'Rewind'])
  })

  it('marks a price recommended from metadata.recommended === "true"', async () => {
    mockFindUnique.mockResolvedValue({ stripeEnabled: true, stripePriceIds: ['price_a', 'price_b'] })
    const stripe = makeStripeMock()
    stripe.prices.retrieve
      .mockResolvedValueOnce(makeStripePrice({ id: 'price_a', metadata: { recommended: 'yes' } }))
      .mockResolvedValueOnce(makeStripePrice({ id: 'price_b', metadata: { recommended: 'true' } }))
    mockGetStripe.mockResolvedValue(stripe)

    const prices = await getOfferedPrices()

    expect(prices.map((price) => price.recommended)).toEqual([false, true])
  })
})

describe('getPlanName', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    clearOfferedPricesCache()
  })

  it('names an offered price by its product', async () => {
    mockFindUnique.mockResolvedValue({ stripeEnabled: true, stripePriceIds: ['price_month'] })
    const stripe = makeStripeMock()
    stripe.prices.retrieve.mockResolvedValue(
      makeStripePrice({ id: 'price_month', product: { name: 'Supporter plan', deleted: false } })
    )
    mockGetStripe.mockResolvedValue(stripe)

    await expect(getPlanName('price_month')).resolves.toBe('Supporter plan')
  })

  it('retrieves a price that is no longer offered, cached under the plan-names tag', async () => {
    mockFindUnique.mockResolvedValue({ stripeEnabled: true, stripePriceIds: [] })
    const stripe = makeStripeMock()
    stripe.prices.retrieve.mockResolvedValue(
      makeStripePrice({ id: 'price_old', product: { name: 'Founding plan', deleted: false } })
    )
    mockGetStripe.mockResolvedValue(stripe)

    await expect(getPlanName('price_old')).resolves.toBe('Founding plan')
    await expect(getPlanPrice('price_old')).resolves.toMatchObject({ amount: 500, interval: 'month' })
    expect(cacheTag).toHaveBeenCalledWith('plan-names')
    expect(cacheLife).toHaveBeenCalledWith('hours')
    expect(stripe.prices.retrieve).toHaveBeenCalledWith('price_old', { expand: ['product'] })
  })

  it('falls back to "Membership", never the price id', async () => {
    mockFindUnique.mockResolvedValue({ stripeEnabled: true, stripePriceIds: [] })
    const stripe = makeStripeMock()
    stripe.prices.retrieve.mockRejectedValue(new Error('No such price'))
    mockGetStripe.mockResolvedValue(stripe)

    await expect(getPlanName('price_gone')).resolves.toBe('Membership')
    await expect(getPlanName(null)).resolves.toBe('Membership')

    mockGetStripe.mockResolvedValue(null)
    await expect(getPlanName('price_gone')).resolves.toBe('Membership')
  })

  it('does not use an unexpanded product id as the name', async () => {
    mockFindUnique.mockResolvedValue({ stripeEnabled: true, stripePriceIds: [] })
    const stripe = makeStripeMock()
    stripe.prices.retrieve.mockResolvedValue(makeStripePrice({ id: 'price_x', product: 'prod_123' }))
    mockGetStripe.mockResolvedValue(stripe)

    await expect(getPlanName('price_x')).resolves.toBe('Membership')
  })
})
