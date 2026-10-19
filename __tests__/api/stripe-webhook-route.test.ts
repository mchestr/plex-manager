/**
 * @jest-environment node
 */

/**
 * Tests for app/api/stripe/webhook/route.ts - Stripe webhook endpoint.
 *
 * Covers: valid signed event → 200 + enqueue, invalid signature → 400 + no
 * enqueue, duplicate event → 200 no-op, and bodies over 1 MiB → 413 before
 * verification. `constructEvent`, `addJob`, and the `StripeEvent` lookup are
 * mocked.
 */

import { POST } from '@/app/api/stripe/webhook/route'
import { getStripe } from '@/lib/stripe/client'
import { prisma } from '@/lib/prisma'
import { addJob } from '@/lib/queue/client'
import { JOB_TYPES } from '@/lib/queue/types'
import { NextRequest } from 'next/server'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

jest.mock('@/lib/stripe/client', () => ({
  getStripe: jest.fn(),
}))

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

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

const MAX_BODY_BYTES = 1024 * 1024

/**
 * Builds a POST to the webhook. A string body sets no Content-Length header,
 * so the route reads it as a stream; tests that need the header pass it.
 */
function makeRequest(
  body: string,
  headers: Record<string, string> = { 'stripe-signature': 'sig' }
) {
  return new NextRequest('http://localhost/api/stripe/webhook', { method: 'POST', body, headers })
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

  it('passes multi-byte UTF-8 through to verification unchanged', async () => {
    mockConstructEvent.mockReturnValue({ id: 'evt_utf8', type: 'customer.subscription.updated' })
    const rawBody = '{"name":"Zoë 🎬 Ünïcødé"}'

    await POST(makeRequest(rawBody))

    expect(mockConstructEvent).toHaveBeenCalledWith(rawBody, 'sig', 'whsec_test')
  })

  it('accepts a body of exactly 1 MiB', async () => {
    mockConstructEvent.mockReturnValue({ id: 'evt_big', type: 'invoice.payment_failed' })
    const rawBody = 'x'.repeat(MAX_BODY_BYTES)

    const response = await POST(makeRequest(rawBody))

    expect(response.status).toBe(200)
    expect(mockConstructEvent).toHaveBeenCalledWith(rawBody, 'sig', 'whsec_test')
  })

  it('returns 413 without reading the body when Content-Length is over 1 MiB', async () => {
    const request = makeRequest('{"raw":true}', {
      'stripe-signature': 'sig',
      'content-length': String(MAX_BODY_BYTES + 1),
    })

    const response = await POST(request)

    expect(response.status).toBe(413)
    expect(request.bodyUsed).toBe(false)
    await expect(response.json()).resolves.toEqual({ error: 'Payload too large' })
    expect(mockConstructEvent).not.toHaveBeenCalled()
    expect(addJob).not.toHaveBeenCalled()
  })

  it('returns 413 when a body without Content-Length grows past 1 MiB', async () => {
    const response = await POST(makeRequest('x'.repeat(MAX_BODY_BYTES + 1)))

    expect(response.status).toBe(413)
    expect(mockConstructEvent).not.toHaveBeenCalled()
    expect(addJob).not.toHaveBeenCalled()
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

  it('applies no IP rate limit, so spoofed Stripe addresses cannot get deliveries rejected', async () => {
    mockConstructEvent.mockImplementation(() => ({ id: `evt_${Math.random()}`, type: 'invoice.payment_failed' }))

    // The old limiter allowed 120 per minute per X-Forwarded-For value.
    for (let i = 0; i < 150; i++) {
      const response = await POST(
        makeRequest('{"raw":true}', { 'stripe-signature': 'sig', 'x-forwarded-for': '3.18.12.63' })
      )
      expect(response.status).toBe(200)
    }
    expect(addJob).toHaveBeenCalledTimes(150)
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
