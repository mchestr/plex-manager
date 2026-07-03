/**
 * Tests for lib/stripe/prices.ts - offered-prices fetcher with caching and
 * resilience.
 */

import {
  clearOfferedPricesCache,
  getOfferedPrices,
} from '@/lib/stripe/prices'
import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe/client'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    config: {
      findUnique: jest.fn(),
    },
  },
}))

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
      },
      {
        priceId: 'price_year',
        amount: 5000,
        currency: 'usd',
        interval: 'year',
        productName: 'Plex Access Annual',
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
    })
  })
})
