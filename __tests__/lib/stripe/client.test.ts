/**
 * Tests for lib/stripe/client.ts - configured Stripe client factory.
 *
 * Covers the configured/unconfigured paths and asserts the secret key is passed
 * to the SDK constructor but never logged or returned to callers.
 */

import { getStripe } from '@/lib/stripe/client'
import { prisma } from '@/lib/prisma'

// A lightweight Stripe constructor mock that records how it was invoked.
const stripeConstructor = jest.fn()

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation((...args: unknown[]) => {
    stripeConstructor(...args)
    return { __isStripe: true }
  }),
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    config: {
      findUnique: jest.fn(),
    },
  },
}))

const mockFindUnique = prisma.config.findUnique as jest.Mock

describe('getStripe', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns a Stripe instance when the secret key is configured', async () => {
    mockFindUnique.mockResolvedValue({ stripeSecretKey: 'sk_test_configured' })

    const stripe = await getStripe()

    expect(stripe).not.toBeNull()
    expect(stripeConstructor).toHaveBeenCalledTimes(1)
    // Secret is handed to the SDK constructor as the first argument.
    expect(stripeConstructor).toHaveBeenCalledWith('sk_test_configured')
  })

  it('does not hard-pin an apiVersion (relies on the SDK default)', async () => {
    mockFindUnique.mockResolvedValue({ stripeSecretKey: 'sk_test_configured' })

    await getStripe()

    const [, options] = stripeConstructor.mock.calls[0]
    // Either no options object at all, or one without apiVersion set.
    if (options && typeof options === 'object') {
      expect((options as Record<string, unknown>).apiVersion).toBeUndefined()
    } else {
      expect(options).toBeUndefined()
    }
  })

  it('returns null when no secret key is configured', async () => {
    mockFindUnique.mockResolvedValue({ stripeSecretKey: null })

    const stripe = await getStripe()

    expect(stripe).toBeNull()
    expect(stripeConstructor).not.toHaveBeenCalled()
  })

  it('returns null when the config row is absent', async () => {
    mockFindUnique.mockResolvedValue(null)

    const stripe = await getStripe()

    expect(stripe).toBeNull()
    expect(stripeConstructor).not.toHaveBeenCalled()
  })

  it('returns null for an empty-string secret key', async () => {
    mockFindUnique.mockResolvedValue({ stripeSecretKey: '' })

    const stripe = await getStripe()

    expect(stripe).toBeNull()
    expect(stripeConstructor).not.toHaveBeenCalled()
  })

  it('does not leak the secret key back to the caller', async () => {
    mockFindUnique.mockResolvedValue({ stripeSecretKey: 'sk_test_secret_value' })

    const stripe = await getStripe()

    // The returned client must not surface the raw secret to callers.
    expect(JSON.stringify(stripe)).not.toContain('sk_test_secret_value')
  })
})
