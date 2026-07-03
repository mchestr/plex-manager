/**
 * Tests for app/api/stripe/webhook/route.ts - Stripe webhook endpoint.
 *
 * Covers: valid signed event → 200 + enqueue, invalid signature → 400 + no
 * enqueue, and duplicate event → 200 no-op. `constructEvent`, `addJob`, and the
 * `StripeEvent` lookup are mocked.
 */

import { POST } from '@/app/api/stripe/webhook/route'
import { getStripe } from '@/lib/stripe/client'
import { prisma } from '@/lib/prisma'
import { addJob } from '@/lib/queue/client'
import { JOB_TYPES } from '@/lib/queue/types'

jest.mock('@/lib/stripe/client', () => ({
  getStripe: jest.fn(),
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    config: {
      findUnique: jest.fn(),
    },
    stripeEvent: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('@/lib/queue/client', () => ({
  addJob: jest.fn(),
}))

jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}))

jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server')
  return {
    ...actual,
    NextResponse: {
      ...actual.NextResponse,
      json: jest.fn((data, init) => ({
        json: () => Promise.resolve(data),
        status: init?.status || 200,
        ...init,
      })),
    },
  }
})

const mockConstructEvent = jest.fn()

/** Build a minimal request exposing text() + headers.get(). */
function makeRequest(
  body: string,
  headers: Record<string, string> = { 'stripe-signature': 'sig' }
) {
  return {
    text: async () => body,
    headers: new Headers(headers),
  } as unknown as import('next/server').NextRequest
}

describe('POST /api/stripe/webhook', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getStripe as jest.Mock).mockResolvedValue({
      webhooks: { constructEvent: mockConstructEvent },
    })
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({
      stripeWebhookSecret: 'whsec_test',
    })
    ;(prisma.stripeEvent.findUnique as jest.Mock).mockResolvedValue(null)
    ;(addJob as jest.Mock).mockResolvedValue('evt_1')
  })

  it('enqueues a STRIPE_WEBHOOK job and returns 200 for a valid, unseen event', async () => {
    mockConstructEvent.mockReturnValue({ id: 'evt_1', type: 'checkout.session.completed' })

    const response = await POST(makeRequest('{"raw":true}'))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.received).toBe(true)
    expect(addJob).toHaveBeenCalledWith(
      JOB_TYPES.STRIPE_WEBHOOK,
      { eventId: 'evt_1' },
      { jobId: 'evt_1' }
    )
  })

  it('reads the raw text body (not parsed JSON) before verifying', async () => {
    mockConstructEvent.mockReturnValue({ id: 'evt_raw', type: 'customer.subscription.updated' })
    const rawBody = '{"raw":"payload"}'

    await POST(makeRequest(rawBody, { 'stripe-signature': 'the-sig' }))

    expect(mockConstructEvent).toHaveBeenCalledWith(rawBody, 'the-sig', 'whsec_test')
  })

  it('returns 400 and enqueues nothing when the signature fails verification', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature')
    })

    const response = await POST(makeRequest('{"raw":true}'))
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid signature')
    expect(addJob).not.toHaveBeenCalled()
    expect(prisma.stripeEvent.findUnique).not.toHaveBeenCalled()
  })

  it('returns 200 without re-enqueuing when the event id was already seen', async () => {
    mockConstructEvent.mockReturnValue({ id: 'evt_dup', type: 'invoice.payment_failed' })
    ;(prisma.stripeEvent.findUnique as jest.Mock).mockResolvedValue({ id: 'evt_dup' })

    const response = await POST(makeRequest('{"raw":true}'))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.duplicate).toBe(true)
    expect(addJob).not.toHaveBeenCalled()
  })

  it('returns 503 when Stripe is not configured', async () => {
    ;(getStripe as jest.Mock).mockResolvedValue(null)

    const response = await POST(makeRequest('{"raw":true}'))

    expect(response.status).toBe(503)
    expect(addJob).not.toHaveBeenCalled()
  })

  it('returns 503 when no webhook secret is configured', async () => {
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({
      stripeWebhookSecret: null,
    })

    const response = await POST(makeRequest('{"raw":true}'))

    expect(response.status).toBe(503)
    expect(mockConstructEvent).not.toHaveBeenCalled()
    expect(addJob).not.toHaveBeenCalled()
  })
})
