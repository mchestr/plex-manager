/**
 * @jest-environment node
 */

/**
 * Tests for app/api/stripe/webhook/route.ts - Stripe webhook endpoint.
 *
 * Covers: valid signed event → 200 + enqueue, invalid signature → 400 + no
 * enqueue, processed duplicate → 200 no-op, an unprocessed resend → its job
 * retried or left queued (SEC-40), and bodies over 1 MiB → 413 before
 * verification. Most cases mock `constructEvent`; the resend cases sign
 * fixture events with the Stripe SDK's test header and verify them for real.
 */

import { POST } from '@/app/api/stripe/webhook/route'
import { getStripe } from '@/lib/stripe/client'
import { prisma } from '@/lib/prisma'
import { addJob, findJob } from '@/lib/queue/client'
import { processStripeWebhook } from '@/lib/queue/jobs/stripe'
import { JOB_TYPES } from '@/lib/queue/types'
import { NextRequest } from 'next/server'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { buildConfig } from '@/__tests__/helpers/factories'
import {
  TEST_WEBHOOK_SECRET,
  createFakeStripe,
  emptyStripeStore,
  installStripeStore,
  signFixture,
  stripeEvent,
  subscriptionRow,
} from '@/__tests__/helpers/stripe-fakes'
import type { Job } from 'bullmq'

jest.mock('@/lib/stripe/client', () => ({
  getStripe: jest.fn(),
}))

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

jest.mock('@/lib/queue/client', () => ({
  addJob: jest.fn(),
  findJob: jest.fn(),
}))

jest.mock('@/lib/security/audit-log', () => ({
  AuditEventType: { STRIPE_EVENT_FAILED: 'STRIPE_EVENT_FAILED' },
  logAuditEvent: jest.fn(),
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
    ;(findJob as jest.Mock).mockResolvedValue(undefined)
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

  it('returns 200 without re-enqueuing when the event was already processed', async () => {
    mockConstructEvent.mockReturnValue({ id: 'evt_dup', type: 'invoice.payment_failed' })
    ;(prisma.stripeEvent.findUnique as jest.Mock).mockResolvedValue({ processedAt: new Date() })

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

describe('POST /api/stripe/webhook: resends of unprocessed events (SEC-40)', () => {
  /** A fake BullMQ job in `state`. */
  function fakeJob(state: string) {
    return { getState: jest.fn().mockResolvedValue(state), retry: jest.fn(), remove: jest.fn() }
  }

  /** A signed delivery of `event`, verified by the real SDK. */
  function signedRequest(event: object) {
    const payload = JSON.stringify(event)
    return makeRequest(payload, { 'stripe-signature': signFixture(payload) })
  }

  const unprocessedRow = {
    id: 'evt_resend',
    type: 'customer.subscription.updated',
    receivedAt: new Date(),
    attempts: 3,
    lastError: 'HANDLER_FAILED',
    processedAt: null,
  }

  const fixture = { id: 'evt_resend', object: 'event', type: 'customer.subscription.updated', created: 1, data: { object: { id: 'sub_1' } } }

  beforeEach(() => {
    jest.clearAllMocks()
    mockReset(prismaMock)
    ;(getStripe as jest.Mock).mockResolvedValue(createFakeStripe().client)
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ stripeWebhookSecret: TEST_WEBHOOK_SECRET }))
    ;(addJob as jest.Mock).mockResolvedValue('evt_resend')
  })

  it('rejects a fixture signed with another secret', async () => {
    const payload = JSON.stringify(fixture)
    const response = await POST(makeRequest(payload, { 'stripe-signature': `${signFixture(payload)}0` }))

    expect(response.status).toBe(400)
  })

  it('enqueues a new signed event', async () => {
    const response = await POST(signedRequest(fixture))

    expect(response.status).toBe(200)
    expect(addJob).toHaveBeenCalledWith(JOB_TYPES.STRIPE_WEBHOOK, { eventId: 'evt_resend' }, { jobId: 'evt_resend' })
  })

  it('retries the failed job of an unprocessed event', async () => {
    prismaMock.stripeEvent.findUnique.mockResolvedValue(unprocessedRow)
    const job = fakeJob('failed')
    ;(findJob as jest.Mock).mockResolvedValue(job)

    const response = await POST(signedRequest(fixture))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ received: true, retried: true })
    expect(job.retry).toHaveBeenCalledTimes(1)
    expect(addJob).not.toHaveBeenCalled()
  })

  it.each(['waiting', 'active', 'delayed'])('leaves a %s job alone', async (state) => {
    const job = fakeJob(state)
    ;(findJob as jest.Mock).mockResolvedValue(job)

    const response = await POST(signedRequest(fixture))

    expect(response.status).toBe(200)
    expect(job.retry).not.toHaveBeenCalled()
    expect(addJob).not.toHaveBeenCalled()
  })

  it('enqueues again under the same id when the job record has expired', async () => {
    prismaMock.stripeEvent.findUnique.mockResolvedValue(unprocessedRow)
    ;(findJob as jest.Mock).mockResolvedValue(undefined)

    await POST(signedRequest(fixture))

    expect(addJob).toHaveBeenCalledWith(JOB_TYPES.STRIPE_WEBHOOK, { eventId: 'evt_resend' }, { jobId: 'evt_resend' })
  })

  it('a failed handler leaves the event unprocessed, and the resend retries its job', async () => {
    const stripe = createFakeStripe()
    ;(getStripe as jest.Mock).mockResolvedValue(stripe.client)
    const store = emptyStripeStore([subscriptionRow()])
    installStripeStore(prismaMock, store)
    stripe.events.set('evt_resend', stripeEvent('evt_resend', 'customer.subscription.updated', { id: 'sub_1' }, 1))
    stripe.failSubscriptionReads(new Error('database briefly down'))

    // The worker's last attempt fails; BullMQ keeps the job as failed.
    const queued = { id: 'evt_resend', data: { eventId: 'evt_resend' }, attemptsMade: 2, opts: { attempts: 3 } } as unknown as Job
    await expect(processStripeWebhook(queued)).rejects.toThrow('database briefly down')
    expect(store.events.get('evt_resend')).toMatchObject({ processedAt: null, lastError: 'HANDLER_FAILED' })

    const failedJob = fakeJob('failed')
    ;(findJob as jest.Mock).mockResolvedValue(failedJob)
    const response = await POST(signedRequest(fixture))

    expect(response.status).toBe(200)
    expect(failedJob.retry).toHaveBeenCalledTimes(1)
  })
})
