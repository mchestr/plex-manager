/**
 * Tests for the user-facing subscription checkout + billing-portal flows.
 *
 * Covers:
 * - lib/stripe/checkout.ts `createCheckoutSession`: param assembly (subscription
 *   mode, client_reference_id, subscription_data.metadata.appUserId,
 *   allow_promotion_codes, success/cancel URLs, customer_email prefill), and the
 *   null-when-unconfigured path.
 * - actions/subscription.ts `startCheckout`: auth required, offered-price
 *   validation, the no-email refusal, disabled/unconfigured handling, and URL
 *   return.
 * - actions/subscription.ts `openBillingPortal`: auth required, missing-customer,
 *   unconfigured handling, and portal URL return.
 */

import { createCheckoutSession } from '@/lib/stripe/checkout'
import { getSubscriptionProvisioning, openBillingPortal, startCheckout } from '@/actions/subscription'
import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe/client'
import { getOfferedPrices } from '@/lib/stripe/prices'
import { getServerSession } from 'next-auth'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

jest.mock('@/lib/stripe/client', () => ({
  getStripe: jest.fn(),
}))

jest.mock('@/lib/stripe/prices', () => ({
  getOfferedPrices: jest.fn(),
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}))

// createCheckoutSession derives the base URL from env; set it deterministically.
process.env.NEXT_PUBLIC_APP_URL = 'https://plex.example.com'

const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockSubscriptionFindUnique = prisma.subscription.findUnique as jest.Mock
const mockGetStripe = getStripe as jest.Mock
const mockGetOfferedPrices = getOfferedPrices as jest.Mock
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>

function makeStripeMock() {
  return {
    checkout: {
      sessions: {
        create: jest.fn(),
      },
    },
    billingPortal: {
      sessions: {
        create: jest.fn(),
      },
    },
  }
}

const userSession = {
  user: { id: 'user-123', name: 'User', email: 'user@test.com', isAdmin: false },
  expires: new Date(Date.now() + 86400000).toISOString(),
}

describe('createCheckoutSession', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('assembles subscription-mode params with identity binding and promo codes', async () => {
    const stripe = makeStripeMock()
    stripe.checkout.sessions.create.mockResolvedValue({
      id: 'cs_test_1',
      url: 'https://checkout.stripe.com/c/pay/cs_test_1',
    })
    mockGetStripe.mockResolvedValue(stripe)
    mockUserFindUnique.mockResolvedValue({ email: 'user@test.com', plexUserId: 'plex-1' })

    const session = await createCheckoutSession('user-123', 'price_month')

    expect(session).toEqual({
      id: 'cs_test_1',
      url: 'https://checkout.stripe.com/c/pay/cs_test_1',
    })
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        line_items: [{ price: 'price_month', quantity: 1 }],
        client_reference_id: 'user-123',
        subscription_data: { metadata: { appUserId: 'user-123' } },
        allow_promotion_codes: true,
        customer_email: 'user@test.com',
      })
    )
    const params = stripe.checkout.sessions.create.mock.calls[0][0]
    expect(params.success_url).toBe(
      'https://plex.example.com/subscribe/success?session_id={CHECKOUT_SESSION_ID}'
    )
    expect(params.cancel_url).toBe('https://plex.example.com/subscribe')
  })

  it('omits customer_email when the user has no stored email', async () => {
    const stripe = makeStripeMock()
    stripe.checkout.sessions.create.mockResolvedValue({ id: 'cs_test_2', url: 'u' })
    mockGetStripe.mockResolvedValue(stripe)
    mockUserFindUnique.mockResolvedValue({ email: null })

    await createCheckoutSession('user-123', 'price_month')

    const params = stripe.checkout.sessions.create.mock.calls[0][0]
    expect(params).not.toHaveProperty('customer_email')
  })

  it('reuses the existing Stripe customer instead of prefilling the email (SEC-39)', async () => {
    const stripe = makeStripeMock()
    stripe.checkout.sessions.create.mockResolvedValue({ id: 'cs_test_4', url: 'u' })
    mockGetStripe.mockResolvedValue(stripe)
    mockUserFindUnique.mockResolvedValue({ email: 'user@test.com', plexUserId: 'plex-1', subscription: { stripeCustomerId: 'cus_existing' } })

    await createCheckoutSession('user-123', 'price_month')

    const params = stripe.checkout.sessions.create.mock.calls[0][0]
    expect(params.customer).toBe('cus_existing')
    expect(params).not.toHaveProperty('customer_email')
  })

  it('returns null when Stripe is unconfigured', async () => {
    mockGetStripe.mockResolvedValue(null)

    const session = await createCheckoutSession('user-123', 'price_month')

    expect(session).toBeNull()
    expect(mockUserFindUnique).not.toHaveBeenCalled()
  })
})

describe('startCheckout', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns an error when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const result = await startCheckout({ priceId: 'price_month' })

    expect(result).toMatchObject({ success: false, error: expect.any(String) })
    expect(mockGetOfferedPrices).not.toHaveBeenCalled()
  })

  it('returns the Checkout URL for an authenticated user and an offered price', async () => {
    mockGetServerSession.mockResolvedValue(userSession)
    mockGetOfferedPrices.mockResolvedValue([
      { priceId: 'price_month', amount: 500, currency: 'usd', interval: 'month', productName: 'Plex' },
    ])
    const stripe = makeStripeMock()
    stripe.checkout.sessions.create.mockResolvedValue({
      id: 'cs_test_3',
      url: 'https://checkout.stripe.com/c/pay/cs_test_3',
    })
    mockGetStripe.mockResolvedValue(stripe)
    mockUserFindUnique.mockResolvedValue({ email: 'user@test.com', plexUserId: 'plex-1' })

    const result = await startCheckout({ priceId: 'price_month' })

    expect(result).toEqual({ success: true, data: { url: 'https://checkout.stripe.com/c/pay/cs_test_3' } })
  })

  it.each(['ACTIVE', 'PAST_DUE'])('refuses a member whose subscription is %s with ALREADY_SUBSCRIBED (SEC-39)', async (status) => {
    mockGetServerSession.mockResolvedValue(userSession)
    mockGetOfferedPrices.mockResolvedValue([
      { priceId: 'price_month', amount: 500, currency: 'usd', interval: 'month', productName: 'Plex' },
    ])
    const stripe = makeStripeMock()
    mockGetStripe.mockResolvedValue(stripe)
    mockUserFindUnique.mockResolvedValue({ email: 'user@test.com', plexUserId: 'plex-1', subscription: { status } })

    const result = await startCheckout({ priceId: 'price_month' })

    expect(result).toMatchObject({ success: false, code: 'ALREADY_SUBSCRIBED' })
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('lets a CANCELED member check out again', async () => {
    mockGetServerSession.mockResolvedValue(userSession)
    mockGetOfferedPrices.mockResolvedValue([
      { priceId: 'price_month', amount: 500, currency: 'usd', interval: 'month', productName: 'Plex' },
    ])
    const stripe = makeStripeMock()
    stripe.checkout.sessions.create.mockResolvedValue({ id: 'cs_again', url: 'https://checkout.stripe.com/again' })
    mockGetStripe.mockResolvedValue(stripe)
    mockUserFindUnique.mockResolvedValue({
      email: 'user@test.com',
      plexUserId: 'plex-1',
      subscription: { status: 'CANCELED', stripeCustomerId: 'cus_existing' },
    })

    const result = await startCheckout({ priceId: 'price_month' })

    expect(result).toEqual({ success: true, data: { url: 'https://checkout.stripe.com/again' } })
    expect(stripe.checkout.sessions.create.mock.calls[0][0].customer).toBe('cus_existing')
  })

  it('rejects a price that is not in the offered set without creating a session', async () => {
    mockGetServerSession.mockResolvedValue(userSession)
    mockGetOfferedPrices.mockResolvedValue([
      { priceId: 'price_month', amount: 500, currency: 'usd', interval: 'month', productName: 'Plex' },
    ])
    const stripe = makeStripeMock()
    mockGetStripe.mockResolvedValue(stripe)

    const result = await startCheckout({ priceId: 'price_evil' })

    expect(result).toMatchObject({ success: false, error: expect.any(String) })
    expect('url' in result).toBe(false)
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('returns an error when Stripe is disabled/unconfigured (no offered prices)', async () => {
    mockGetServerSession.mockResolvedValue(userSession)
    mockGetOfferedPrices.mockResolvedValue([])

    const result = await startCheckout({ priceId: 'price_month' })

    expect(result).toMatchObject({ success: false, error: expect.any(String) })
    // No session attempt when nothing is offered.
    expect(mockGetStripe).not.toHaveBeenCalled()
  })

  it('refuses checkout for a user with no email, because the Plex grant could not invite them', async () => {
    mockGetServerSession.mockResolvedValue(userSession)
    mockGetOfferedPrices.mockResolvedValue([
      { priceId: 'price_month', amount: 500, currency: 'usd', interval: 'month', productName: 'Plex' },
    ])
    const stripe = makeStripeMock()
    mockGetStripe.mockResolvedValue(stripe)
    mockUserFindUnique.mockResolvedValue({ email: null })

    const result = await startCheckout({ priceId: 'price_month' })

    expect(result).toMatchObject({ success: false, error: expect.stringContaining('no email address') })
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('lets a Jellyfin-only member with no email check out, since the grant turns their account on (P11.11)', async () => {
    mockGetServerSession.mockResolvedValue(userSession)
    mockGetOfferedPrices.mockResolvedValue([
      { priceId: 'price_month', amount: 500, currency: 'usd', interval: 'month', productName: 'Plex' },
    ])
    const stripe = makeStripeMock()
    stripe.checkout.sessions.create.mockResolvedValue({ id: 'cs_jf', url: 'https://checkout.stripe.com/jf' })
    mockGetStripe.mockResolvedValue(stripe)
    mockUserFindUnique.mockResolvedValue({ email: null, plexUserId: null, jellyfinUserId: 'jf-1' })

    const result = await startCheckout({ priceId: 'price_month' })

    expect(result).toEqual({ success: true, data: { url: 'https://checkout.stripe.com/jf' } })
    expect(stripe.checkout.sessions.create.mock.calls[0][0]).not.toHaveProperty('customer_email')
  })

  it('refuses a member with an email but no linked Plex or Jellyfin account', async () => {
    mockGetServerSession.mockResolvedValue(userSession)
    mockGetOfferedPrices.mockResolvedValue([
      { priceId: 'price_month', amount: 500, currency: 'usd', interval: 'month', productName: 'Plex' },
    ])
    const stripe = makeStripeMock()
    mockGetStripe.mockResolvedValue(stripe)
    mockUserFindUnique.mockResolvedValue({ email: 'user@test.com', plexUserId: null, jellyfinUserId: null })

    const result = await startCheckout({ priceId: 'price_month' })

    expect(result).toMatchObject({ success: false, code: 'CONFLICT' })
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('returns an error when the created session has no URL', async () => {
    mockGetServerSession.mockResolvedValue(userSession)
    mockGetOfferedPrices.mockResolvedValue([
      { priceId: 'price_month', amount: 500, currency: 'usd', interval: 'month', productName: 'Plex' },
    ])
    const stripe = makeStripeMock()
    stripe.checkout.sessions.create.mockResolvedValue({ id: 'cs_no_url', url: null })
    mockGetStripe.mockResolvedValue(stripe)
    mockUserFindUnique.mockResolvedValue({ email: 'user@test.com', plexUserId: 'plex-1' })

    const result = await startCheckout({ priceId: 'price_month' })

    expect(result).toMatchObject({ success: false, error: expect.any(String) })
  })

  it('returns an error (does not throw) when checkout creation fails', async () => {
    mockGetServerSession.mockResolvedValue(userSession)
    mockGetOfferedPrices.mockResolvedValue([
      { priceId: 'price_month', amount: 500, currency: 'usd', interval: 'month', productName: 'Plex' },
    ])
    const stripe = makeStripeMock()
    stripe.checkout.sessions.create.mockRejectedValue(new Error('Stripe down'))
    mockGetStripe.mockResolvedValue(stripe)
    mockUserFindUnique.mockResolvedValue({ email: 'user@test.com', plexUserId: 'plex-1' })

    const result = await startCheckout({ priceId: 'price_month' })

    expect(result).toMatchObject({ success: false, error: expect.any(String) })
  })
})

describe('openBillingPortal', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns an error when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const result = await openBillingPortal()

    expect(result).toMatchObject({ success: false, error: expect.any(String) })
    expect(mockSubscriptionFindUnique).not.toHaveBeenCalled()
    expect(mockGetStripe).not.toHaveBeenCalled()
  })

  it('returns the Billing Portal URL for a user with a Stripe customer id', async () => {
    mockGetServerSession.mockResolvedValue(userSession)
    mockSubscriptionFindUnique.mockResolvedValue({ stripeCustomerId: 'cus_abc' })
    const stripe = makeStripeMock()
    stripe.billingPortal.sessions.create.mockResolvedValue({
      id: 'bps_1',
      url: 'https://billing.stripe.com/session/bps_1',
    })
    mockGetStripe.mockResolvedValue(stripe)

    const result = await openBillingPortal()

    expect(result).toEqual({ success: true, data: { url: 'https://billing.stripe.com/session/bps_1' } })
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_abc',
        return_url: 'https://plex.example.com/',
      })
    )
  })

  it('returns an error when the user has no Stripe customer id', async () => {
    mockGetServerSession.mockResolvedValue(userSession)
    mockSubscriptionFindUnique.mockResolvedValue({ stripeCustomerId: null })

    const result = await openBillingPortal()

    expect(result).toMatchObject({ success: false, error: expect.any(String) })
    // No Stripe call attempted when there is nothing to manage.
    expect(mockGetStripe).not.toHaveBeenCalled()
  })

  it('returns an error when the user has no subscription row at all', async () => {
    mockGetServerSession.mockResolvedValue(userSession)
    mockSubscriptionFindUnique.mockResolvedValue(null)

    const result = await openBillingPortal()

    expect(result).toMatchObject({ success: false, error: expect.any(String) })
    expect(mockGetStripe).not.toHaveBeenCalled()
  })

  it('returns an error when Stripe is unconfigured/disabled', async () => {
    mockGetServerSession.mockResolvedValue(userSession)
    mockSubscriptionFindUnique.mockResolvedValue({ stripeCustomerId: 'cus_abc' })
    mockGetStripe.mockResolvedValue(null)

    const result = await openBillingPortal()

    expect(result).toMatchObject({ success: false, error: expect.any(String) })
  })

  it('returns an error when the created portal session has no URL', async () => {
    mockGetServerSession.mockResolvedValue(userSession)
    mockSubscriptionFindUnique.mockResolvedValue({ stripeCustomerId: 'cus_abc' })
    const stripe = makeStripeMock()
    stripe.billingPortal.sessions.create.mockResolvedValue({ id: 'bps_no_url', url: null })
    mockGetStripe.mockResolvedValue(stripe)

    const result = await openBillingPortal()

    expect(result).toMatchObject({ success: false, error: expect.any(String) })
  })

  it('returns an error (does not throw) when portal creation fails', async () => {
    mockGetServerSession.mockResolvedValue(userSession)
    mockSubscriptionFindUnique.mockResolvedValue({ stripeCustomerId: 'cus_abc' })
    const stripe = makeStripeMock()
    stripe.billingPortal.sessions.create.mockRejectedValue(new Error('Stripe down'))
    mockGetStripe.mockResolvedValue(stripe)

    const result = await openBillingPortal()

    expect(result).toMatchObject({ success: false, error: expect.any(String) })
  })
})

// P10.28 (UI-40): the success page's live checklist
describe('getSubscriptionProvisioning', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('needs a session and reads nothing without one', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const result = await getSubscriptionProvisioning()

    expect(result).toMatchObject({ success: false, code: 'UNAUTHENTICATED' })
    expect(mockSubscriptionFindUnique).not.toHaveBeenCalled()
  })

  it("reads only the caller's row, and status fields only", async () => {
    mockGetServerSession.mockResolvedValue(userSession)
    const createdAt = new Date('2027-01-26T18:00:00Z')
    const currentPeriodEnd = new Date('2027-02-26T18:00:00Z')
    mockSubscriptionFindUnique.mockResolvedValue({
      status: 'ACTIVE',
      plexInviteStatus: 'accepted',
      jellyfinAccessStatus: 'enabled',
      createdAt,
      currentPeriodEnd,
    })
    mockUserFindUnique.mockResolvedValue({ plexUserId: 'plex-1', jellyfinUserId: 'jf-1' })
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({ stripeLibrarySectionIds: [1, 2, 3] })

    const result = await getSubscriptionProvisioning()

    expect(mockSubscriptionFindUnique).toHaveBeenCalledWith({
      where: { userId: 'user-123' },
      select: { status: true, plexInviteStatus: true, jellyfinAccessStatus: true, createdAt: true, currentPeriodEnd: true },
    })
    expect(mockUserFindUnique).toHaveBeenCalledWith({ where: { id: 'user-123' }, select: { plexUserId: true, jellyfinUserId: true } })
    expect(result).toEqual({
      success: true,
      data: {
        status: 'ACTIVE',
        plexInviteStatus: 'accepted',
        jellyfinAccessStatus: 'enabled',
        services: ['plex', 'jellyfin'],
        libraryCount: 3,
        memberSince: createdAt,
        currentPeriodEnd,
      },
    })
  })

  it('reports nothing yet before the webhook writes the row, and every library when none are chosen', async () => {
    mockGetServerSession.mockResolvedValue(userSession)
    mockSubscriptionFindUnique.mockResolvedValue(null)
    mockUserFindUnique.mockResolvedValue({ plexUserId: null, jellyfinUserId: 'jf-1' })
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({ stripeLibrarySectionIds: null })

    const result = await getSubscriptionProvisioning()

    expect(result).toEqual({
      success: true,
      data: {
        status: null,
        plexInviteStatus: null,
        jellyfinAccessStatus: null,
        services: ['jellyfin'],
        libraryCount: null,
        memberSince: null,
        currentPeriodEnd: null,
      },
    })
  })
})
