import { NextRequest, NextResponse } from "next/server"

import { getStripe } from "@/lib/stripe/client"
import { prisma } from "@/lib/prisma"
import { addJob } from "@/lib/queue/client"
import { JOB_TYPES } from "@/lib/queue/types"
import { rateLimit } from "@/lib/security/rate-limit"
import { createLogger } from "@/lib/utils/logger"

/**
 * Stripe delivers webhooks as POST requests that must be verified against the
 * raw request body, so this route must never be statically cached.
 */
export const dynamic = "force-dynamic"

const logger = createLogger("STRIPE_WEBHOOK")

/**
 * Rate limiter for the Stripe webhook endpoint. The endpoint is authenticated by
 * the Stripe signature (no admin auth), but is rate-limited to blunt abuse.
 */
const webhookRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // Generous — Stripe can burst-deliver
})

/**
 * POST /api/stripe/webhook
 *
 * Verifies the Stripe signature against the raw body, deduplicates events on
 * `StripeEvent(event.id)`, enqueues a `STRIPE_WEBHOOK` job for asynchronous
 * processing, and returns 200 quickly. All side effects happen in the job.
 *
 * - 400 on signature verification failure (never 5xx — Stripe would retry).
 * - 200 without re-enqueue when the event id was already seen (idempotency).
 * - 200 + enqueue for a valid, previously-unseen event.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await webhookRateLimiter(request)
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  const stripe = await getStripe()
  if (!stripe) {
    logger.warn("Received Stripe webhook but Stripe is not configured")
    return NextResponse.json(
      { error: "Stripe is not configured" },
      { status: 503 }
    )
  }

  const config = await prisma.config.findUnique({
    where: { id: "config" },
    select: { stripeWebhookSecret: true },
  })
  const webhookSecret = config?.stripeWebhookSecret
  if (!webhookSecret) {
    logger.warn("Received Stripe webhook but no webhook secret is configured")
    return NextResponse.json(
      { error: "Stripe webhook secret is not configured" },
      { status: 503 }
    )
  }

  // Raw body is required for HMAC signature verification — never parse JSON first.
  const rawBody = await request.text()
  const signature = request.headers.get("stripe-signature")

  let event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature ?? "", webhookSecret)
  } catch (error) {
    logger.warn("Stripe webhook signature verification failed", {
      error: error instanceof Error ? error.message : "unknown",
    })
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  // Idempotency: if we've already recorded this event id, do not re-enqueue.
  const existing = await prisma.stripeEvent.findUnique({
    where: { id: event.id },
    select: { id: true },
  })
  if (existing) {
    logger.info("Duplicate Stripe event ignored", {
      eventId: event.id,
      eventType: event.type,
    })
    return NextResponse.json({ received: true, duplicate: true })
  }

  await addJob(JOB_TYPES.STRIPE_WEBHOOK, { eventId: event.id }, { jobId: event.id })

  logger.info("Stripe webhook enqueued", {
    eventId: event.id,
    eventType: event.type,
  })

  return NextResponse.json({ received: true })
}
